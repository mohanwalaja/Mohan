<?php
/* ==========================================================================
 * TEST DOUBLE - never deployed, never loaded by production code.
 *
 * scripts/php-admin-api-bridge.mjs mounts the REAL api/mailer.php with its
 * class renamed to AstroMailerRealTransport and appends this subclass, so
 * every mailer helper (attachment budgets, part planning, ...) stays real and
 * ONLY the SMTP transport is replaced.
 *
 * Nothing is ever sent. Each message is appended to the JSON outbox named by
 * ASTRO_TEST_OUTBOX with the SHA-256 of every attachment, so a test can prove
 * the customer would receive exactly the bytes the admin uploaded.
 * ASTRO_TEST_MAIL_MODE=reject simulates an SMTP refusal.
 * ======================================================================== */

class AstroMailer extends AstroMailerRealTransport
{
    public static function sendEmailWithAttachments($toEmail, $toName, $subject, $htmlContent, $attachments = [], $smtpConfig = null, $inlineImages = [])
    {
        $outbox = getenv('ASTRO_TEST_OUTBOX');
        if (!is_string($outbox) || $outbox === '') {
            return ['success' => false, 'message' => 'ASTRO_TEST_OUTBOX is not set; the mail double refuses to run.'];
        }
        $accept = (getenv('ASTRO_TEST_MAIL_MODE') ?: 'accept') === 'accept';

        $recorded = [];
        foreach ((array) $attachments as $attachment) {
            $content = (string) ($attachment['content'] ?? '');
            // Record the embedded page rasters too, so a test can assert what
            // was EMAILED is print quality (≥ 2480 × 3508 px per A4 page = 300
            // dpi), not merely what the client claims to have rendered. Same
            // dictionary shape the API's quality gate reads.
            $raster = [];
            if (preg_match_all(
                '/\/Subtype\s*\/Image\b(?:(?!endobj)[\s\S])*?\/Width\s+(\d+)[\s\S]*?\/Height\s+(\d+)/',
                $content,
                $matches,
                PREG_SET_ORDER
            ) > 0) {
                foreach ($matches as $match) {
                    $raster[] = ['width' => (int) $match[1], 'height' => (int) $match[2]];
                }
            }
            $recorded[] = [
                'name' => (string) ($attachment['name'] ?? ''),
                'bytes' => strlen($content),
                'sha256' => hash('sha256', $content),
                'isPdf' => strncmp($content, '%PDF-', 5) === 0,
                'raster' => $raster,
            ];
        }

        $messages = is_file($outbox) ? (json_decode((string) file_get_contents($outbox), true) ?: []) : [];
        $messages[] = [
            'to' => (string) $toEmail,
            'toName' => (string) $toName,
            'subject' => (string) $subject,
            'attachments' => $recorded,
            // The assembled body, so a test can assert what the customer reads
            // (e.g. the "Rate your report" invitation of api/reviews.php).
            'html' => (string) $htmlContent,
            'inlineImages' => count((array) $inlineImages),
            'accepted' => $accept,
        ];
        file_put_contents($outbox, json_encode($messages, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

        return $accept
            ? ['success' => true, 'message' => 'Recorded by the test outbox; nothing was sent.']
            : ['success' => false, 'message' => 'SMTP delivery failed. Please check the server mail logs and retry.'];
    }
}
