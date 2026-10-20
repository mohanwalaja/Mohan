# ASTRO SIVAM - Complete cPanel File Manager & Database Master Installation Guide

This step-by-step guide walks you through setting up **ASTRO SIVAM** on **BigRock cPanel** hosting using **cPanel File Manager** and **cPanel MySQL Database Wizard**. The hosted application uses Apache/PHP and MySQL only: **BigRock does not need Node.js or a Node server**. Node.js is used on a developer machine to compile the frontend before deployment.

---

## 🌟 Why Did Your Previous PDF Look Incomplete?
In your previous export, the old version of `/api/astrology/engine.php` was still present on your hosting server. The updated files contain the **Complete ASTRO SIVAM Multi-Page Vedic Ephemeris & Rasi Chart Generator**. Follow this guide to upload the updated files and get high-precision Jathagam reports.

---

## 📋 Table of Contents
1. [Preparing Your Download Package](#-step-1-preparing-your-download-package)
2. [Uploading Files via cPanel File Manager](#-step-2-uploading-files-via-cpanel-file-manager)
3. [Creating Your Single MySQL Database in cPanel](#-step-3-creating-your-single-mysql-database-in-cpanel)
4. [Configure Database Credentials Securely](#-step-4-configure-database-credentials-securely)
5. [Initialize the Database & Provision an Administrator](#-step-5-initialize-the-database--provision-an-administrator)
6. [Setting Environment Variables on cPanel](#-step-5b-setting-environment-variables-on-cpanel)
7. [Testing the 100% Vedic Jathagam PDF](#-step-6-testing-the-100-vedic-jathagam-pdf)
8. [Installing PHP Dependencies](#-step-6b-installing-php-dependencies-public_htmlvendor)
9. [Email Deliverability (Spam Prevention)](#-step-7-email-deliverability-spam-prevention)
10. [Setting Up Facebook Customer Login](#-step-8-setting-up-1-click-facebook-customer-login)
11. [Setting Up Google Sign-In](#-step-9-setting-up-1-click-google-sign-in)
12. [Ops: Health, Backups, Logs & Monitoring](#-step-10-ops-health-backups-logs--monitoring)
13. [Quick Troubleshooting Checklist](#-quick-troubleshooting-checklist)

> Hardening controls (rate limits, payment webhooks, attachment budgets, shared
> Redis limiting) are documented separately in
> [RATE_LIMITING_AND_PAYMENT_RECOVERY.md](RATE_LIMITING_AND_PAYMENT_RECOVERY.md).
> Payment idempotency and the CI gate: [PAYMENT_WEBHOOK_IDEMPOTENCY_AND_CI.md](PAYMENT_WEBHOOK_IDEMPOTENCY_AND_CI.md).

---

## 📦 Step 1: Preparing Your Download Package

Build the production `dist.zip` package locally. It bundles the compiled frontend and the updated PHP backend `api/` together. GitHub Actions runs only the PHP test suite; it no longer creates a release archive or an automatic GitHub Release.

On a development machine with Node.js installed, from the repository root:

```bash
npm ci
npm run build:zip
```

Upload the resulting `dist.zip` from the repository root to cPanel. The archive is ignored by Git and must be rebuilt for each release.

---

### What is Inside `dist.zip`?
When you extract or upload `dist.zip` to your cPanel `public_html/`, it contains:
- `index.html` (the production web entry point)
- `assets/` (all optimized CSS, JS, and font assets)
- `api/` (the complete PHP backend: `config.php`, `schema.sql`, `provision_admin.php`, `astrology/engine.php`, `auth/`, `services/`, `admin/`, etc.)
- `BIGROCK_CPANEL_DEPLOYMENT_GUIDE.md`

The package contains only the compiled static website, PHP API, and deployment notes. It does **not** include a Node server, Node bundle, or Node runtime dependencies.

**Team portraits (admin uploads).** Adding an astrology team member takes a photo **file** — no image URL needed. PHP writes each portrait to `api/uploads/team/` and stores `/api/uploads/team/<random>.jpg` on the member. The photo is **centre-cropped to a square (800 × 800) and shrunk to 250 KB automatically** — in the browser before it is sent, and again on the server — so the admin never crops or resizes anything by hand and every card is the same shape. The folder ships with its `.htaccess` guard, which refuses to execute anything inside it; keep that file in place. The folder must be writable by PHP (`755`, the cPanel default for your own files) — if it is not, the panel says *"The server cannot store photos right now (upload folder is not writable)"*. Portraits live only on the server (never in `dist.zip`), survive redeploys, and are archived by the Sunday backup as `uploads.tar.gz` alongside the database dump — restoring a dump alone would leave members pointing at missing images.

---

## 📁 Step 2: Uploading Files via cPanel File Manager

1. Log into your **BigRock cPanel** dashboard (e.g. `https://yourdomain.com:2083`).
2. Under the **Files** section, click **File Manager**.
3. In the left panel, click on the **`public_html`** folder.

### A. Uploading the Frontend Files:
1. Inside `public_html`, click the **Upload** button at the top toolbar.
2. Upload all files from the `dist/` folder:
   - `index.html`
   - The entire `assets/` folder (with CSS and JS files)
   - `.htaccess` (make sure hidden files are enabled: click *Settings* at top right of File Manager -> check *Show Hidden Files (dotfiles)*).

### B. Uploading the Backend `api/` Folder:
1. In `public_html`, make sure there is a folder named **`api`**. If not, click **+ Folder** and name it `api`.
2. Enter the `api` folder and upload all contents of the `api/` directory:
   ```text
   public_html/
   ├── .htaccess
   ├── index.html
   ├── assets/
   │   ├── index-xxxx.js
   │   └── index-xxxx.css
   └── api/
       ├── config.php
       ├── db.php
       ├── schema.sql
       ├── provision_admin.php
       ├── mailer.php
       ├── payments.php
       ├── payment_webhook.php
       ├── rate_limit.php
       ├── client_ip.php
       ├── branding.php
       ├── index.php
       ├── 404.php
       ├── auth/
       │   └── index.php
       ├── services/
       │   └── index.php
       ├── admin/
       │   └── index.php
       └── astrology/
           └── engine.php
   ```
> **CRITICAL:** Ensure `public_html/api/astrology/engine.php` is replaced with the latest version from your downloaded package.

> **Source-based astrologer data:** The local reply path reads reviewed rules,
> remedies, guardrails, and the source registry from the repository's `knowledge/`
> folder. Upload it to **`public_html/knowledge/`**, beside `api/`. Without these
> local files the chat cannot reply. No system prompt, provider, external AI service,
> or API key is needed. Upload this directory by hand (or with `deploy_cpanel.sh`).

---

## 🗄️ Step 3: Creating Your Single MySQL Database in cPanel

1. Go back to the **cPanel Home**.
2. Under the **Databases** section, click **MySQL Database Wizard**.

### Step 3.1: Create Database Name
- In the **New Database** field, type: `astrosivam_db`
- cPanel will show the full name: `yourusername_astrosivam_db`
- Click **Next Step**.

### Step 3.2: Create Database User
- In the **Username** field, type: `astrosiv_user` (or `yourusername_user`)
- In the **Password** field, enter a unique, randomly generated password and store it in a password manager.
- Click **Create User**.

### Step 3.3: Add User to Database
- Check the box for **ALL PRIVILEGES**.
- Click **Make Changes** / **Next Step**.
- Note down your exact:
  1. Full Database Name (e.g., `yourusername_astrosivam_db`)
  2. Full Database User (e.g., `yourusername_astrosiv_user`)
  3. Database Password (store it only in the hosting secret manager)

---

## ⚙️ Step 4: Configure Database Credentials Securely

1. Create the MySQL database and database user in cPanel, then grant only the required database privileges.
2. Configure `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`, `DB_PORT`, and a random `APP_SECRET_KEY` (at least 32 characters) in the hosting environment/secret manager. If the host does not provide environment variables, place the values only in the server-side `api/config.php` after upload; never paste them into this repository, a ticket, or a deployment log.
3. Rotate any database or mail credentials that have ever appeared in source control or shared deployment notes. Treat those values as compromised.

---

## ⚡ Step 5: Initialize the Database & Provision an Administrator


1. Import `api/schema.sql` into the newly created MySQL database using phpMyAdmin. The schema creates tables and non-user settings only; it does **not** create a default admin or demo customer. On an **existing** database (created before 2026-10), also import every newer file in `api/migrations/` in numeric order — currently `012_social_identity_columns.sql` through `019_team_members_columns.sql` (019 adds the columns the Astrology Team editor writes — without it, adding a member fails) — then revoke schema-change rights from the web user (`REVOKE ALTER ON <database>.* FROM '<webuser>'@'<host>'; FLUSH PRIVILEGES;`). The API verifies the migrated schema on each request and answers 503 with a log line naming the missing migration when one was skipped.
2. Provision the first admin with the CLI-only script from a trusted cPanel Terminal/SSH session. Set `ASTROSIVAM_ADMIN_EMAIL`, `ASTROSIVAM_ADMIN_NAME`, and `ASTROSIVAM_ADMIN_PASSWORD` in the shell environment (use a unique password of at least 12 characters), along with the database and `APP_SECRET_KEY` environment settings, then run:

   ```sh
   php api/provision_admin.php
   ```

3. To explicitly promote an already-existing account, first verify that you control its email address, then pass `--promote-existing`; this also rotates its password. Never expose `provision_admin.php` as a web endpoint.
4. Do not reuse shared demo credentials. Admin status is stored as a database role and is not granted merely because an email appears in settings or an allow-list.

---

## 🔐 Step 5b: Setting Environment Variables on cPanel

The PHP API reads its configuration through `getenv()`. Everything below is
optional except the database/secret values from Step 4 — each setting has a
documented fallback (stored admin settings, or a safe default) — but a feature
is only *active* when its variable is present.

| Variable | Used for | Fallback when unset |
| --- | --- | --- |
| `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`, `DB_PORT` | MySQL connection | none — the API refuses to start (`DB_NAME`/`DB_USER`/`DB_PASS` have no code defaults) |
| `APP_SECRET_KEY` | signing tokens/OTP hashes (min 32 chars) | a key auto-generated into `api/astrology/tmp/` |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay checkout (UPI / Google Pay) | Admin → Payment Settings |
| `RAZORPAY_WEBHOOK_SECRET` | verifying `payment.captured` / `order.paid` webhooks | Admin → Payment Settings → Webhook Secret |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | PayPal REST checkout | Admin → Payment Settings |
| `PAYPAL_WEBHOOK_ID` | verifying `PAYMENT.CAPTURE.COMPLETED` (PayPal verify API) | Admin → Payment Settings |
| `CONTACT_INQUIRY_TO` | recipient of contact-form inquiries | admin notification / site contact / `ADMIN_EMAIL` |
| `FAMILY_EMAIL_MAX_ATTACHMENT_MB` | optional custom per-email cap; code default is 25 MiB | `FAMILY_EMAIL_MAX_ATTACHMENT_BYTES`, else 25 MiB |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME` | WhatsApp order alerts | alerts stay off |
| `VIBER_AUTH_TOKEN`, `VIBER_SENDER_NAME` | Viber order alerts | alerts stay off |
| `AI_ASTROLOGER_DAILY_LIMIT` | customer questions per rolling 24 h (admins unlimited) | `20`; local chat replies need no provider key or model settings |

The application uses a 25 MiB email budget by default, so no email-budget `SetEnv` line is needed. To use this default on an existing deployment, remove any explicit `FAMILY_EMAIL_MAX_ATTACHMENT_MB` or `FAMILY_EMAIL_MAX_ATTACHMENT_BYTES` setting from the hosting environment or `api/.htaccess`; explicit host settings take precedence over the code default. Keep any custom value at or below your SMTP provider's message-size limit.

**Method A — `api/.htaccess` (works on Apache / LiteSpeed, the usual cPanel setup).**
Add one `SetEnv` line per variable inside the `api/` folder's `.htaccess`:

```apache
# api/.htaccess — keep this file out of any repository; it holds live secrets.
SetEnv APP_SECRET_KEY "paste-a-64-character-random-string"
SetEnv CONTACT_INQUIRY_TO "admin@astrosivam.com"
SetEnv RAZORPAY_WEBHOOK_SECRET "..."
SetEnv PAYPAL_WEBHOOK_ID "..."
```

`.htaccess` files are never served to visitors (Apache protects `AccessFileName`
files) and `api/.htaccess` already blocks `.env`/`.ini`/`.txt` reads.

**Method B — hosting panel.** If your host provides an environment-variable
editor for the PHP app (or PHP-FPM pool configuration), set the same names
there; that also covers CGI/FPM setups where `SetEnv` is ignored.

**Verify (never print the values, only presence):** create `api/env_check.php`
with the snippet below, open `https://yourdomain.com/api/env_check.php`, then
**delete the file**:

```php
<?php
header('Content-Type: application/json');
$names = ['APP_SECRET_KEY','DB_NAME','CONTACT_INQUIRY_TO','FAMILY_EMAIL_MAX_ATTACHMENT_MB',
          'RAZORPAY_KEY_ID','RAZORPAY_WEBHOOK_SECRET','PAYPAL_CLIENT_ID','PAYPAL_WEBHOOK_ID'];
$out = [];
foreach ($names as $name) { $value = getenv($name); $out[$name] = ($value !== false && $value !== '') ? 'SET' : 'MISSING'; }
echo json_encode($out, JSON_PRETTY_PRINT);
```

`GET /api/payment/webhook/health` is the permanent check for the payment
credentials (`checkout` / `webhookVerification` booleans, no secret values), and
`GET /api/admin/health.php` is the full ops report — see Step 10.

---

## 📜 Step 6: Testing the 100% Vedic Jathagam PDF

1. Visit your website: `https://yourdomain.com/`
2. Go to **Birth Jathagam (பிறப்பு ஜாதகம்)**.
3. Enter birth details:
   - Name: `Mohan`
   - Date of Birth: `1990-08-15`
   - Time of Birth: `08:30`
   - Birth City: `Walajapet, Tamil Nadu` (or any other city worldwide)
4. Click **Preview Ephemeris (ஜாதகக் கணிப்பு முன்னோட்டம்)**.
5. Click **Download Official Certified PDF Report**:
   - The PDF will now output a **Multi-Page Certified Vedic Document** containing:
     - The **4×4 South Indian Rasi Chakra** with all 9 planetary glyphs (*Su, Mo, Ma, Me, Ju, Ve, Sa, Ra, Ke*).
     - Full **Navagraha Planetary Positions Table** with degrees and house numbers.
     - **Vimshottari Dasha periods**, **Chevvai Dosha evaluation**, and **Saturn transit analysis**.
     - **8 Life Predictions** (Career, Wealth, Health, Marriage, Children, Wisdom, Travel, and Remedies).
     - Official ASTRO SIVAM Sanskrit Board Certification seal.

---

## 🧩 Step 6b: Installing PHP Dependencies (`public_html/vendor`)

There is **no server-side PDF renderer any more** (mPDF was removed in October
2026). Every report and invoice PDF is captured in the browser from the shared
HTML, then uploaded for the email; `api/astrology/report_views.php` produces the
HTML only. See the [PDF delivery quality contract](PDF_DELIVERY_QUALITY.md).

`dist.zip` still does **not** contain Composer's `vendor/` folder, but the only
required package now is the PDF *reader* used by the AI astrologer's report
importer. Without it the AI explanation of an uploaded PDF is unavailable; the
report and invoice emails are unaffected.

**Option A — cPanel Terminal (preferred, PHP 8.0+):**

```sh
cd public_html
composer require smalot/pdfparser
```

**Option B — upload a vendor package:** upload a `vendor.zip` containing
`smalot/pdfparser` into `public_html/`, then extract it so that
`public_html/vendor/autoload.php` exists.

**If the host still has the old mPDF install**, delete
`public_html/vendor/mpdf` (and its `setasign` dependencies) on the next
deployment — nothing loads it, and it only consumes quota. No diagnostic page
exists any more.

`vendor/` lives outside the deployed zip, so it survives later re-deployments.

---

## ✉️ Step 7: Email Deliverability (Spam Prevention)

To ensure emails sent to `Mohanwalaja@gmail.com` and customers land directly in the **Inbox**:

1. **BigRock cPanel -> Email Deliverability**:
   - Click **Manage** next to `astrosivam.com`.
   - Click **Install Suggested Record** for both **SPF** and **DKIM**.
2. **BigRock cPanel -> Zone Editor**:
   - Add a `TXT` record for `_dmarc.astrosivam.com`:
   - Value: `v=DMARC1; p=none; sp=none; rua=mailto:admin@astrosivam.com`
3. **ASTRO SIVAM Admin Portal -> System Settings**:
   - Verify SMTP Host: `mail.astrosivam.com`, Port: `465` (SSL), Username: `admin@astrosivam.com`.

---

## 🚀 Step 8: Setting Up 1-Click Facebook Customer Login

ASTRO SIVAM includes 1-click Facebook Login so devotees and visitors can instantly sign in without tedious manual form filling.

1. **Open Meta Developers Dashboard**:
   - Visit [https://developers.facebook.com/apps/](https://developers.facebook.com/apps/) and click **Create App**.
   - Select **"Authenticate and request data from users with Facebook Login"** (or "Consumer").
   - App Display Name: `ASTRO SIVAM`.
2. **Configure Web Platform**:
   - In App Products, add **Facebook Login** -> choose **Web**.
   - Set Site URL: `https://yourdomain.com` (e.g., `https://astrosivam.com`).
3. **Configure OAuth Redirect URIs**:
   - In **Facebook Login -> Settings**:
   - Ensure **Client OAuth Login** & **Web OAuth Login** are **YES**.
   - In **Valid OAuth Redirect URIs**, enter:
     - `https://yourdomain.com`
     - `https://yourdomain.com/login`
     - `https://yourdomain.com/register`
     - `https://yourdomain.com/api/auth/facebook`
4. **Copy App ID into ASTRO SIVAM**:
   - Go to **App Settings -> Basic** in Meta Dashboard.
   - Copy the **App ID** (15–16 digit number).
   - Log into ASTRO SIVAM Admin Portal -> click **Facebook Setup** tab.
   - Paste the **App ID** and click **Save Facebook Settings**.
5. **Switch App to LIVE Mode**:
   - At top header bar in Meta Developer Dashboard, toggle **App Mode** from **In Development** to **Live**.

---

## 🌐 Step 9: Setting Up 1-Click Google Sign-In

ASTRO SIVAM also includes 1-click Google Sign-In using Google Identity Services (GSI), allowing devotees to sign in with their Google accounts instantly.

1. **Open Google Cloud Console**:
   - Visit [https://console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials).
2. **Configure OAuth Consent Screen**:
   - User Type: **External**.
   - App Name: `ASTRO SIVAM`.
   - User Support Email: `Mohanwalaja@gmail.com`.
   - Developer Contact: `Mohanwalaja@gmail.com`.
   - Scopes: `email`, `profile`, `openid`.
3. **Create OAuth Client ID**:
   - Go to **Credentials** -> click **+ Create Credentials** -> **OAuth client ID**.
   - Application Type: **Web application**.
   - Name: `ASTRO SIVAM Web Client`.
   - **Authorized JavaScript origins**:
     - `https://yourdomain.com` (e.g. `https://astrosivam.com`)
   - **Authorized redirect URIs**:
     - `https://yourdomain.com`
     - `https://yourdomain.com/login`
4. **Paste Client ID into ASTRO SIVAM**:
   - Copy your **Client ID** (ends with `.apps.googleusercontent.com`).
   - Log into ASTRO SIVAM Admin Portal -> click **Google Setup** tab.
   - Paste the **Client ID** and click **Save Settings**.

---

## 🩺 Step 10: Ops — Health, Backups, Logs & Monitoring

Five things must be true before launch; the first is already deployed, the rest
are one-time host settings (the last one lives in the Cloudflare dashboard). Full detail, commands and the restore drill:
[HEALTH_MONITORING_AND_BACKUP_VERIFICATION.md](HEALTH_MONITORING_AND_BACKUP_VERIFICATION.md).

1. **Health check (deployed).** Admin Portal → **System Health**, or
   `GET /api/admin/health.php` with an admin token. It reports database
   connectivity, whether the payment migration ran, provider/webhook-secret
   configuration, stale captures, the idempotency ledger, storage, the last
   backup, log routing, PHP limits and disk. It answers **503** when something
   fails, so it doubles as a readiness probe for an uptime monitor.

2. **Error logging (cPanel → MultiPHP INI Editor, per domain).**

   ```ini
   log_errors = On
   display_errors = Off
   error_log = /home/astro287/logs/php_error.log
   ```

   ```bash
   mkdir -p /home/astro287/logs && chmod 700 /home/astro287/logs
   ```

   Rotate it weekly so it cannot fill the quota (cron, Sundays 02:45; the
   scripts ship inside `dist.zip`, so
   `/home/<account>/public_html/scripts/...` is correct for a zip deploy;
   replace `astro287` with your cPanel account):

   ```cron
   45 2 * * 0  /bin/bash /home/astro287/public_html/scripts/ops/rotate_php_logs.sh >> /home/astro287/logs/rotate.log 2>&1
   ```

3. **Backups (cron, Sundays 02:15).** Database dump + `api/storage/` (support
   PDFs), gzipped, rotated, with a marker the health endpoint reads back:

   ```cron
   15 2 * * 0  /bin/bash /home/astro287/public_html/scripts/backup/astro_site_backup.sh >> /home/astro287/logs/backup.log 2>&1
   ```

   Run it once by hand and check `api/storage/backups/last-backup.json`, then
   work through `scripts/backup/RESTORE_VERIFICATION.md` into a sandbox database
   (never over production) and record the result.

4. **Uptime + certificate monitoring.** The GitHub monitoring workflow has
   been removed to keep Actions PHP-only. Configure an external monitor such as
   UptimeRobot or Uptime-Kuma for the homepage and TLS expiry, and manually
   verify that Cloudflare is in front (`cf-ray` present), HSTS is intact, and
   `/api/*` is **not** edge-cached. See
   [HEALTH_MONITORING_AND_BACKUP_VERIFICATION.md](HEALTH_MONITORING_AND_BACKUP_VERIFICATION.md)
   for the operational checks.

5. **CDN in front (Cloudflare, dashboard settings).** Put the domain behind
   Cloudflare — DNS record **Proxied** (orange cloud), SSL/TLS **Full (strict)**,
   Rocket Loader and Email Obfuscation **OFF** (both rewrite the page and fight
   the CSP), Brotli **On**, HSTS left as-is, and a Cache Rule that **bypasses
   `/api/*`** while caching the hashed `/assets/*` for a year. The origin half is
   already done: the real client IP is resolved from the edge headers without
   letting a client forge them (so rate limits, IP bans and the Free-Beta
   one-report-per-IP limit keep working), every API response is `no-store`, and
   the session cookie follows the visitor's scheme rather than the origin's.
   Full instructions, the deploy-time cache purge and the post-setup checks:
   [CLOUDFLARE_CDN_SETUP.md](CLOUDFLARE_CDN_SETUP.md).

---

## 💡 Quick Troubleshooting Checklist

| Issue | Solution |
| :--- | :--- |
| **"Database Connection Failed"** | Open `public_html/api/config.php` and verify `DB_NAME` and `DB_USER` include your cPanel username prefix (e.g. `youruser_astrosivam_db`). |
| **"Install Locked"** | If you need to re-run installer, delete `public_html/api/installed.lock` in File Manager. |
| **"404 Not Found on API routes"** | Ensure `.htaccess` is present in `public_html/` and Apache `mod_rewrite` is enabled on your hosting. |
| **"PDF looks blank / incomplete"** | Ensure `public_html/api/astrology/engine.php` is updated to the latest version. |
| **"Facebook Login Not Loading"** | Ensure App ID is saved in Admin Portal -> Facebook Setup, and App Mode in Meta Developer dashboard is switched to **Live**. |
| **"Google Login Not Loading"** | Ensure Web Client ID is saved in Admin Portal -> Google Setup, and your domain is listed in Authorized JavaScript Origins in Google Cloud Console. |
| **"Health check says backups: failing"** | The last backup is older than 8 days, or it did not include `api/storage`. Run `scripts/backup/astro_site_backup.sh` by hand and read its output — the marker is only written by a backup that succeeded. |
| **"Health check says logging: failing"** | `log_errors` is off. Set it in cPanel → MultiPHP INI Editor (Step 10), then re-check. |
| **"System Health shows schema: failing"** | A migration never ran. Apply `public_html/api/migrations/*.sql` in phpMyAdmin (008 is the payment idempotency ledger). |
