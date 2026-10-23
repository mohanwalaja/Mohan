<?php
/**
 * ASTRO SIVAM - PHP SMTP Mailer
 * Native PHP SMTP socket client + standard mail() fallback
 * Supports SSL (Port 465) / TLS (Port 587) with PDF attachment encoding
 *
 * Inline (Content-ID) images
 * --------------------------
 * Emails render the ASTRO SIVAM logo as an inline image referenced with
 * `cid:astrosivamlogo` instead of a remote URL. A remote URL is blocked by
 * default in Gmail, Outlook and Apple Mail ("click here to display images"),
 * which is why the logo appeared broken/missing in delivered mail. Inline
 * images travel inside the message itself, so they always display.
 *
 * Attachment descriptors accepted in $attachments / $inlineImages:
 *   ['name' => 'file.pdf', 'content' => <binary>, 'mime' => 'application/pdf']
 * Inline descriptors additionally require:
 *   ['cid' => 'astrosivamlogo', ...]
 */

require_once __DIR__ . '/branding.php';

/**
 * Per-message attachment budget, in *encoded* (MIME base64) bytes.
 *
 * A family bundle can contain up to six preview-quality reports plus one
 * invoice. The 25 MiB default is sized so a typical maximum family bundle fits
 * in one message, while unusually large PDFs still split safely. Configure the
 * budget to match the mail provider with FAMILY_EMAIL_MAX_ATTACHMENT_MB
 * (default 25) or FAMILY_EMAIL_MAX_ATTACHMENT_BYTES.
 */
function astro_max_attachment_encoded_bytes() {
    $asMb = getenv('FAMILY_EMAIL_MAX_ATTACHMENT_MB');
    if ($asMb !== false && is_numeric($asMb) && (float)$asMb >= 1 && (float)$asMb <= 200) {
        return (int)round((float)$asMb * 1048576);
    }
    $asBytes = getenv('FAMILY_EMAIL_MAX_ATTACHMENT_BYTES');
    if ($asBytes !== false && is_numeric($asBytes) && (int)$asBytes >= 524288 && (int)$asBytes <= 209715200) {
        return (int)$asBytes;
    }
    return 25 * 1048576;
}

/** Account for MIME base64 expansion, line wrapping, and attachment headers. */
function astro_mime_encoded_size($rawBytes) {
    $safe = max(0, (int)$rawBytes);
    $base64Bytes = (int)(ceil(($safe + 2) / 3) * 4);
    // AstroMailer::buildMimeBody() uses chunk_split(), which inserts CRLF
    // after every 76 base64 characters. Count those line breaks too so the
    // budget reflects the actual wire size rather than only the base64 text.
    $lineBreakBytes = (int)(ceil($base64Bytes / 76) * 2);
    return $base64Bytes + $lineBreakBytes + 512;
}

/**
 * Split attachments, in order, into the fewest messages that respect the budget.
 *
 * @return array{parts: array<int, array<int, array>>, oversize: array<int, string>, total_bytes: int, max_encoded_bytes: int}
 */
function astro_plan_attachment_parts($attachments, $maxEncodedBytes = null) {
    $budget = is_numeric($maxEncodedBytes) && (int)$maxEncodedBytes >= 524288
        ? (int)$maxEncodedBytes
        : astro_max_attachment_encoded_bytes();

    $list = is_array($attachments) ? array_values(array_filter($attachments)) : [];
    $parts = [];
    $oversize = [];
    $current = [];
    $currentSize = 0;
    $totalBytes = 0;

    foreach ($list as $attachment) {
        $rawBytes = strlen((string)($attachment['content'] ?? ''));
        $encodedBytes = astro_mime_encoded_size($rawBytes);
        $totalBytes += $rawBytes;

        if ($encodedBytes > $budget) {
            if (!empty($current)) {
                $parts[] = $current;
                $current = [];
                $currentSize = 0;
            }
            $oversize[] = (string)($attachment['name'] ?? 'unnamed-attachment');
            $parts[] = [$attachment];
            continue;
        }

        if (!empty($current) && $currentSize + $encodedBytes > $budget) {
            $parts[] = $current;
            $current = [];
            $currentSize = 0;
        }
        $current[] = $attachment;
        $currentSize += $encodedBytes;
    }

    if (!empty($current)) $parts[] = $current;
    if (empty($parts)) $parts[] = [];

    return [
        'parts' => $parts,
        'oversize' => $oversize,
        'total_bytes' => $totalBytes,
        'max_encoded_bytes' => $budget
    ];
}

