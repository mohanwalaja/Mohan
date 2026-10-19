<?php
/**
 * ASTRO SIVAM - WhatsApp & Viber Order Alert Dispatcher
 * -----------------------------------------------------
 * Sends chat alerts to customers on two lifecycle events:
 *   1. order_confirmed - the customer's order was placed successfully
 *   2. order_completed - admin approved it and the report + invoice were emailed
 *
 * Channels:
 *   WhatsApp - Meta WhatsApp Cloud API (template or free-text message),
 *              or any gateway via a generic webhook (WATI / AiSensy / Interakt / etc.)
 *   Viber    - Official Viber Bot (PA) REST API
 *              (https://chatapi.viber.com/pa/send_message),
 *              or Viber Business Messages via a partner webhook
 *              (Infobip / MessageBird / etc.)
 *
 * Configuration is stored in system_settings.general_settings under the
 * "chatAlertSettings" key (managed from Admin Portal > WhatsApp & Viber Alerts).
 * Environment variables work as an alternative:
 *   WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_TEMPLATE_NAME,
 *   VIBER_AUTH_TOKEN, VIBER_SENDER_NAME
 *
 * SAFETY RULE: alerts are strictly best-effort. A chat gateway outage must
 * NEVER block order placement or order approval - every network call is
 * wrapped and failures are only written to the PHP error log + audit trail.
 */

class AstroChatAlerts
{
    const EVENTS = ['order_confirmed', 'order_completed'];

    const DEFAULT_ORDER_CONFIRMED_MESSAGE = "Namaste {customer_name},\n\nYour order {order_number} for {service_name} ({amount}) has been received successfully and is confirmed.\n\nStatus: {status}\nPayment method: {payment_method}\n\nOur astrologers will now prepare your report. You will get another alert with delivery details once it is complete.\n\nWarm regards,\nASTRO SIVAM Team";

    const DEFAULT_ORDER_COMPLETED_MESSAGE = "Namaste {customer_name},\n\nGreat news! Your order {order_number} for {service_name} is now COMPLETE.\n\nYour official Vedic Astrology Report PDF and Tax Invoice PDF have been emailed to {customer_email}. Please save both attachments for your records.\n\nThank you for choosing ASTRO SIVAM.\n\nWarm regards,\nASTRO SIVAM Team";

    // ------------------------------------------------------------------
    // Settings
    // ------------------------------------------------------------------

    /** Load chat alert settings (general_settings.chatAlertSettings + env fallbacks). */
    public static function getAlertSettings($pdo = null): array
    {
        $stored = [];
        if ($pdo) {
            try {
                $stmt = $pdo->query("SELECT general_settings FROM system_settings ORDER BY id ASC LIMIT 1");
                $row = $stmt ? $stmt->fetch() : false;
                if ($row) {
                    $general = json_decode($row['general_settings'] ?? '{}', true) ?: [];
                    $stored = is_array($general['chatAlertSettings'] ?? null) ? $general['chatAlertSettings'] : [];
                }
            } catch (\Throwable $e) {
                error_log('AstroChatAlerts: failed to read alert settings: ' . $e->getMessage());
            }
        }

        $envWhatsappToken = getenv('WHATSAPP_ACCESS_TOKEN') ?: '';
        $envWhatsappPhoneId = getenv('WHATSAPP_PHONE_NUMBER_ID') ?: '';
        $envWhatsappTemplate = getenv('WHATSAPP_TEMPLATE_NAME') ?: '';
        $envViberToken = getenv('VIBER_AUTH_TOKEN') ?: '';
        $envViberSender = getenv('VIBER_SENDER_NAME') ?: 'ASTRO SIVAM';

        $defaults = [
            'enabled' => true,
            'notifyOrderConfirmed' => true,
            'notifyOrderCompleted' => true,
            'whatsapp' => [
                'enabled' => false,
                'provider' => 'meta',            // 'meta' | 'webhook'
                'phoneNumberId' => $envWhatsappPhoneId,
                'accessToken' => $envWhatsappToken,
                'apiVersion' => 'v21.0',
                'templateName' => $envWhatsappTemplate,   // approved utility template, e.g. order_update
                'templateLanguage' => 'en',
                'webhookUrl' => '',
                'messageType' => $envWhatsappTemplate !== '' ? 'template' : 'text'
            ],
            'viber' => [
                'enabled' => false,
                'provider' => 'viber_bot',       // 'viber_bot' | 'webhook'
                'authToken' => $envViberToken,
                'senderName' => $envViberSender,
                'webhookUrl' => ''
            ],
            'orderConfirmedMessage' => self::DEFAULT_ORDER_CONFIRMED_MESSAGE,
            'orderCompletedMessage' => self::DEFAULT_ORDER_COMPLETED_MESSAGE
        ];

        return self::arrayMergeDeep($defaults, $stored);
    }

    private static function arrayMergeDeep(array $base, array $over): array
    {
        foreach ($over as $k => $v) {
            if (is_array($v) && isset($base[$k]) && is_array($base[$k]) && !self::isListArray($v)) {
                $base[$k] = self::arrayMergeDeep($base[$k], $v);
            } else {
                $base[$k] = $v;
            }
        }
        return $base;
    }

    /** PHP 7.x compatible replacement for array_is_list() (PHP 8.1+). */
    private static function isListArray(array $arr): bool
    {
        if (function_exists('array_is_list')) {
            return array_is_list($arr);
        }
        $i = 0;
        foreach ($arr as $k => $_) {
            if ($k !== $i++) {
                return false;
            }
        }
        return true;
    }

    // ------------------------------------------------------------------
    // Message rendering & phone normalization
    // ------------------------------------------------------------------

    /** Replace {placeholder} tokens in a message template. */
    public static function renderTemplate(string $template, array $vars): string
    {
        $map = [];
        foreach ($vars as $k => $v) {
            $map['{' . $k . '}'] = (string)$v;
        }
        return trim(strtr($template, $map));
    }

    /**
     * Normalize a mobile number toward E.164 (+countrycode...).
     * Falls back to a per-country dialing code when the number is local.
     */
    public static function normalizePhone(?string $raw, ?string $country = null): string
    {
        $raw = trim((string)$raw);
        if ($raw === '') {
            return '';
        }

        // Keep a single leading '+', strip every other non-digit.
        $hasPlus = (strpos($raw, '+') === 0) || (strpos($raw, '00') === 0);
        $digits = preg_replace('/\D+/', '', $raw);

        // '00' is the international access prefix - drop it (the '+' marker remains).
        if (strpos($raw, '00') === 0 && strpos($digits, '00') === 0) {
            $digits = substr($digits, 2);
        }

        $countryCodes = [
            'fiji' => '679', 'india' => '91', 'usa' => '1', 'united states' => '1',
            'canada' => '1', 'australia' => '61', 'new zealand' => '64',
            'united kingdom' => '44', 'uk' => '44', 'singapore' => '65',
            'malaysia' => '60', 'south africa' => '27', 'uae' => '971',
            'united arab emirates' => '971', 'qatar' => '974', 'kuwait' => '965',
            'sri lanka' => '94', 'bangladesh' => '880', 'pakistan' => '92',
            'nepal' => '977', 'philippines' => '63', 'indonesia' => '62',
            'samoa' => '685', 'tonga' => '676', 'vanuatu' => '678',
            'solomon islands' => '677', 'papua new guinea' => '675'
        ];

        if ($hasPlus) {
            return '+' . $digits;
        }

        // Local format heuristics: strip trunk '0', then prefix the country code.
        $cc = $countryCodes[strtolower(trim((string)$country))] ?? '';
        if ($cc !== '') {
            if (strpos($digits, '0') === 0) {
                $digits = substr($digits, 1);
            }
            return '+' . $cc . $digits;
        }

        // Unknown country: if it already looks international (10+ digits), just add '+'.
        if (strlen($digits) >= 10) {
            return '+' . $digits;
        }
        return $digits;
    }

