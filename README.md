# ASTRO SIVAM (`astrosivam`)

Official Vedic astrology platform at **[astrosivam.com](https://astrosivam.com)** delivering authentic **Birth Jathagam**, **Marriage Compatibility (10 Poruthams)**, **Subha Muhurtham**, and **Vedic Baby Naming (Namakaran)** reports in **Tamil, English, and Hindi** — complete with a customer dashboard, admin daily review & batch approval portal, multi-currency payments (**Razorpay / PayPal**), verified **WhatsApp / Viber / Email** alerts & birthday wishes, and a deterministic local source-based astrologer assistant.

---

## Architecture & Stack

| Layer | Technology | Notes |
|---|---|---|
| **Frontend** | React 19 + TypeScript + Vite 6 + Tailwind CSS 4 | Route-split static SPA + prerendered SEO HTML (`pages/*.html`) |
| **Mobile Performance** | Lazy route chunks + intent prefetching | Only the shell + `HomePage` load initially; heavy astronomy, Baby Naming dictionaries, Leaflet maps, charts, and PDF rasterisers load strictly on demand inside `assets/` |
| **Report & Invoice PDFs** | 100% Browser Live-Preview Renderer (`200 DPI`) | Exact visual parity between Live Preview, downloaded PDFs, and emailed attachments (`jsPDF` + `html2canvas`); zero low-quality server-side PDF rendering |
| **Backend API** | PHP 8.1+ (`api/`) + MySQL (`InnoDB` / `utf8mb4`) | Runs directly on cPanel / Apache / LiteSpeed shared hosting without a Node daemon |
| **Astrology Engine** | TypeScript (`src/lib/astrology/`) + PHP (`api/astrology/engine.php`) | True Lahiri (Chitra Paksha) ephemeris kept byte-consistent via automated Node ↔ PHP parity tests |
| **AI Astrologer Chat** | Deterministic PHP + Curated Knowledge Base (`api/knowledge/`) | 100% local rule & chart engine with Tamil/English/Hindi support and zero external LLM API calls |

---

## Minimal cPanel `public_html` File Manager Layout

`npm run build:zip` generates a self-contained `dist.zip` designed to keep cPanel's **File Manager (`public_html/`)** minimal and clutter-free:

```text
public_html/
├── .htaccess          # HTTPS, HSTS, CSP, Brotli/Gzip negotiation, clean-URL & legacy asset rewrites
├── .well-known/       # RFC 9116 security.txt
├── api/               # Complete PHP API, astrology engine, knowledge base, and ops/backup scripts
├── assets/            # All hashed JS/CSS chunks, self-hosted fonts, brand icons/images, audio & scenes
├── pages/             # Prerendered per-route SEO HTML documents
├── index.html         # Main application entry shell (+ .br / .gz pre-compressed siblings)
├── 404.html           # Custom 404 document
├── favicon.ico        # Root browser ICO fallback
├── robots.txt         # Search crawler directives
├── sitemap.xml        # Canonical XML sitemap
├── site.webmanifest   # Web app manifest
└── sw.js              # Self-retiring service worker clean-up script
```

All historical audit records and operator runbooks remain cleanly organised under [`docs/`](docs/) in the repository (never scattered across the web root).

---

## Quick Start

```bash
npm ci                 # Install exact locked frontend & test dependencies
npm run dev            # Start Vite development server on 0.0.0.0
npm run lint           # TypeScript strict typecheck (tsc --noEmit)
npm test               # Run all 70 Node / TypeScript contract & parity suites
npm run test:php       # Run all 17 PHP backend suites (PHP 8.1+ CLI)
npm run build          # Production build + static SEO prerendering into dist/
npm run build:zip      # Build & verify minimal cPanel deployment archive (dist.zip)
```

### Composer Backend Dependency Lock

`composer.json` and `composer.lock` pin the single pure-PHP helper (`smalot/pdfparser` for uploaded PDF text extraction in the AI report helper):

```bash
composer install --no-dev --optimize-autoloader
```

---

## Verification & Parity Suites

- **`npm test`** — Runs all Node/TypeScript verification suites covering initial JS mobile budget, deployment folder shape, lockfile sync (`package-lock.json` & `composer.lock`), ephemeris accuracy against Swiss Ephemeris, Node ↔ PHP chart parity, 200 DPI email PDF gates, admin batch approval, security headers, CSRF/session hardening, and SEO prerendering.
- **`npm run parity:seed && npm run parity:php && npm run parity:compare`** — Verifies exact astronomical agreement between TypeScript and PHP engines.
- **`npm audit`** — Verifies zero known dependency vulnerabilities.

---

## Deployment & Operations Documentation

Detailed runbooks live in [`docs/`](docs/):

- [cPanel / BigRock Deployment Guide](docs/BIGROCK_CPANEL_DEPLOYMENT_GUIDE.md)
- [Authentication & Security Hardening](docs/AUTH_SECURITY_HARDENING.md)
- [Payment Webhook Idempotency & CI](docs/PAYMENT_WEBHOOK_IDEMPOTENCY_AND_CI.md)
- [Health Monitoring & Backup Verification](docs/HEALTH_MONITORING_AND_BACKUP_VERIFICATION.md)
- [Rate Limiting & Payment Recovery](docs/RATE_LIMITING_AND_PAYMENT_RECOVERY.md)
- [High-Quality PDF Delivery Architecture](docs/PDF_DELIVERY_QUALITY.md)
- [Cloudflare CDN Configuration](docs/CLOUDFLARE_CDN_SETUP.md)

---

## Security & Secrets

Live credentials belong strictly on the server inside `api/config.php` or environment variables (see `.env.example`). `.cpanel.yml`, `deploy_cpanel.sh`, and `scripts/create_dist_zip.py` preserve live `api/config.php` and runtime HMAC keys and never bundle development secrets into `dist.zip`.
