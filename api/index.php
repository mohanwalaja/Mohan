<?php
/**
 * ASTRO SIVAM - API root banner.
 *
 * Returns a small JSON response so GET /api/ (and any accidental direct hit) is
 * harmless. Unmatched API routes answer with api/404.php. There is no PDF
 * diagnostics endpoint: PDFs are rendered in the browser only.
 */
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
// H2: strict CSP on every API response (JSON needs no capabilities at all).
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");

echo json_encode([
    'success' => true,
    'service' => 'ASTRO SIVAM API',
    'message' => 'ASTRO SIVAM API root. Endpoints live under /api/auth, /api/services, /api/admin and /api/payment.',
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