    /** Standard placeholder set shared by both events. */
    private static function buildVars(array $order, array $extra = []): array
    {
        $serviceNames = [
            'BIRTH_JATHAGAM' => 'Birth Jathagam (Horoscope Reading)',
            'MARRIAGE_COMPATIBILITY' => 'Marriage Compatibility (Jathagam Porutham)',
            'BABY_NAMING' => 'Baby Naming Certificate (Vetha Naamakaranam)',
            'MUHURTHAM' => 'Subha Muhurtham Dates (6-Month Calendar)'
        ];
        $serviceType = $order['service_type'] ?? ($order['serviceType'] ?? '');
        $amount = $order['amount'] ?? 0;
        $currency = $order['currency'] ?? (defined('DEFAULT_CURRENCY') ? DEFAULT_CURRENCY : 'USD');

        return array_merge([
            'customer_name' => $order['user_name'] ?? ($order['userName'] ?? 'User'),
            'customer_email' => $order['user_email'] ?? ($order['userEmail'] ?? ''),
            'order_number' => $order['order_number'] ?? ($order['orderNumber'] ?? ''),
            'service_name' => $serviceNames[$serviceType] ?? str_replace('_', ' ', (string)$serviceType),
            'amount' => trim($currency . ' ' . number_format((float)$amount, 2)),
            'currency' => $currency,
            'status' => $order['status'] ?? 'PENDING',
            'payment_method' => $order['payment_method'] ?? ($order['paymentMethod'] ?? 'N/A'),
            'site_name' => 'ASTRO SIVAM'
        ], $extra);
    }

    // ------------------------------------------------------------------
    // HTTP transport
    // ------------------------------------------------------------------

