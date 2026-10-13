# Health, error logging, uptime monitoring and backup verification

Item 3 and item 4 of the launch checklist. Everything in the repo is wired;
the three marked **HOST STEP** are the parts that can only be done on the
BigRock/cPanel account, because they depend on the account's home path, PHP
handler and cron.

| piece | where it lives | who runs it |
|---|---|---|
| `GET /api/admin/health.php` + the admin **System Health** panel | repo | deployed with the next release |
| Weekly DB + `api/storage` backup with a completion marker | `scripts/backup/astro_site_backup.sh` | **HOST STEP** (cron) |
| Restore drill into a sandbox database | `scripts/backup/RESTORE_VERIFICATION.md` | operator, quarterly |
| Error-log routing + rotation | `scripts/ops/rotate_php_logs.sh` + cPanel MultiPHP INI | **HOST STEP** (ini + cron) |
| External uptime + TLS-expiry monitor | `.github/workflows/monitoring.yml` | **HOST STEP** (set one repo variable) |

---

## 1. The health endpoint

```
GET /api/admin/health.php        Authorization: Bearer <admin token>
```

Admin-only (`getDbConnection()` + `requireAdmin()`). Returns **200** while
healthy, **503** as soon as a check fails, so an uptime monitor can watch this
endpoint directly as a readiness probe. Every probe is isolated: one broken
subsystem degrades its own line instead of blanking the report.

| check | what it proves |
|---|---|
| `database` | `SELECT 1` round trip + latency (degraded above 2 s) |
| `schema` | `orders`, `users`, `payment_intents`, `payment_webhook_events`, `payment_idempotency_keys`, `beta_ip_claims` exist, and `orders.payment_intent_id` / `payment_status` / `group_id` + `users.token_version` are present — i.e. the payment hardening migration actually ran |
| `payments.providers` | Razorpay/PayPal checkout *and* webhook verification configured (booleans only — never the values) |
| `payments.capture` | intent counts by status, captures in the last 24 h, and `CREATED` intents older than 60 min (a paid customer with no order) |
| `payments.webhooks` | webhook events by status in the last 24 h, minutes since the last delivery, and idempotency-ledger counters incl. claims stuck `IN_PROGRESS` |
| `storage` | `api/storage` writable, support-document count/size |
| `backups` | the `last-backup.json` marker: age, size, and **whether `api/storage` was included** |
| `logging` | `log_errors` on, `display_errors` off, the destination, and the log's size/age |
| `runtime` | PHP version, `memory_limit`, `post_max_size`, `upload_max_filesize`, `max_execution_time`, mPDF/vendor present |
| `disk` | free space (degraded under 500 MB), best effort |

**No secret is ever returned.** The endpoint reports `checkout` /
`webhookVerification` booleans — same rule as the admin settings endpoint,
which redacts every key.

Failing checks are appended to the PHP error log as one structured
`admin_health_failing` line per run (with the admin id), so an intermittent
problem leaves a trail.

**Admin UI:** Admin Portal → **System Health** renders the same report, auto
refreshing every 2 minutes, with the failing checks listed first and the raw
probe payload behind a disclosure per row.

---

## 2. Error-log routing + rotation  — **HOST STEP**

The endpoint can only *verify* logging; the destination is server config.

### 2a. Point PHP at a real log file (cPanel, no SSH needed)

cPanel → **MultiPHP INI Editor** → *Editor* tab → select the domain → set:

```ini
log_errors = On
display_errors = Off
error_log = /home/astro287/logs/php_error.log
```

Replace `astro287` with the account name. This writes the account's `php.ini`
in one step — it covers every PHP request (including the payment webhooks),
which an `api/.user.ini` line would too, but the INI editor is the supported
route and survives cPanel updates.

Then create the directory once (Terminal or File Manager):

```bash
mkdir -p /home/astro287/logs && chmod 700 /home/astro287/logs
```

`api/.htaccess` already denies `.log` files over HTTP and `api/storage/.htaccess`
denies everything in storage — a log written outside the web root, as above, is
not reachable at all.