/**
 * Resolve the recipient for contact-form inquiries.
 *
 * Priority: CONTACT_INQUIRY_TO -> emailSettings.adminNotificationEmail ->
 * generalSettings.contactEmail -> the site's ADMIN_EMAIL. A candidate that is
 * not a syntactically valid address (typo, copied placeholder, CRLF injection
 * attempt) is skipped, so one bad setting can never silently drop inquiries.
 *
 * @return string A valid address, or '' when nothing usable is configured.
 */
function astro_resolve_contact_recipient($envValue, $adminNotificationEmail, $contactEmail, $fallback = '') {
    $default = trim((string)$fallback);
    if ($default === '' && defined('ADMIN_EMAIL')) {
        $default = (string)ADMIN_EMAIL;
    }
    foreach ([$envValue, $adminNotificationEmail, $contactEmail, $default] as $candidate) {
        $value = trim((string)$candidate);
        if ($value === '') continue;
        if (filter_var($value, FILTER_VALIDATE_EMAIL)) return $value;
    }
    return '';
}

/**
 * Wrap inner HTML inside ASTRO SIVAM's Royal Maroon & Gold parchment card so
 * auth OTP codes, password resets, admin tests, and birthday wishes share the
 * exact same trustworthy, mobile-responsive layout across Gmail, Apple Mail,
 * and Outlook.
 */
function astro_wrap_branded_email_html($subtitle, $innerBodyHtml, $footerLine = '') {
    $safeSubtitle = htmlspecialchars((string)$subtitle, ENT_QUOTES, 'UTF-8');
    $year = date('Y');
    $extraFooter = $footerLine !== ''
        ? '<p style="margin:6px 0 0;color:#8a7d65;font-size:11px;line-height:1.5;">' . $footerLine . '</p>'
        : '';

    return "<!DOCTYPE html>\r\n"
        . "<html lang=\"en\">\r\n"
        . "<head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1.0\"></head>\r\n"
        . "<body style=\"margin:0;padding:0;background-color:#f6f1e6;font-family:Georgia,'Times New Roman',Arial,sans-serif;color:#2b1d12;\">\r\n"
        . "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background-color:#f6f1e6;padding:20px 10px;\">\r\n"
        . "<tr><td align=\"center\">\r\n"
        . "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"max-width:600px;background-color:#fffdf9;border:2px solid #c9962c;border-radius:14px;overflow:hidden;\">\r\n"
        . "<tr><td align=\"center\" style=\"background:linear-gradient(135deg,#7a1f1f 0%,#4a1010 100%);background-color:#7a1f1f;padding:24px 20px;border-bottom:3px solid #c9962c;\">\r\n"
        . astro_email_logo_tag(54) . "\r\n"
        . "<h1 style=\"margin:10px 0 0;font-size:21px;letter-spacing:1.5px;color:#f7d788;font-family:Georgia,serif;\">ASTRO SIVAM</h1>\r\n"
        . "<p style=\"margin:5px 0 0;font-size:12px;letter-spacing:0.6px;color:#fde68a;font-family:Arial,sans-serif;\">{$safeSubtitle}</p>\r\n"
        . "</td></tr>\r\n"
        . "<tr><td style=\"padding:26px 24px;font-family:Arial,sans-serif;font-size:14px;line-height:1.65;color:#33261b;\">\r\n"
        . $innerBodyHtml . "\r\n"
        . "</td></tr>\r\n"
        . "<tr><td align=\"center\" style=\"background-color:#f9f4ea;border-top:1px solid #eadcc2;padding:14px 20px;font-family:Arial,sans-serif;\">\r\n"
        . "<p style=\"margin:0;color:#7a6a52;font-size:11px;\">&copy; {$year} ASTRO SIVAM &middot; Traditional Vedic Astrology</p>\r\n"
        . $extraFooter . "\r\n"
        . "</td></tr>\r\n"
        . "</table>\r\n"
        . "</td></tr>\r\n"
        . "</table>\r\n"
        . "</body></html>";
}

class AstroMailer
{
    /** Optional callable seam used strictly by automated PHP tests. */
    public static $testTransport = null;