    /**
     * SSRF guard for admin-configured gateway webhook URLs.
     *
     * A chat-gateway URL is only fetched when ALL of these hold:
     *   1. the scheme is exactly https (no http, no protocol-relative URLs);
     *   2. no userinfo is embedded (user:pass@host can obscure the real host);
     *   3. the host is neither "localhost" nor a literal private/reserved IP;
     *   4. every DNS A/AAAA address the hostname resolves to is public —
     *      unresolvable names fail closed.
     *
     * This stops a webhook pointing at 127.0.0.1, 10/8, 169.254.169.254 (cloud
     * metadata), or any other internal address from ever receiving the order
     * payload. The official Meta/Viber endpoints are hardcoded https URLs and
     * are unaffected.
     */
    public static function isValidWebhookUrl($url): bool
    {
        $url = trim((string)$url);
        if ($url === '') {
            return false;
        }
        $parts = parse_url($url);
        if (!is_array($parts)) {
            return false;
        }
        if (strtolower((string)($parts['scheme'] ?? '')) !== 'https') {
            return false;
        }
        if (isset($parts['user']) || isset($parts['pass'])) {
            return false;
        }
        $host = (string)($parts['host'] ?? '');
        if ($host === '' || strtolower($host) === 'localhost') {
            return false;
        }
        // Literal IP: must be globally routable (rejects private, loopback,
        // link-local, reserved and multicast ranges for both families).
        if (filter_var($host, FILTER_VALIDATE_IP)) {
            return filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false;
        }

        $ips = [];
        $v4 = @gethostbynamel($host);
        if (is_array($v4)) {
            $ips = array_merge($ips, $v4);
        }
        if (function_exists('dns_get_record')) {
            $aaaa = @dns_get_record($host, DNS_AAAA);
            if (is_array($aaaa)) {
                foreach ($aaaa as $rec) {
                    if (!empty($rec['ipv6'])) {
                        $ips[] = $rec['ipv6'];
                    }
                }
            }
            if (empty($ips)) {
                $arecs = @dns_get_record($host, DNS_A);
                if (is_array($arecs)) {
                    foreach ($arecs as $rec) {
                        if (!empty($rec['ip'])) {
                            $ips[] = $rec['ip'];
                        }
                    }
                }
            }
        }
        // Unresolvable hostname: fail closed rather than fetching blind.
        if (empty($ips)) {
            return false;
        }
        foreach ($ips as $ip) {
            if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
                return false;
            }
        }
        return true;
    }

    private static function httpPostJson(string $url, array $payload, array $headers = []): array
    {
        $json = json_encode($payload, JSON_UNESCAPED_UNICODE);
        $headers[] = 'Content-Type: application/json';

        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => $json,
                CURLOPT_HTTPHEADER => $headers,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CONNECTTIMEOUT => 8,
                CURLOPT_TIMEOUT => 15,
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_SSL_VERIFYHOST => 2,
                // A validated webhook must not be able to bounce the order
                // payload elsewhere via a 30x to an internal address.
                CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_MAXREDIRS => 0,
                CURLOPT_PROTOCOLS => CURLPROTO_HTTPS
            ]);
            $body = curl_exec($ch);
            $errno = curl_errno($ch);
            $err = curl_error($ch);
            $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            if ($errno !== 0) {
                return ['ok' => false, 'status' => 0, 'body' => '', 'error' => $err];
            }
            $ok = $status >= 200 && $status < 300;
            return ['ok' => $ok, 'status' => $status, 'body' => (string)$body, 'error' => $ok ? '' : 'HTTP ' . $status];
        }

        // Minimal stream fallback when cURL is unavailable on the host.
        // Mirrors the cURL options above: no redirects (SSRF), full TLS checks.
        $ctx = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => implode("\r\n", $headers),
                'content' => $json,
                'timeout' => 15,
                'ignore_errors' => true,
                'follow_location' => 0,
                'max_redirects' => 0
            ],
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true
            ]
        ]);
        $body = @file_get_contents($url, false, $ctx);
        $status = 0;
        if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0] . ' ', $m)) {
            $status = (int)$m[1];
        }
        $ok = $body !== false && $status >= 200 && $status < 300;
        return ['ok' => $ok, 'status' => $status, 'body' => (string)$body, 'error' => $ok ? '' : 'HTTP ' . $status];
    }

    // ------------------------------------------------------------------
    // Channel senders
    // ------------------------------------------------------------------

    /** Send one message through the configured WhatsApp transport. */
    public static function sendWhatsApp(array $settings, string $phone, string $message, array $vars = []): array
    {
        $wa = $settings['whatsapp'] ?? [];
        if (empty($wa['enabled'])) {
            return ['success' => false, 'channel' => 'whatsapp', 'message' => 'WhatsApp alerts are disabled'];
        }
        if ($phone === '') {
            return ['success' => false, 'channel' => 'whatsapp', 'message' => 'No mobile number on the customer profile'];
        }

        $provider = $wa['provider'] ?? 'meta';

        if ($provider === 'webhook') {
            $url = trim((string)($wa['webhookUrl'] ?? ''));
            if ($url === '') {
                return ['success' => false, 'channel' => 'whatsapp', 'message' => 'WhatsApp webhook URL is not configured'];
            }
            if (!self::isValidWebhookUrl($url)) {
                return ['success' => false, 'channel' => 'whatsapp', 'message' => 'WhatsApp webhook URL is invalid or not allowed: an https URL with a public host is required'];
            }
            $res = self::httpPostJson($url, [
                'channel' => 'whatsapp',
                'event' => $vars['event'] ?? '',
                'to' => $phone,
                'message' => $message,
                'vars' => $vars
            ]);
            return [
                'success' => $res['ok'],
                'channel' => 'whatsapp',
                'message' => $res['ok'] ? 'Delivered via webhook gateway' : 'Webhook error: ' . $res['error'] . ' ' . substr($res['body'], 0, 300)
            ];
        }

        // Meta WhatsApp Cloud API
        $token = trim((string)($wa['accessToken'] ?? ''));
        $phoneId = trim((string)($wa['phoneNumberId'] ?? ''));
        if ($token === '' || $phoneId === '') {
            return ['success' => false, 'channel' => 'whatsapp', 'message' => 'WhatsApp Phone Number ID / Access Token missing'];
        }

        $apiVersion = trim((string)($wa['apiVersion'] ?? 'v21.0')) ?: 'v21.0';
        $url = 'https://graph.facebook.com/' . $apiVersion . '/' . rawurlencode($phoneId) . '/messages';

        $messageType = $wa['messageType'] ?? (empty($wa['templateName']) ? 'text' : 'template');

        // A verification code must travel as free text: an order-update
        // template would replace the code with order placeholders and the
        // customer could never verify. (Free text needs the 24-hour
        // customer window or a webhook transport — a provider rejection is
        // surfaced to the customer by the OTP endpoint, never hidden.)
        if ($messageType === 'template' && !empty($wa['templateName']) && ($vars['event'] ?? '') !== 'verification_code') {
            $templateParams = [];
            // Fixed parameter order matching typical order-update templates:
            // {{1}} customer name  {{2}} order number  {{3}} service  {{4}} amount  {{5}} status
            foreach (['customer_name', 'order_number', 'service_name', 'amount', 'status'] as $key) {
                $templateParams[] = ['type' => 'text', 'text' => (string)($vars[$key] ?? '-')];
            }
            $payload = [
                'messaging_product' => 'whatsapp',
                'recipient_type' => 'individual',
                'to' => ltrim($phone, '+'),
                'type' => 'template',
                'template' => [
                    'name' => $wa['templateName'],
                    'language' => ['code' => $wa['templateLanguage'] ?? 'en'],
                    'components' => [['type' => 'body', 'parameters' => $templateParams]]
                ]
            ];
        } else {
            $payload = [
                'messaging_product' => 'whatsapp',
                'recipient_type' => 'individual',
                'to' => ltrim($phone, '+'),
                'type' => 'text',
                'text' => ['preview_url' => false, 'body' => substr($message, 0, 4096)]
            ];
        }

        $res = self::httpPostJson($url, $payload, ['Authorization: Bearer ' . $token]);

        // Viber-style template sends cannot carry the full body; for 'text'
        // the payload already includes it.
        $detail = $res['ok'] ? 'Delivered via WhatsApp Cloud API' : 'WhatsApp API error: ' . $res['error'] . ' ' . substr($res['body'], 0, 300);
        return ['success' => $res['ok'], 'channel' => 'whatsapp', 'message' => $detail];
    }

    /** Send one message through the configured Viber transport. */
    public static function sendViber(array $settings, string $phone, string $message, array $vars = []): array
    {
        $vb = $settings['viber'] ?? [];
        if (empty($vb['enabled'])) {
            return ['success' => false, 'channel' => 'viber', 'message' => 'Viber alerts are disabled'];
        }
        if ($phone === '') {
            return ['success' => false, 'channel' => 'viber', 'message' => 'No mobile number on the customer profile'];
        }

        $provider = $vb['provider'] ?? 'viber_bot';

        if ($provider === 'webhook') {
            $url = trim((string)($vb['webhookUrl'] ?? ''));
            if ($url === '') {
                return ['success' => false, 'channel' => 'viber', 'message' => 'Viber webhook URL is not configured'];
            }
            if (!self::isValidWebhookUrl($url)) {
                return ['success' => false, 'channel' => 'viber', 'message' => 'Viber webhook URL is invalid or not allowed: an https URL with a public host is required'];
            }
            $res = self::httpPostJson($url, [
                'channel' => 'viber',
                'event' => $vars['event'] ?? '',
                'to' => $phone,
                'message' => $message,
                'vars' => $vars
            ]);
            return [
                'success' => $res['ok'],
                'channel' => 'viber',
                'message' => $res['ok'] ? 'Delivered via webhook gateway' : 'Webhook error: ' . $res['error'] . ' ' . substr($res['body'], 0, 300)
            ];
        }

        // Official Viber Bot (PA) REST API
        $token = trim((string)($vb['authToken'] ?? ''));
        if ($token === '') {
            return ['success' => false, 'channel' => 'viber', 'message' => 'Viber auth token missing'];
        }

        $payload = [
            // Unique Viber user id - a subscribed user's phone (E.164) is also
            // accepted by the PA API for users who have interacted with the bot.
            'receiver' => ltrim($phone, '+'),
            'min_api_version' => 7,
            'sender' => ['name' => (string)($vb['senderName'] ?? 'ASTRO SIVAM')],
            'type' => 'text',
            'text' => substr($message, 0, 7000)
        ];

        $res = self::httpPostJson('https://chatapi.viber.com/pa/send_message', $payload, ['X-Viber-Auth-Token: ' . $token]);

        // Viber answers HTTP 200 with a JSON status code - surface it.
        $ok = $res['ok'];
        $detail = 'Delivered via Viber Bot API';
        if ($res['body'] !== '') {
            $decoded = json_decode($res['body'], true);
            if (is_array($decoded) && isset($decoded['status']) && (int)$decoded['status'] !== 0) {
                $ok = false;
                $detail = 'Viber API error ' . $decoded['status'] . ': ' . ($decoded['status_message'] ?? 'unknown');
            } elseif (!$ok) {
                $detail = 'Viber API error: ' . $res['error'] . ' ' . substr($res['body'], 0, 300);
            }
        } elseif (!$ok) {
            $detail = 'Viber API error: ' . $res['error'];
        }

        return ['success' => $ok, 'channel' => 'viber', 'message' => $detail];
    }

    // ------------------------------------------------------------------
    // Orchestrators
    // ------------------------------------------------------------------

    /**
     * Fire WhatsApp + Viber alerts for a lifecycle event.
     *
     * @param object|null $pdo    Database handle (for settings + audit logging).
     * @param string      $event  'order_confirmed' | 'order_completed'.
     * @param array       $orders One or more order rows (DB snake_case or API camelCase).
     * @param array|null  $settings Optional pre-loaded settings (avoids a second read).
     * @return array Per-channel results: [['channel'=>..., 'success'=>..., 'message'=>...], ...]
     */
    public static function sendOrderAlerts($pdo, string $event, array $orders, ?array $settings = null): array
    {
        try {
            if (!in_array($event, self::EVENTS, true) || empty($orders)) {
                return [];
            }

            $settings = $settings ?? self::getAlertSettings($pdo);
            if (empty($settings['enabled'])) {
                return [];
            }
            if ($event === 'order_confirmed' && empty($settings['notifyOrderConfirmed'])) {
                return [];
            }
            if ($event === 'order_completed' && empty($settings['notifyOrderCompleted'])) {
                return [];
            }
            $waOn = !empty($settings['whatsapp']['enabled']);
            $vbOn = !empty($settings['viber']['enabled']);
            if (!$waOn && !$vbOn) {
                return [];
            }

            $first = $orders[0];
            $count = count($orders);
            $vars = self::buildVars($first);
            $vars['event'] = $event;

            if ($count > 1) {
                $vars['order_number'] = ($vars['order_number'] !== '' ? $vars['order_number'] : 'GROUP') . ' (+' . ($count - 1) . ' more chart' . ($count > 2 ? 's' : '') . ')';
                $vars['service_name'] = $count . '-chart family bundle';
                $total = 0.0;
                $currency = $vars['currency'];
                foreach ($orders as $o) {
                    $total += (float)($o['amount'] ?? 0);
                }
                $vars['amount'] = trim($currency . ' ' . number_format($total, 2));
                $vars['status'] = $first['status'] ?? 'PENDING';
            }

            $template = $event === 'order_confirmed'
                ? (string)($settings['orderConfirmedMessage'] ?? self::DEFAULT_ORDER_CONFIRMED_MESSAGE)
                : (string)($settings['orderCompletedMessage'] ?? self::DEFAULT_ORDER_COMPLETED_MESSAGE);
            $message = self::renderTemplate($template, $vars);

            $phone = self::normalizePhone(
                $first['user_mobile'] ?? ($first['userMobile'] ?? ''),
                $first['country'] ?? ($first['billingCountry'] ?? '')
            );

            $results = [];
            if ($waOn) {
                $results[] = self::sendWhatsApp($settings, $phone, $message, $vars);
            }
            if ($vbOn) {
                $results[] = self::sendViber($settings, $phone, $message, $vars);
            }

            foreach ($results as $r) {
                if (!$r['success']) {
                    error_log("AstroChatAlerts [{$event}] {$r['channel']} -> {$phone}: {$r['message']}");
                }
            }

            self::auditResults($pdo, $event, $vars['order_number'], $results);
            return $results;
        } catch (\Throwable $e) {
            // Absolute last resort - alerts must never break the order flow.
            error_log('AstroChatAlerts fatal: ' . $e->getMessage());
            return [];
        }
    }

    /** Send a diagnostic test message to an arbitrary phone number. */
    public static function sendTestAlert(array $settings, string $phone, array $channels = ['whatsapp', 'viber']): array
    {
        $phone = self::normalizePhone($phone);
        $vars = [
            'event' => 'test',
            'customer_name' => 'Test User',
            'customer_email' => 'test@astrosivam.com',
            'order_number' => 'ORD-TEST1',
            'service_name' => 'Diagnostic Test',
            'amount' => 'USD 0.00',
            'currency' => defined('DEFAULT_CURRENCY') ? DEFAULT_CURRENCY : 'USD',
            'status' => 'TEST',
            'payment_method' => 'N/A',
            'site_name' => 'ASTRO SIVAM'
        ];
        $message = self::renderTemplate("ASTRO SIVAM chat alert test.\nNamaste {customer_name}, this is a diagnostic message confirming that WhatsApp/Viber alerts are configured correctly.\n\nOrder: {order_number}\nTime: " . date('Y-m-d H:i:s') . ' UTC', $vars);

        $results = [];
        if (in_array('whatsapp', $channels, true)) {
            $results[] = self::sendWhatsApp($settings, $phone, $message, $vars);
        }
        if (in_array('viber', $channels, true)) {
            $results[] = self::sendViber($settings, $phone, $message, $vars);
        }
        return $results;
    }

    // ------------------------------------------------------------------
    // Verified chat-delivery contacts (customer profile feature)
    //
    // A customer may save ONE mobile number in their profile and verify it
    // separately on WhatsApp and/or Viber with a one-time code sent in that
    // app. Once an app is verified, delivered orders ALSO send the actual
    // report + invoice PDFs to that app — in addition to email, which
    // remains the official delivery channel. Verification state lives in
    // user_chat_contacts; pending codes (hashed only) in chat_number_otps.
    // ------------------------------------------------------------------

    /** Create the contact/OTP tables on first use (CREATE is kept by design). */
    public static function ensureContactTables($pdo): void
    {
        static $ready = false;
        if ($ready || !$pdo) return;
        $ready = true;
        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS `user_chat_contacts` (
                `user_id` VARCHAR(64) NOT NULL PRIMARY KEY,
                `phone_e164` VARCHAR(32) NOT NULL,
                `whatsapp_verified_at` DATETIME NULL,
                `viber_verified_at` DATETIME NULL,
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
            $pdo->exec("CREATE TABLE IF NOT EXISTS `chat_number_otps` (
                `user_id` VARCHAR(64) NOT NULL,
                `channel` ENUM('whatsapp','viber') NOT NULL,
                `phone_e164` VARCHAR(32) NOT NULL,
                `otp_hash` VARCHAR(128) NOT NULL,
                `expires_at` DATETIME NOT NULL,
                `attempts` INT NOT NULL DEFAULT 0,
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`user_id`, `channel`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        } catch (\Throwable $e) {
            error_log('AstroChatAlerts: chat contact tables could not be ensured (run api/migrations/017_chat_delivery_contacts.sql): ' . $e->getMessage());
        }
    }

    /** The customer's saved chat contact row, or null. */
    public static function getChatContact($pdo, string $userId): ?array
    {
        if (!$pdo || $userId === '') return null;
        self::ensureContactTables($pdo);
        try {
            $stmt = $pdo->prepare("SELECT * FROM user_chat_contacts WHERE user_id = ? LIMIT 1");
            $stmt->execute([$userId]);
            $row = $stmt->fetch();
            return $row ?: null;
        } catch (\Throwable $e) {
            error_log('AstroChatAlerts: could not load chat contact: ' . $e->getMessage());
            return null;
        }
    }

    /** True when the admin has switched this channel on AND configured a transport. */
    public static function channelConfigured(array $settings, string $channel): bool
    {
        if (empty($settings['enabled'])) return false;
        if ($channel === 'whatsapp') {
            $wa = $settings['whatsapp'] ?? [];
            if (empty($wa['enabled'])) return false;
            if (($wa['provider'] ?? 'meta') === 'webhook') {
                return trim((string)($wa['webhookUrl'] ?? '')) !== '';
            }
            return trim((string)($wa['phoneNumberId'] ?? '')) !== '' && trim((string)($wa['accessToken'] ?? '')) !== '';
        }
        if ($channel === 'viber') {
            $vb = $settings['viber'] ?? [];
            if (empty($vb['enabled'])) return false;
            if (($vb['provider'] ?? 'viber_bot') === 'webhook') {
                return trim((string)($vb['webhookUrl'] ?? '')) !== '';
            }
            return trim((string)($vb['authToken'] ?? '')) !== '';
        }
        return false;
    }

    /** Profile-facing state: never exposes provider credentials. */
    public static function chatContactState($pdo, string $userId): array
    {
        $settings = self::getAlertSettings($pdo);
        $contact = self::getChatContact($pdo, $userId);
        return [
            'phone' => (string)($contact['phone_e164'] ?? ''),
            'whatsappVerified' => !empty($contact['whatsapp_verified_at']),
            'viberVerified' => !empty($contact['viber_verified_at']),
            'whatsappAvailable' => self::channelConfigured($settings, 'whatsapp'),
            'viberAvailable' => self::channelConfigured($settings, 'viber'),
        ];
    }

    /**
     * Save (or replace) the customer's chat number. Replacing it with a
     * DIFFERENT number clears both verifications — a new number must be
     * verified again on each app. Returns the fresh profile state.
     */
    public static function saveChatContactNumber($pdo, string $userId, string $rawPhone, ?string $country = null): array
    {
        self::ensureContactTables($pdo);
        $phone = self::normalizePhone($rawPhone, $country);
        if (!preg_match('/^\+\d{7,15}$/', $phone)) {
            return ['success' => false, 'message' => 'Please enter the full mobile number with country code (for example +91 98765 43210).'];
        }
        $existing = self::getChatContact($pdo, $userId);
        if ($existing && (string)$existing['phone_e164'] === $phone) {
            return ['success' => true, 'message' => 'Number saved.', 'state' => self::chatContactState($pdo, $userId)];
        }
        $stmt = $pdo->prepare("INSERT INTO user_chat_contacts (user_id, phone_e164, whatsapp_verified_at, viber_verified_at, created_at, updated_at)
            VALUES (?, ?, NULL, NULL, NOW(), NOW())
            ON DUPLICATE KEY UPDATE phone_e164 = VALUES(phone_e164), whatsapp_verified_at = NULL, viber_verified_at = NULL, updated_at = NOW()");
        $stmt->execute([$userId, $phone]);
        $pdo->prepare("DELETE FROM chat_number_otps WHERE user_id = ?")->execute([$userId]);
        return ['success' => true, 'message' => 'Number saved. Verify it on WhatsApp and/or Viber to receive your report and invoice PDFs there as well.', 'state' => self::chatContactState($pdo, $userId)];
    }

    /** Remove the saved number and any pending codes. */
    public static function removeChatContact($pdo, string $userId): void
    {
        self::ensureContactTables($pdo);
        $pdo->prepare("DELETE FROM user_chat_contacts WHERE user_id = ?")->execute([$userId]);
        $pdo->prepare("DELETE FROM chat_number_otps WHERE user_id = ?")->execute([$userId]);
    }

    /** OTPs are stored only as HMAC hashes (same construction as auth OTPs). */
    public static function hashChatOtp(string $userId, string $channel, string $phone, string $otp): string
    {
        $secret = defined('APP_SECRET_KEY') ? APP_SECRET_KEY : '';
        return hash_hmac('sha256', $otp . '|' . $userId . '|' . $channel . '|' . $phone, $secret);
    }

    /**
     * Generate a 6-digit code, store its hash (10-minute expiry, one code
     * per channel, 60-second resend cooldown) and send it in the chosen
     * app. The plain code is never stored and never returned.
     */
    public static function requestChatOtp($pdo, string $userId, string $channel): array
    {
        self::ensureContactTables($pdo);
        if (!in_array($channel, ['whatsapp', 'viber'], true)) {
            return ['success' => false, 'message' => 'Unknown channel.'];
        }
        $contact = self::getChatContact($pdo, $userId);
        if (!$contact) {
            return ['success' => false, 'message' => 'Save your mobile number first, then request the verification code.'];
        }
        $settings = self::getAlertSettings($pdo);
        if (!self::channelConfigured($settings, $channel)) {
            return ['success' => false, 'message' => ($channel === 'whatsapp' ? 'WhatsApp' : 'Viber') . ' delivery is not switched on yet. Please contact support.'];
        }
        $phone = (string)$contact['phone_e164'];

        $existing = $pdo->prepare("SELECT created_at FROM chat_number_otps WHERE user_id = ? AND channel = ? LIMIT 1");
        $existing->execute([$userId, $channel]);
        $last = $existing->fetch();
        if ($last && strtotime((string)$last['created_at']) > time() - 60) {
            return ['success' => false, 'message' => 'A code was just sent. Please wait a minute before asking for another.'];
        }

        $otp = (string)random_int(100000, 999999);
        $stmt = $pdo->prepare("INSERT INTO chat_number_otps (user_id, channel, phone_e164, otp_hash, expires_at, attempts, created_at)
            VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE), 0, NOW())
            ON DUPLICATE KEY UPDATE phone_e164 = VALUES(phone_e164), otp_hash = VALUES(otp_hash), expires_at = VALUES(expires_at), attempts = 0, created_at = NOW()");
        $stmt->execute([$userId, $channel, $phone, self::hashChatOtp($userId, $channel, $phone, $otp)]);

        $message = "Your ASTRO SIVAM verification code is {$otp}. It expires in 10 minutes. Please do not share this code with anyone.";
        $sent = $channel === 'whatsapp'
            ? self::sendWhatsApp($settings, $phone, $message, ['event' => 'verification_code'])
            : self::sendViber($settings, $phone, $message, ['event' => 'verification_code']);
        if (empty($sent['success'])) {
            $pdo->prepare("DELETE FROM chat_number_otps WHERE user_id = ? AND channel = ?")->execute([$userId, $channel]);
            error_log('AstroChatAlerts: verification code send failed (' . $channel . ' -> ' . $phone . '): ' . ($sent['message'] ?? ''));
            return ['success' => false, 'message' => 'We could not send the code via ' . ($channel === 'whatsapp' ? 'WhatsApp' : 'Viber') . ' right now. Please check the number and try again, or contact support.'];
        }
        return ['success' => true, 'message' => 'Verification code sent to ' . $phone . ' on ' . ($channel === 'whatsapp' ? 'WhatsApp' : 'Viber') . '. It expires in 10 minutes.'];
    }

    /** Check a code (max 5 attempts), mark that app verified, burn the code. */
    public static function confirmChatOtp($pdo, string $userId, string $channel, string $otp): array
    {
        self::ensureContactTables($pdo);
        if (!in_array($channel, ['whatsapp', 'viber'], true)) {
            return ['success' => false, 'message' => 'Unknown channel.'];
        }
        $otp = preg_replace('/\D+/', '', $otp);
        $contact = self::getChatContact($pdo, $userId);
        if (!$contact) {
            return ['success' => false, 'message' => 'Save your mobile number first.'];
        }
        $stmt = $pdo->prepare("SELECT * FROM chat_number_otps WHERE user_id = ? AND channel = ? LIMIT 1");
        $stmt->execute([$userId, $channel]);
        $row = $stmt->fetch();
        if (!$row) {
            return ['success' => false, 'message' => 'No code is waiting. Please request a new verification code.'];
        }
        if ((int)$row['attempts'] >= 5) {
            $pdo->prepare("DELETE FROM chat_number_otps WHERE user_id = ? AND channel = ?")->execute([$userId, $channel]);
            return ['success' => false, 'message' => 'Too many wrong attempts. Please request a new code.'];
        }
        if (strtotime((string)$row['expires_at']) < time()) {
            $pdo->prepare("DELETE FROM chat_number_otps WHERE user_id = ? AND channel = ?")->execute([$userId, $channel]);
            return ['success' => false, 'message' => 'That code has expired. Please request a new one.'];
        }
        $expected = self::hashChatOtp($userId, $channel, (string)$contact['phone_e164'], $otp);
        if (!hash_equals((string)$row['otp_hash'], $expected)) {
            $pdo->prepare("UPDATE chat_number_otps SET attempts = attempts + 1 WHERE user_id = ? AND channel = ?")->execute([$userId, $channel]);
            return ['success' => false, 'message' => 'That code does not match. Please check and try again.'];
        }
        $column = $channel === 'whatsapp' ? 'whatsapp_verified_at' : 'viber_verified_at';
        $pdo->prepare("UPDATE user_chat_contacts SET `{$column}` = NOW(), updated_at = NOW() WHERE user_id = ?")->execute([$userId]);
        $pdo->prepare("DELETE FROM chat_number_otps WHERE user_id = ? AND channel = ?")->execute([$userId, $channel]);
        return ['success' => true, 'message' => ($channel === 'whatsapp' ? 'WhatsApp' : 'Viber') . ' verified. Your report and invoice PDFs will also be sent there when orders are delivered.', 'state' => self::chatContactState($pdo, $userId)];
    }

    // ------------------------------------------------------------------
    // Document delivery (report + invoice PDFs into the chat)
    // ------------------------------------------------------------------

    /** Multipart POST (Meta media upload). cURL first, manual multipart fallback. */
    private static function httpPostMultipart(string $url, array $fields, array $file, array $headers = []): array
    {
        if (function_exists('curl_init')) {
            $tmp = tempnam(sys_get_temp_dir(), 'wa_media_');
            if ($tmp === false) {
                return ['ok' => false, 'status' => 0, 'body' => '', 'error' => 'temp file unavailable'];
            }
            file_put_contents($tmp, (string)($file['content'] ?? ''));
            $post = $fields;
            $post['file'] = new \CURLFile($tmp, (string)($file['mime'] ?? 'application/pdf'), (string)($file['filename'] ?? 'document.pdf'));
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => $post,
                CURLOPT_HTTPHEADER => $headers,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CONNECTTIMEOUT => 8,
                CURLOPT_TIMEOUT => 30,
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_SSL_VERIFYHOST => 2,
                CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_PROTOCOLS => CURLPROTO_HTTPS
            ]);
            $body = curl_exec($ch);
            $errno = curl_errno($ch);
            $err = curl_error($ch);
            $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            @unlink($tmp);
            if ($errno !== 0) {
                return ['ok' => false, 'status' => 0, 'body' => '', 'error' => $err];
            }
            $ok = $status >= 200 && $status < 300;
            return ['ok' => $ok, 'status' => $status, 'body' => (string)$body, 'error' => $ok ? '' : 'HTTP ' . $status];
        }

        $boundary = '----AstroSivam' . bin2hex(random_bytes(8));
        $body = '';
        foreach ($fields as $name => $value) {
            $body .= "--{$boundary}\r\nContent-Disposition: form-data; name=\"{$name}\"\r\n\r\n{$value}\r\n";
        }
        $body .= "--{$boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"" . ($file['filename'] ?? 'document.pdf') . "\"\r\n"
            . 'Content-Type: ' . ($file['mime'] ?? 'application/pdf') . "\r\n\r\n" . (string)($file['content'] ?? '') . "\r\n--{$boundary}--\r\n";
        $headers[] = 'Content-Type: multipart/form-data; boundary=' . $boundary;
        $ctx = stream_context_create([
            'http' => ['method' => 'POST', 'header' => implode("\r\n", $headers), 'content' => $body, 'timeout' => 30, 'ignore_errors' => true, 'follow_location' => 0],
            'ssl' => ['verify_peer' => true, 'verify_peer_name' => true]
        ]);
        $resp = @file_get_contents($url, false, $ctx);
        $status = 0;
        if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0] . ' ', $m)) {
            $status = (int)$m[1];
        }
        $ok = $resp !== false && $status >= 200 && $status < 300;
        return ['ok' => $ok, 'status' => $status, 'body' => (string)$resp, 'error' => $ok ? '' : 'HTTP ' . $status];
    }

    /** Send ONE PDF document on WhatsApp (Meta upload+send, or webhook gateway). */
    public static function sendWhatsAppDocument(array $settings, string $phone, string $pdf, string $filename, string $caption = ''): array
    {
        $wa = $settings['whatsapp'] ?? [];
        if (empty($wa['enabled'])) {
            return ['success' => false, 'channel' => 'whatsapp', 'message' => 'WhatsApp alerts are disabled'];
        }
        if ($phone === '' || $pdf === '') {
            return ['success' => false, 'channel' => 'whatsapp', 'message' => 'Missing phone or document'];
        }
        if (strlen($pdf) > 16 * 1024 * 1024) {
            return ['success' => false, 'channel' => 'whatsapp', 'message' => 'Document exceeds the WhatsApp 16 MB limit'];
        }

        if (($wa['provider'] ?? 'meta') === 'webhook') {
            $url = trim((string)($wa['webhookUrl'] ?? ''));
            if ($url === '' || !self::isValidWebhookUrl($url)) {
                return ['success' => false, 'channel' => 'whatsapp', 'message' => 'WhatsApp webhook URL is not configured or not allowed'];
            }
            $res = self::httpPostJson($url, [
                'channel' => 'whatsapp',
                'event' => 'order_documents',
                'to' => $phone,
                'message' => $caption,
                'documents' => [[
                    'filename' => $filename,
                    'mimeType' => 'application/pdf',
                    'contentBase64' => base64_encode($pdf)
                ]]
            ]);
            return ['success' => $res['ok'], 'channel' => 'whatsapp', 'message' => $res['ok'] ? 'Document delivered via webhook gateway' : 'Webhook error: ' . $res['error'] . ' ' . substr($res['body'], 0, 300)];
        }

        $token = trim((string)($wa['accessToken'] ?? ''));
        $phoneId = trim((string)($wa['phoneNumberId'] ?? ''));
        if ($token === '' || $phoneId === '') {
            return ['success' => false, 'channel' => 'whatsapp', 'message' => 'WhatsApp Phone Number ID / Access Token missing'];
        }
        $apiVersion = trim((string)($wa['apiVersion'] ?? 'v21.0')) ?: 'v21.0';
        $base = 'https://graph.facebook.com/' . $apiVersion . '/' . rawurlencode($phoneId);

        $upload = self::httpPostMultipart(
            $base . '/media',
            ['messaging_product' => 'whatsapp'],
            ['content' => $pdf, 'filename' => $filename, 'mime' => 'application/pdf'],
            ['Authorization: Bearer ' . $token]
        );
        $mediaId = '';
        if ($upload['ok']) {
            $decoded = json_decode((string)$upload['body'], true);
            $mediaId = (string)($decoded['id'] ?? '');
        }
        if ($mediaId === '') {
            return ['success' => false, 'channel' => 'whatsapp', 'message' => 'WhatsApp media upload failed: ' . $upload['error'] . ' ' . substr((string)$upload['body'], 0, 300)];
        }

        $res = self::httpPostJson($base . '/messages', [
            'messaging_product' => 'whatsapp',
            'recipient_type' => 'individual',
            'to' => ltrim($phone, '+'),
            'type' => 'document',
            'document' => ['id' => $mediaId, 'filename' => $filename, 'caption' => substr($caption, 0, 1024)]
        ], ['Authorization: Bearer ' . $token]);
        return ['success' => $res['ok'], 'channel' => 'whatsapp', 'message' => $res['ok'] ? 'Document delivered via WhatsApp Cloud API' : 'WhatsApp API error: ' . $res['error'] . ' ' . substr($res['body'], 0, 300)];
    }

    /**
     * Send ONE PDF document on Viber. The partner webhook receives the file
     * bytes (base64). The official Viber Bot API cannot accept uploads — a
     * 'file' message must LINK to a hosted file — so the bot path points at
     * our own signed, expiring media URL for this exact order document.
     */
    public static function sendViberDocument(array $settings, string $phone, string $pdf, string $filename, string $caption, string $mediaUrl): array
    {
        $vb = $settings['viber'] ?? [];
        if (empty($vb['enabled'])) {
            return ['success' => false, 'channel' => 'viber', 'message' => 'Viber alerts are disabled'];
        }
        if ($phone === '' || $pdf === '') {
            return ['success' => false, 'channel' => 'viber', 'message' => 'Missing phone or document'];
        }

        if (($vb['provider'] ?? 'viber_bot') === 'webhook') {
            $url = trim((string)($vb['webhookUrl'] ?? ''));
            if ($url === '' || !self::isValidWebhookUrl($url)) {
                return ['success' => false, 'channel' => 'viber', 'message' => 'Viber webhook URL is not configured or not allowed'];
            }
            $res = self::httpPostJson($url, [
                'channel' => 'viber',
                'event' => 'order_documents',
                'to' => $phone,
                'message' => $caption,
                'documents' => [[
                    'filename' => $filename,
                    'mimeType' => 'application/pdf',
                    'contentBase64' => base64_encode($pdf)
                ]]
            ]);
            return ['success' => $res['ok'], 'channel' => 'viber', 'message' => $res['ok'] ? 'Document delivered via webhook gateway' : 'Webhook error: ' . $res['error'] . ' ' . substr($res['body'], 0, 300)];
        }

        $token = trim((string)($vb['authToken'] ?? ''));
        if ($token === '') {
            return ['success' => false, 'channel' => 'viber', 'message' => 'Viber auth token missing'];
        }
        if ($mediaUrl === '') {
            return ['success' => false, 'channel' => 'viber', 'message' => 'No hosted media URL available for the Viber file message'];
        }
        if ($caption !== '') {
            self::sendViber(array_merge($settings, []), $phone, $caption, ['event' => 'order_documents']);
        }
        $res = self::httpPostJson('https://chatapi.viber.com/pa/send_message', [
            'receiver' => ltrim($phone, '+'),
            'min_api_version' => 7,
            'sender' => ['name' => (string)($vb['senderName'] ?? 'ASTRO SIVAM')],
            'type' => 'file',
            'media' => $mediaUrl,
            'size' => strlen($pdf),
            'file_name' => $filename
        ], ['X-Viber-Auth-Token: ' . $token]);
        $ok = $res['ok'];
        $detail = 'Document delivered via Viber Bot API';
        $decoded = json_decode((string)$res['body'], true);
        if (is_array($decoded) && isset($decoded['status']) && (int)$decoded['status'] !== 0) {
            $ok = false;
            $detail = 'Viber API error ' . $decoded['status'] . ': ' . ($decoded['status_message'] ?? 'unknown');
        } elseif (!$ok) {
            $detail = 'Viber API error: ' . $res['error'] . ' ' . substr((string)$res['body'], 0, 300);
        }
        return ['success' => $ok, 'channel' => 'viber', 'message' => $detail];
    }

    /** Signed, expiring media token for the Viber bot file link (order + document scoped). */
    public static function signedMediaToken(string $orderId, string $kind, int $itemId = 0, int $ttlSeconds = 604800): string
    {
        if (!defined('APP_SECRET_KEY') || APP_SECRET_KEY === '') return '';
        $payload = json_encode([
            'oid' => $orderId,
            'kind' => $kind === 'invoice' ? 'invoice' : 'report',
            'item' => $itemId,
            'exp' => time() + max(60, $ttlSeconds)
        ]);
        $b64 = rtrim(strtr(base64_encode((string)$payload), '+/', '-_'), '=');
        return $b64 . '.' . hash_hmac('sha256', $b64, APP_SECRET_KEY);
    }

    /** Verify a signed media token; returns its payload or null. */
    public static function verifySignedMediaToken(string $token): ?array
    {
        if (!defined('APP_SECRET_KEY') || APP_SECRET_KEY === '') return null;
        $parts = explode('.', trim($token));
        if (count($parts) !== 2) return null;
        [$b64, $sig] = $parts;
        if (!hash_equals(hash_hmac('sha256', $b64, APP_SECRET_KEY), $sig)) return null;
        $json = base64_decode(strtr($b64, '-_', '+/'), true);
        $payload = $json === false ? null : json_decode($json, true);
        if (!is_array($payload) || empty($payload['oid']) || (int)($payload['exp'] ?? 0) < time()) return null;
        return $payload;
    }

    private static function mediaUrlFor(string $orderId, string $kind, int $itemId = 0): string
    {
        $token = self::signedMediaToken($orderId, $kind, $itemId);
        if ($token === '') return '';
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host = (string)($_SERVER['HTTP_HOST'] ?? 'astrosivam.com');
        return $scheme . '://' . $host . '/api/services/chat-media/' . $token;
    }

    /** Report + invoice PDFs for delivered orders, mirroring the email attachments. */
    private static function buildOrderDocuments($pdo, array $orders): array
    {
        $docs = [];
        try {
            require_once __DIR__ . '/astrology/engine.php';
            $first = $orders[0];

            // Legacy group (family bundle): one report per order + ONE family invoice.
            if (count($orders) > 1 || !empty($first['group_id'])) {
                foreach ($orders as $order) {
                    try {
                        $pdf = AstroEngine::generateReportPdf($order, null);
                        $docs[] = ['name' => 'ASTRO_SIVAM_Report_' . $order['order_number'] . '.pdf', 'content' => $pdf, 'orderId' => (string)$order['id'], 'kind' => 'report', 'itemId' => 0];
                    } catch (\Throwable $e) {
                        error_log('AstroChatAlerts: chat report build failed for ' . ($order['order_number'] ?? '') . ': ' . $e->getMessage());
                    }
                }
                try {
                    $groupId = (string)($first['group_id'] ?? ($orders[0]['order_number'] ?? 'GROUP'));
                    $docs[] = ['name' => 'ASTRO_SIVAM_Invoice_' . $groupId . '.pdf', 'content' => AstroEngine::generateFamilyInvoicePdf($orders, $groupId), 'orderId' => (string)$first['id'], 'kind' => 'invoice', 'itemId' => 0];
                } catch (\Throwable $e) {
                    error_log('AstroChatAlerts: chat family invoice build failed: ' . $e->getMessage());
                }
                return $docs;
            }

            $order = $first;
            $items = [];
            $usesItems = false;
            try {
                require_once __DIR__ . '/admin/order_items.php';
                $items = astro_order_items_all($pdo, (string)$order['id']);
                $usesItems = astro_order_uses_items($order, $items);
            } catch (\Throwable $e) {
                $usesItems = false;
            }

            if ($usesItems) {
                foreach ($items as $item) {
                    if ((string)($item['report_status'] ?? '') !== 'SENT') continue;
                    try {
                        $synthetic = astro_order_item_synthetic_order($order, $item);
                        $pdf = AstroEngine::generateReportPdf($synthetic, null);
                        $docs[] = ['name' => 'ASTRO_SIVAM_Report_' . $order['order_number'] . '_' . (int)$item['id'] . '.pdf', 'content' => $pdf, 'orderId' => (string)$order['id'], 'kind' => 'report', 'itemId' => (int)$item['id']];
                    } catch (\Throwable $e) {
                        error_log('AstroChatAlerts: chat item report build failed: ' . $e->getMessage());
                    }
                }
            } else {
                try {
                    $docs[] = ['name' => 'ASTRO_SIVAM_Report_' . $order['order_number'] . '.pdf', 'content' => AstroEngine::generateReportPdf($order, null), 'orderId' => (string)$order['id'], 'kind' => 'report', 'itemId' => 0];
                } catch (\Throwable $e) {
                    error_log('AstroChatAlerts: chat report build failed: ' . $e->getMessage());
                }
            }
            try {
                $docs[] = ['name' => 'ASTRO_SIVAM_Invoice_' . $order['order_number'] . '.pdf', 'content' => AstroEngine::generateInvoicePdf($order), 'orderId' => (string)$order['id'], 'kind' => 'invoice', 'itemId' => 0];
            } catch (\Throwable $e) {
                error_log('AstroChatAlerts: chat invoice build failed: ' . $e->getMessage());
            }
        } catch (\Throwable $e) {
            error_log('AstroChatAlerts: buildOrderDocuments failed: ' . $e->getMessage());
        }
        return array_values(array_filter($docs, static function ($doc) {
            return is_string($doc['content'] ?? null) && strlen($doc['content']) > 0 && strlen($doc['content']) <= 16 * 1024 * 1024;
        }));
    }

    /**
     * Additionally send the delivered report + invoice PDFs to the
     * customer's VERIFIED WhatsApp/Viber number(s). Email remains the
     * official delivery; this is strictly best-effort and never throws,
     * so it can never block or fail an approval.
     *
     * @param array $orders Delivered order rows (COMPLETED/GENERATED).
     */
    public static function sendOrderDocuments($pdo, array $orders): array
    {
        try {
            if (!$pdo || empty($orders)) return [];
            $delivered = array_values(array_filter($orders, static function ($o) {
                return in_array((string)($o['status'] ?? ''), ['COMPLETED', 'GENERATED'], true);
            }));
            if (empty($delivered)) return [];

            $userId = (string)($delivered[0]['user_id'] ?? ($delivered[0]['userId'] ?? ''));
            if ($userId === '') return [];
            $contact = self::getChatContact($pdo, $userId);
            if (!$contact) return [];

            $settings = self::getAlertSettings($pdo);
            $channels = [];
            if (!empty($contact['whatsapp_verified_at']) && self::channelConfigured($settings, 'whatsapp')) $channels[] = 'whatsapp';
            if (!empty($contact['viber_verified_at']) && self::channelConfigured($settings, 'viber')) $channels[] = 'viber';
            if (empty($channels)) return [];

            $documents = self::buildOrderDocuments($pdo, $delivered);
            if (empty($documents)) return [];

            $phone = (string)$contact['phone_e164'];
            $vars = self::buildVars($delivered[0]);
            $orderNumbers = implode(', ', array_map(static function ($o) { return (string)($o['order_number'] ?? ''); }, $delivered));
            $caption = 'Namaste ' . ($vars['customer_name'] ?? 'User') . ", your ASTRO SIVAM order {$orderNumbers} is complete. Your official Report PDF and Tax Invoice PDF are attached here as well — the same files were also emailed to " . ($vars['customer_email'] ?? 'your email') . '. Please save them for your records.';

            $results = [];
            foreach ($channels as $channel) {
                if ($channel === 'whatsapp') {
                    $results[] = self::sendWhatsApp($settings, $phone, $caption, ['event' => 'order_documents']);
                    foreach ($documents as $doc) {
                        $results[] = self::sendWhatsAppDocument($settings, $phone, $doc['content'], $doc['name'], 'ASTRO SIVAM — ' . $doc['name']);
                    }
                } else {
                    $results[] = self::sendViber($settings, $phone, $caption, ['event' => 'order_documents']);
                    foreach ($documents as $doc) {
                        $results[] = self::sendViberDocument($settings, $phone, $doc['content'], $doc['name'], '', self::mediaUrlFor($doc['orderId'], $doc['kind'], (int)$doc['itemId']));
                    }
                }
            }
            foreach ($results as $r) {
                if (empty($r['success'])) {
                    error_log("AstroChatAlerts [order_documents] {$r['channel']} -> {$phone}: {$r['message']}");
                }
            }
            self::auditResults($pdo, 'order_documents', $orderNumbers, $results);
            return $results;
        } catch (\Throwable $e) {
            // Chat document delivery must never break fulfilment.
            error_log('AstroChatAlerts: sendOrderDocuments failed: ' . $e->getMessage());
            return [];
        }
    }

    private static function auditResults($pdo, string $event, string $orderNumber, array $results): void
    {
        if (!$pdo || empty($results)) {
            return;
        }
        try {
            $parts = [];
            foreach ($results as $r) {
                $parts[] = $r['channel'] . '=' . ($r['success'] ? 'OK' : 'FAIL(' . substr($r['message'], 0, 120) . ')');
            }
            // audit_logs expects an actor; customer alerts are system-generated.
            logAudit($pdo, 'system', 'Chat Alerts', 'system', 'CHAT_ALERT_SENT', "Event {$event} for {$orderNumber}: " . implode(' | ', $parts));
        } catch (\Throwable $e) {
            error_log('AstroChatAlerts: audit logging failed: ' . $e->getMessage());
        }
    }
}