### 2b. Verify from the app

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://astrosivam.com/api/admin/health.php | python3 -m json.tool
```

```json
"logging": {
  "status": "ok",
  "detail": "Errors are logged to /home/astro287/logs/php_error.log.",
  "data": { "logErrors": true, "displayErrors": false, "logBytes": 184320, "logAgeMinutes": 12 }
}
```

`status: failing` here means `log_errors` is off — every payment and webhook
failure is currently invisible.

### 2c. Rotate it weekly (cPanel → Cron Jobs)

```cron
45 2 * * 0  /bin/bash /home/astro287/public_html/scripts/ops/rotate_php_logs.sh >> /home/astro287/logs/rotate.log 2>&1
```

**Path note:** `/home/astro287/public_html` is the deploy root for a
`dist.zip` upload (the archive ships `scripts/backup/` and `scripts/ops/`; both
`.sh` and `.md` are refused by `public/.htaccess`, so nothing there is servable
over HTTP). If instead you deploy from a git checkout of this repository, use
`/home/astro287/<checkout>/scripts/...` — the files are identical.

Defaults: rotate above **20 MB**, keep **6** gzipped generations, no-op when the
directory or file is missing (a weekly cron must not mail a failure for a quiet
week). Override with `MAX_MB`, `KEEP`, `LOG_FILES`, `LOG_DIR`.

The script moves the live file first and compresses the copy, so PHP keeps
writing throughout, and it prunes **by stamp name** rather than mtime so a
directory copied/restored in bulk can never drop the newest archive.

---

## 3. Uptime + certificate monitoring — **HOST STEP (one variable)**

`.github/workflows/monitoring.yml` runs weekly (Mondays 06:15 UTC) and on
demand, from GitHub's network — it needs no credentials and no admin token:

* **homepage**: HTTP 200 within 20 s, three attempts 20 s apart, with a warning
  above 5 s;
* **TLS**: reads the certificate for the host and **fails at fewer than 21
  days** to expiry (Let's Encrypt renews at 30, so this catches a broken
  AutoSSL before customers see a warning page);
* **deployed build**: downloads `/dist.zip` and fails if the shipped archive
  has no `api/migrations/008_payment_idempotency.sql` — i.e. production is
  running a build from before the payment hardening;
* **heartbeat** (optional): if `UPTIME_ROBOT_HEARTBEAT_URL` is set, checks it
  answers, so a dead monitor is itself detected.

Setup: GitHub → Settings → Secrets and variables → Actions → **Variables** →
new variable `PRODUCTION_URL = https://astrosivam.com`. Optionally add
`UPTIME_ROBOT_HEARTBEAT_URL`.

Without `PRODUCTION_URL` the workflow runs and **fails on purpose** with
"Monitoring is unarmed" — an unmonitored production site must not look green.

**Why both this and UptimeRobot:** a GitHub cron on a public repo is free, has
no signup, and can assert things a ping service cannot (certificate days
remaining, the contents of the deployed build). UptimeRobot/Uptime-Kuma adds
minute-level checks and SMS/push alerting — point it at the apex URL *and* at
`/api/admin/health.php` (expect 200/401; 503 means degraded). If you add
UptimeRobot, drop its heartbeat URL into the variable above so GitHub notices
when the monitor itself dies.

---

## 4. Backup & restore verification  — **HOST STEP (cron) + operator drill**

### 4a. Schedule the backup (cPanel → Cron Jobs)

Before relying on it, run it by hand once and read the output:

```bash
bash /home/astro287/repo/scripts/backup/astro_site_backup.sh
cat /home/astro287/public_html/api/storage/backups/last-backup.json
```

Then add the weekly entry (Sunday 02:15, before the rotation job):

```cron
15 2 * * 0  /bin/bash /home/astro287/public_html/scripts/backup/astro_site_backup.sh >> /home/astro287/logs/backup.log 2>&1
```

What it does:

* dumps MySQL with `--single-transaction --quick --skip-lock-tables --routines
  --events --triggers` (no table locks on a live site) and gzips it;
* archives **`api/storage/`** — the staged support PDFs and family documents —
  excluding its own `backups/` folder;
* refuses to publish a marker when `mysqldump` exits non-zero **or** the dump
  compresses under 4 KB, and exits non-zero itself, so a broken backup cannot
  masquerade as a good one;
* keeps `RETENTION` (default 5) generations and prunes the oldest;
* reads the DB credentials from the environment, then `api/.env`, then
  `api/config.php` — and never prints them (`MYSQL_PWD`, not `--password`).