    /** Strip header CR/LF characters so display names and subjects are injection-safe. */
    private static function cleanHeaderText($value)
    {
        return trim((string)preg_replace('/[\r\n]+/', ' ', (string)$value));
    }

    /** Generate a unique RFC 5322 Message-ID matched to the sender domain. */
    private static function makeMessageId($fromEmail)
    {
        $domain = 'astrosivam.com';
        $atPos = strrpos((string)$fromEmail, '@');
        if ($atPos !== false) {
            $candidate = preg_replace('/[^a-zA-Z0-9.-]/', '', substr((string)$fromEmail, $atPos + 1));
            if ($candidate !== '' && strpos($candidate, '.') !== false) {
                $domain = strtolower($candidate);
            }
        }
        return '<' . gmdate('YmdHis') . '.' . bin2hex(random_bytes(8)) . '@' . $domain . '>';
    }

    /** Convert HTML body into clean readable plain text for multipart/alternative. */
    public static function htmlToPlainText($html)
    {
        $clean = preg_replace('/<(style|script)\b[^>]*>.*?<\/\1>/is', '', (string)$html);
        $clean = preg_replace('/<\s*br\s*\/?>/i', "\n", (string)$clean);
        $clean = preg_replace('/<\/(p|div|h1|h2|h3|h4|li|tr)>/i', "\n", (string)$clean);
        $clean = html_entity_decode(strip_tags((string)$clean), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $lines = array_map(static function ($line) {
            return trim((string)preg_replace('/[ \t]+/', ' ', $line));
        }, explode("\n", (string)$clean));
        $collapsed = preg_replace("/\n{3,}/", "\n\n", implode("\n", $lines));
        $result = trim((string)$collapsed);
        return $result !== '' ? $result : 'ASTRO SIVAM notification';
    }
    /**
     * @param array $attachments  Regular (downloadable) attachments.
     * @param array|null $smtpConfig SMTP settings array.
     * @param array $inlineImages Images embedded in the HTML via Content-ID.
     */
    public static function sendEmailWithAttachments($toEmail, $toName, $subject, $htmlContent, $attachments = [], $smtpConfig = null, $inlineImages = [])
    {
        $smtpConfig = is_array($smtpConfig) ? $smtpConfig : [];
        $smtpHost = trim((string)($smtpConfig['smtpHost'] ?? ''));
        $smtpPort = (int)($smtpConfig['smtpPort'] ?? 587);
        $smtpUser = trim((string)($smtpConfig['smtpUsername'] ?? $smtpConfig['smtpUser'] ?? ''));
        $smtpPass = (string)($smtpConfig['smtpPassword'] ?? '');
        if (trim($smtpPass) === '') $smtpPass = (string)($smtpConfig['smtpPass'] ?? '');
        $smtpSecure = strtolower(trim((string)($smtpConfig['smtpSecure'] ?? '')));
        // Require encrypted SMTP. Standard implicit-TLS port 465 uses SSL;
        // submission ports 587/2525 upgrade with STARTTLS. Other ports may
        // explicitly select one of those modes in legacy configuration.
        if ($smtpPort === 465) $smtpSecure = 'ssl';
        elseif ($smtpPort === 587 || $smtpPort === 2525) $smtpSecure = 'tls';
        elseif (!in_array($smtpSecure, ['ssl', 'tls'], true)) $smtpSecure = 'tls';
        $toEmail = trim((string)$toEmail);
        $fromEmail = trim((string)($smtpConfig['senderEmail'] ?? $smtpConfig['fromEmail'] ?? (defined('ADMIN_EMAIL') ? ADMIN_EMAIL : 'admin@astrosivam.com')));
        $fromName = trim((string)($smtpConfig['senderName'] ?? $smtpConfig['fromName'] ?? 'ASTRO SIVAM'));
        $replyTo = trim((string)($smtpConfig['replyTo'] ?? $smtpConfig['replyToEmail'] ?? $fromEmail));
        // Normalize the legacy database keys and the current admin-UI keys to
        // the one shape consumed by the SMTP socket transport.
        $smtpConfig = array_merge($smtpConfig, [
            'smtpHost' => $smtpHost,
            'smtpPort' => $smtpPort,
            'smtpUser' => $smtpUser,
            'smtpPass' => $smtpPass,
            'smtpSecure' => $smtpSecure,
            'fromEmail' => $fromEmail,
            'fromName' => $fromName,
            'replyToEmail' => $replyTo
        ]);

        // Reject invalid header addresses before building MIME headers or invoking
        // mail(), preventing CR/LF header injection from profile/admin values.
        if (!filter_var($toEmail, FILTER_VALIDATE_EMAIL) || !filter_var($fromEmail, FILTER_VALIDATE_EMAIL) || !filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
            return ['success' => false, 'message' => 'Invalid recipient or sender email address.'];
        }

        if (is_callable(self::$testTransport)) {
            return (self::$testTransport)($toEmail, $toName, $subject, $htmlContent, (array)$attachments, $smtpConfig, (array)$inlineImages);
        }

        // HARD CAP: refuse to hand the mail transport a message that is almost
        // certain to be rejected (and that costs the customer their documents).
        // Callers that ship a large family bundle split it first; this is the
        // last line of defence for every other call site.
        $encodedAttachmentBytes = 0;
        foreach ((array)$attachments as $attachment) {
            $encodedAttachmentBytes += astro_mime_encoded_size(strlen((string)($attachment['content'] ?? '')));
        }
        foreach ((array)$inlineImages as $inlineImage) {
            $encodedAttachmentBytes += astro_mime_encoded_size(strlen((string)($inlineImage['content'] ?? '')));
        }
        $hardLimitBytes = astro_max_attachment_encoded_bytes();
        if ($encodedAttachmentBytes > $hardLimitBytes) {
            $limitMb = (int)round($hardLimitBytes / 1048576);
            $actualMb = round($encodedAttachmentBytes / 1048576, 1);
            error_log("ASTRO SIVAM: outgoing message blocked - attachments {$actualMb} MB exceed the {$limitMb} MB hard limit.");
            return [
                'success' => false,
                'message' => "Attachments total {$actualMb} MB (MIME encoded), which exceeds the {$limitMb} MB per-message limit. "
                    . 'Nothing was sent. Split the delivery into smaller emails, or raise FAMILY_EMAIL_MAX_ATTACHMENT_MB only if the SMTP provider allows larger messages.'
            ];
        }

        // Always guarantee the brand logo is available as an inline image, even
        // if a caller forgets to pass it, as long as the HTML actually uses it.
        if (empty($inlineImages) && strpos($htmlContent, 'cid:' . ASTRO_LOGO_CID) !== false) {
            $inlineImages = astro_inline_logo_attachment();
        }

        // If the logo file is not present on this host, point the tag at the
        // public URL instead of leaving a broken-image placeholder behind.
        if (empty($inlineImages)) {
            $htmlContent = str_replace('cid:' . ASTRO_LOGO_CID, astro_logo_absolute_url(), $htmlContent);
        }

        $hasRealSmtpPassword = trim($smtpPass) !== '' && strpos($smtpPass, '•') === false && !preg_match('/^\*{4,}$/', trim($smtpPass));

        // When SMTP credentials are configured, failure is a failure: do not
        // silently switch to PHP mail() and claim the configured SMTP worked.
        if ($smtpHost !== '' && $smtpUser !== '' && $hasRealSmtpPassword) {
            try {
                return self::sendViaSmtpSocket($toEmail, $toName, $subject, $htmlContent, $attachments, $smtpConfig, $inlineImages);
            } catch (Throwable $e) {
                error_log('ASTRO SIVAM SMTP delivery failed: ' . $e->getMessage());
                return ['success' => false, 'message' => 'SMTP delivery failed. Please check the server mail logs and retry.'];
            }
        }

        // If SMTP is not configured, native mail() can still be used when the
        // hosting provider exposes a local MTA. Its result only means accepted
        // by that local transport, not guaranteed inbox delivery.
        return self::sendViaNativeMail($toEmail, $toName, $subject, $htmlContent, $attachments, $fromEmail, $fromName, $replyTo, $inlineImages);
    }

    /**
     * Build the MIME body shared by both transports.
     *
     * Structure:
     *   multipart/mixed
     *     +- multipart/related
     *     |    +- multipart/alternative
     *     |    |    +- text/plain (UTF-8)
     *     |    |    +- text/html  (UTF-8, RFC 5322 line-length safe)
     *     |    +- image/* (inline, Content-ID)
     *     +- application/pdf (attachments)
     */
    private static function buildMimeBody($htmlContent, $attachments, $inlineImages, $outerBoundary, $innerBoundary)
    {
        $altBoundary = "==Alt_Boundary_x" . bin2hex(random_bytes(16)) . "x";
        $plainText = self::htmlToPlainText($htmlContent);
        // Keep every HTML line comfortably under RFC 5322's 998-byte ceiling so
        // MTAs never split mid-attribute in single-line templates.
        $lineSafeHtml = preg_replace('/>\s*</', ">\r\n<", (string)$htmlContent);

        $body = "--{$outerBoundary}\r\n";
        $body .= "Content-Type: multipart/related; boundary=\"{$innerBoundary}\"\r\n";
        $body .= "\r\n";

        $body .= "--{$innerBoundary}\r\n";
        $body .= "Content-Type: multipart/alternative; boundary=\"{$altBoundary}\"\r\n\r\n";

        // --- Plain-text part (prevents MIME_HTML_ONLY spam score penalties) ---
        $body .= "--{$altBoundary}\r\n";
        $body .= "Content-Type: text/plain; charset=UTF-8\r\n";
        $body .= "Content-Transfer-Encoding: base64\r\n\r\n";
        $body .= chunk_split(base64_encode($plainText)) . "\r\n\r\n";

        // --- HTML part ---
        $body .= "--{$altBoundary}\r\n";
        $body .= "Content-Type: text/html; charset=UTF-8\r\n";
        $body .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
        $body .= $lineSafeHtml . "\r\n\r\n";

        $body .= "--{$altBoundary}--\r\n\r\n";

        // --- Inline images (cid:) ---
        foreach ((array) $inlineImages as $img) {
            $cid = trim((string) ($img['cid'] ?? ''), '<> ');
            $content = $img['content'] ?? '';
            if ($cid === '' || $content === '') {
                continue;
            }
            $filename = !empty($img['name']) ? $img['name'] : ($cid . '.png');
            $mime = !empty($img['mime']) ? $img['mime'] : 'image/png';
            $safeName = preg_replace('/["\r\n]/', '', $filename);

            $body .= "--{$innerBoundary}\r\n";
            $body .= "Content-Type: {$mime}; name=\"{$safeName}\"\r\n";
            $body .= "Content-Transfer-Encoding: base64\r\n";
            $body .= "Content-ID: <{$cid}>\r\n";
            $body .= "Content-Disposition: inline; filename=\"{$safeName}\"\r\n\r\n";
            $body .= chunk_split(base64_encode($content)) . "\r\n\r\n";
        }

        $body .= "--{$innerBoundary}--\r\n\r\n";

        // --- Regular attachments ---
        foreach ((array) $attachments as $att) {
            $filename = !empty($att['name']) ? $att['name'] : 'attachment.pdf';
            $content = !empty($att['content']) ? $att['content'] : '';
            $safeName = preg_replace('/["\r\n]/', '', $filename);

            $body .= "--{$outerBoundary}\r\n";
            $body .= "Content-Type: application/pdf; name=\"{$safeName}\"\r\n";
            $body .= "Content-Description: {$safeName}\r\n";
            $body .= "Content-Disposition: attachment; filename=\"{$safeName}\"; size=" . strlen($content) . ";\r\n";
            $body .= "Content-Transfer-Encoding: base64\r\n\r\n";
            $body .= chunk_split(base64_encode($content)) . "\r\n\r\n";
        }

        $body .= "--{$outerBoundary}--";

        return $body;
    }

    private static function sendViaNativeMail($toEmail, $toName, $subject, $htmlContent, $attachments, $fromEmail, $fromName, $replyTo, $inlineImages = [])
    {
        $fromName = self::cleanHeaderText($fromName);
        $toName = self::cleanHeaderText($toName);
        $subject = self::cleanHeaderText($subject);

        $outerBoundary = "==Multipart_Boundary_x" . bin2hex(random_bytes(16)) . "x";
        $innerBoundary = "==Related_Boundary_x" . bin2hex(random_bytes(16)) . "x";

        $headers = "Date: " . date('r') . "\r\n";
        $headers .= "Message-ID: " . self::makeMessageId($fromEmail) . "\r\n";
        $headers .= "From: =?UTF-8?B?" . base64_encode($fromName) . "?= <{$fromEmail}>\r\n";
        $headers .= "Reply-To: {$replyTo}\r\n";
        $headers .= "Return-Path: {$fromEmail}\r\n";
        $headers .= "X-Mailer: ASTRO-SIVAM-VedicEngine/1.0\r\n";
        $headers .= "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: multipart/mixed; boundary=\"{$outerBoundary}\"\r\n";

        $body = self::buildMimeBody($htmlContent, $attachments, $inlineImages, $outerBoundary, $innerBoundary);

        $to = !empty($toName) ? "=?UTF-8?B?" . base64_encode($toName) . "?= <{$toEmail}>" : $toEmail;
        $encodedSubject = "=?UTF-8?B?" . base64_encode($subject) . "?=";

        $sent = @mail($to, $encodedSubject, $body, $headers, "-f{$fromEmail}");
        return [
            'success' => $sent,
            'message' => $sent ? 'Accepted by PHP local mail transport; final inbox delivery is not confirmed.' : 'PHP local mail transport returned false'
        ];
    }

    private static function sendViaSmtpSocket($toEmail, $toName, $subject, $htmlContent, $attachments, $config, $inlineImages = [])
    {
        $host = trim((string) ($config['smtpHost'] ?? ''));
        $port = intval($config['smtpPort'] ?? 465);
        $user = (string) ($config['smtpUser'] ?? '');
        $pass = (string) ($config['smtpPass'] ?? '');
        $secure = strtolower(trim((string) ($config['smtpSecure'] ?? 'ssl')));
        $fromEmail = trim((string) (!empty($config['fromEmail']) ? $config['fromEmail'] : $user));
        $fromName = self::cleanHeaderText(!empty($config['fromName']) ? $config['fromName'] : 'ASTRO SIVAM');
        $replyTo = trim((string) (!empty($config['replyToEmail']) ? $config['replyToEmail'] : $fromEmail));
        $toName = self::cleanHeaderText($toName);
        $subject = self::cleanHeaderText($subject);

        if ($host === '' || $port < 1 || $port > 65535 || !filter_var($toEmail, FILTER_VALIDATE_EMAIL) ||
            !filter_var($fromEmail, FILTER_VALIDATE_EMAIL) || !filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
            throw new Exception('Invalid SMTP endpoint or email address.');
        }

        $implicitTls = $secure === 'ssl' || $port === 465;
        $startTls = !$implicitTls && ($secure === 'tls' || $port === 587 || $port === 2525);
        if (!$implicitTls && !$startTls) {
            throw new Exception('SMTP authentication requires implicit TLS or STARTTLS.');
        }

        // Explicitly require trusted certificates and host-name verification for
        // both implicit TLS and the subsequent STARTTLS upgrade.
        $sslContext = stream_context_create([
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true,
                'allow_self_signed' => false,
                'peer_name' => $host,
                'SNI_enabled' => true
            ]
        ]);
        $target = ($implicitTls ? 'tls://' : 'tcp://') . $host . ':' . $port;
        $socket = @stream_socket_client($target, $errno, $errstr, 10, STREAM_CLIENT_CONNECT, $sslContext);
        if (!$socket) {
            throw new Exception('Could not connect to the SMTP server (network error ' . intval($errno) . ').');
        }

        try {
            stream_set_timeout($socket, 15);
            self::readSmtpResponse($socket, [220], 'server greeting');

            $senderDomain = '';
            $atIdx = strrpos($fromEmail, '@');
            if ($atIdx !== false) {
                $senderDomain = preg_replace('/[^a-zA-Z0-9.-]/', '', substr($fromEmail, $atIdx + 1));
            }
            $heloName = preg_replace('/[^a-zA-Z0-9.-]/', '', (string) ($_SERVER['SERVER_NAME'] ?? ''));
            if ($heloName === '' || strpos($heloName, '.') === false) {
                $heloName = ($senderDomain !== '' && strpos($senderDomain, '.') !== false) ? $senderDomain : 'astrosivam.com';
            }
            self::writeSmtpData($socket, "EHLO {$heloName}\r\n", 'EHLO');
            self::readSmtpResponse($socket, [250], 'EHLO');

            if ($startTls) {
                self::writeSmtpData($socket, "STARTTLS\r\n", 'STARTTLS');
                self::readSmtpResponse($socket, [220], 'STARTTLS');
                $crypto = @stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
                if ($crypto !== true) {
                    throw new Exception('TLS negotiation failed.');
                }
                self::writeSmtpData($socket, "EHLO {$heloName}\r\n", 'EHLO after STARTTLS');
                self::readSmtpResponse($socket, [250], 'EHLO after STARTTLS');
            }

            self::writeSmtpData($socket, "AUTH LOGIN\r\n", 'AUTH LOGIN');
            self::readSmtpResponse($socket, [334], 'SMTP authentication');
            self::writeSmtpData($socket, base64_encode($user) . "\r\n", 'SMTP username');
            self::readSmtpResponse($socket, [334], 'SMTP username');
            self::writeSmtpData($socket, base64_encode($pass) . "\r\n", 'SMTP password');
            self::readSmtpResponse($socket, [235], 'SMTP authentication');

            self::writeSmtpData($socket, "MAIL FROM: <{$fromEmail}>\r\n", 'MAIL FROM');
            self::readSmtpResponse($socket, [250], 'MAIL FROM');
            self::writeSmtpData($socket, "RCPT TO: <{$toEmail}>\r\n", 'RCPT TO');
            self::readSmtpResponse($socket, [250, 251], 'RCPT TO');
            self::writeSmtpData($socket, "DATA\r\n", 'DATA');
            self::readSmtpResponse($socket, [354], 'DATA');

            $outerBoundary = "==Multipart_Boundary_x" . bin2hex(random_bytes(16)) . "x";
            $innerBoundary = "==Related_Boundary_x" . bin2hex(random_bytes(16)) . "x";
            $headers = "Date: " . date('r') . "\r\n";
            $headers .= "Message-ID: " . self::makeMessageId($fromEmail) . "\r\n";
            $headers .= "From: =?UTF-8?B?" . base64_encode($fromName) . "?= <{$fromEmail}>\r\n";
            $headers .= "To: " . (!empty($toName) ? "=?UTF-8?B?" . base64_encode($toName) . "?= <{$toEmail}>" : $toEmail) . "\r\n";
            $headers .= "Reply-To: {$replyTo}\r\n";
            $headers .= "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\n";
            $headers .= "X-Mailer: ASTRO-SIVAM-VedicEngine/1.0\r\n";
            $headers .= "MIME-Version: 1.0\r\n";
            $headers .= "Content-Type: multipart/mixed; boundary=\"{$outerBoundary}\"\r\n\r\n";

            $body = self::buildMimeBody($htmlContent, $attachments, $inlineImages, $outerBoundary, $innerBoundary);
            // RFC 5321 dot-stuffing: escape line-leading dots, then terminate DATA.
            $payload = preg_replace('/^\./m', '..', $headers . $body . "\r\n");
            self::writeSmtpData($socket, $payload . "\r\n.\r\n", 'message body');
            self::readSmtpResponse($socket, [250], 'message acceptance');

            // A 250 response after DATA means the SMTP server accepted the mail.
            self::writeSmtpData($socket, "QUIT\r\n", 'QUIT');
            return ['success' => true, 'message' => 'Email accepted by the configured SMTP transport.'];
        } finally {
            if (is_resource($socket)) fclose($socket);
        }
    }

    private static function writeSmtpData($socket, $data, $stage)
    {
        $length = strlen($data);
        $offset = 0;
        while ($offset < $length) {
            $written = @fwrite($socket, substr($data, $offset));
            if ($written === false || $written === 0) {
                throw new Exception('SMTP connection closed during ' . $stage . '.');
            }
            $offset += $written;
        }
    }

    private static function readSmtpResponse($socket, $acceptedCodes = null, $stage = 'SMTP response')
    {
        $response = '';
        while ($line = @fgets($socket, 515)) {
            $response .= $line;
            if (strlen($line) >= 4 && substr($line, 3, 1) === ' ') break;
        }
        $meta = stream_get_meta_data($socket);
        if (($meta['timed_out'] ?? false) || $response === '') {
            throw new Exception('SMTP timed out during ' . $stage . '.');
        }
        $code = intval(substr($response, 0, 3));
        if ($acceptedCodes !== null && !in_array($code, $acceptedCodes, true)) {
            throw new Exception('SMTP rejected ' . $stage . ' (response ' . $code . ').');
        }
        return $response;
    }

}