The marker is what `/api/admin/health.php` reads back, so the site reports
"last backup 3 days ago, storage included" instead of leaving you to guess.
`BACKUP_DIR` can be pointed at a second disk or an rclone/cloud-sync folder if
one is available on the account.

> **Not included, by design:** `api/config.php` (the live DB password; git
> deploys deliberately never overwrite it) and
> `api/astrology/tmp/app_secret_key.txt`. Section 4 of the script carries a
> commented, encrypted `openssl` recipe for archiving `api/config.php` alongside
> the dumps — a dump you cannot connect a restored app to is only half a backup.

### 4b. Prove the restore (quarterly, ~30 minutes)

Follow `scripts/backup/RESTORE_VERIFICATION.md`: inventory the generation,
`gzip -t` the dump, import into a **sandbox** database (never over production),
then verify the money trail — `orders` ↔ `payment_intents` joins, no ungrouped
family orders, no orphaned rows, no duplicate idempotency keys — plus a
checksum comparison of the restored `api/storage` against the live tree. Record
the result in the drill table at the end of that document; the written result is
the point of the exercise.

### 4c. What the host's own backups give you

BigRock's weekly account backup is the safety net when the database itself is
corrupted or compromised — but it is account-wide, opaque about timing, and
useless for answering "does the app still boot on that data?". Treat it as the
last line of defense, and the script above as the one you can actually test.

---

## 5. Verification evidence (this repo)

* `scripts/backup/astro_site_backup.sh` and `scripts/ops/rotate_php_logs.sh`
  pass `shellcheck -S warning` (0.11.0, clean).
* `tests/backup-and-health-contract.test.ts` (14 checks, runs in `npm test`):
  the endpoint's auth and no-secrets rules and its 503 readiness contract, the
  required probes, the script's refusal to fake a failed dump, the portable
  retention rotation, the mtime-tie fix, the runbook's sandbox warning — and
  then **executes both scripts** against a stubbed `mysqldump` (marker written,
  rotation pruned to 2, failed dump left the previous marker untouched and
  exited non-zero; log rotation rotated a >1 MB file, kept `KEEP` generations,
  was a quiet no-op when under the threshold or when the directory is missing).
* `tests/ci-security-gate.test.ts` additionally asserts that `api/admin/health.php`,
  `scripts/backup/astro_site_backup.sh` and `scripts/ops/rotate_php_logs.sh`
  are all required to be present in the released `dist.zip`.
* `.github/workflows/monitoring.yml` is schema-validated with `action-validator`
  (SchemaStore GitHub Actions schema).

## 6. Remaining host actions (checklist)

- [ ] Set `error_log = /home/astro287/logs/php_error.log`, `log_errors = On`,
      `display_errors = Off` in cPanel → MultiPHP INI Editor.
- [ ] `mkdir -p /home/astro287/logs && chmod 700 /home/astro287/logs`.
- [ ] Cron: weekly `scripts/ops/rotate_php_logs.sh` (Sun 02:45).
- [ ] Cron: weekly `scripts/backup/astro_site_backup.sh` (Sun 02:15), then read
      `last-backup.json` once by hand.
- [ ] GitHub Actions variable `PRODUCTION_URL` (+ optional
      `UPTIME_ROBOT_HEARTBEAT_URL`).
- [ ] Point UptimeRobot/Uptime-Kuma at the homepage and at
      `/api/admin/health.php`.
- [ ] Run the restore drill once and record it in
      `scripts/backup/RESTORE_VERIFICATION.md`.
- [ ] Confirm the admin **System Health** tab reads `ok` (or work through the
      `degraded`/`failing` rows). With a CDN in front, the `edge` row is the one
      to watch: `clientIpSource` must read `cf_connecting_ip`/`x_forwarded_for`
      rather than `remote_addr`, or every visitor shares one rate-limit bucket.
- [ ] Deploy behind Cloudflare, then work through
      [CLOUDFLARE_CDN_SETUP.md](CLOUDFLARE_CDN_SETUP.md) — DNS Proxied, Full
      (strict), Rocket Loader + Email Obfuscation OFF, Brotli, the `/api/*` cache
      bypass, and the `TRUSTED_PROXY_RANGES` escape hatch if the edge ever
      changes address. The `edge` health row turns a stale Cloudflare range list
      or an untrusted peer loud instead of silently collapsing all visitors into
      one IP.
