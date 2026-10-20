# Restore verification — ASTRO SIVAM

**A backup you have never restored is a hope, not a backup.** This is the drill
to run after `scripts/backup/astro_site_backup.sh` has produced at least one
generation, and at least once per quarter afterwards.

Budget: ~30 minutes. Everything happens in a **sandbox database**. Never
restore over production (the dump issues `DROP TABLE` for every table it
holds); if production is the thing that broke, restore into a *new* database,
verify it, then point the app at it.

---

## 0. What the backup contains

| file (inside `api/storage/backups/<timestamp>/`) | contents |
|---|---|
| `database.sql.gz` | full MySQL dump: schema, data, routines, triggers |
| `storage.tar.gz` | `api/storage/` — staged support PDFs / family documents |
| `uploads.tar.gz` | `api/uploads/` — astrology team portraits uploaded in the admin panel |
| `database.err` | mysqldump stderr when a run failed (an evidence file, not a backup) |
| `../last-backup.json` | the marker `GET /api/admin/health.php` reads |

Deliberately **not** included: `api/config.php` (live DB password; not
overwritten by git deploys) and `api/astrology/tmp/app_secret_key.txt`.

---

## 1. Inventory the generation

```bash
BACKUP_DIR=/home/astro287/public_html/api/storage/backups
ls -lh "$BACKUP_DIR"                       # one directory per generation
GEN=$(ls -1 "$BACKUP_DIR" | sort | tail -1)
ls -lh "$BACKUP_DIR/$GEN"
cat "$BACKUP_DIR/last-backup.json" | python3 -m json.tool
```

Check, and note the numbers in the verification log at the bottom:

- `last-backup.json` → `database.dumpBytes` > 0 and `storage.included` is `true`
  (if `false`, `api/storage` is **not** protected and the health endpoint will
  report it as failing).
- `generatedAt` is within the last 8 days. Anything older means the weekly cron
  stopped running.
- `gitRevision` matches a commit you can find (`git log --oneline -1 <rev>`).

## 2. Verify the dump is readable *before* importing anything

```bash
gzip -t "$BACKUP_DIR/$GEN/database.sql.gz" && echo "gzip OK"
zcat "$BACKUP_DIR/$GEN/database.sql.gz" | head -40          # header + server version
zcat "$BACKUP_DIR/$GEN/database.sql.gz" | grep -c "CREATE TABLE"   # expect ~20+
zcat "$BACKUP_DIR/$GEN/database.sql.gz" | grep -E "CREATE TABLE \`(orders|payment_intents|payment_idempotency_keys)\`"
```

The three tables above **must** be present: `orders` is the business record,
`payment_intents` is what proves a customer paid, and
`payment_idempotency_keys` is what makes webhook redelivery safe.

## 3. Restore into a sandbox database

On the host (cPanel → MySQL Databases, create `astro287_restore_test`), or
locally with Docker:

```bash
# Local sandbox (mysql:8 container)
docker run --rm -d --name astro-restore -e MYSQL_ROOT_PASSWORD=test -p 3307:3306 mysql:8
sleep 20
docker exec astro-restore mysql -uroot -ptest -e "CREATE DATABASE astro_restore CHARACTER SET utf8mb4"

# Import — the dump contains DROP TABLE statements for every table it holds,
# which is exactly why this must be a sandbox database.
zcat "$BACKUP_DIR/$GEN/database.sql.gz" \
  | docker exec -i astro-restore mysql -uroot -ptest astro_restore
```

Restoring onto cPanel instead:

```bash
zcat "$BACKUP_DIR/$GEN/database.sql.gz" \
  | mysql --host=localhost --user=astro287_restore --password astro287_restore_test
```

## 4. Prove the data is actually there

Row counts alone do not prove a restore — prove the *links* between rows:

```sql
-- 1. Volumes, and the newest business records.
SELECT COUNT(*) AS users FROM users;
SELECT COUNT(*) AS orders FROM orders;
SELECT COUNT(*) AS intents FROM payment_intents;
SELECT COUNT(*) AS ledger FROM payment_idempotency_keys;
SELECT * FROM orders ORDER BY created_at DESC LIMIT 3;

-- 2. Every paid order still points at its payment intent (the money trail).
SELECT o.order_number, o.status, o.payment_status, i.provider, i.status AS intent_status
FROM orders o JOIN payment_intents i ON i.id = o.payment_intent_id
ORDER BY o.created_at DESC LIMIT 5;

-- 3. No order lost its group (family bundles must stay grouped).
SELECT COUNT(*) AS ungrouped FROM orders WHERE group_id IS NULL OR group_id = '';

-- 4. Orphans: an order whose owner is missing is a corrupt restore.
SELECT COUNT(*) AS orphan_orders FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE u.id IS NULL;

-- 5. Webhook idempotency ledger integrity.
SELECT status, COUNT(*) FROM payment_idempotency_keys GROUP BY status;
SELECT COUNT(*) AS duplicate_keys FROM (
  SELECT idempotency_key FROM payment_idempotency_keys GROUP BY idempotency_key HAVING COUNT(*) > 1
) d;
```

Expected: counts in the same order of magnitude as production (a dump from a
week ago will be slightly behind — that is fine, an empty table is not),
`orphan_orders = 0`, `duplicate_keys = 0`.

## 5. Prove the application boots against the restored data

Two options, cheapest first:

**A. Health endpoint against the sandbox** — point a staging copy of `api/` at
`astro_restore` and call:

```bash
curl -s -H "Authorization: Bearer $STAGING_ADMIN_TOKEN" \
  https://staging.astrosivam.com/api/admin/health.php | python3 -m json.tool
```

The `database` and `schema` probes must read `ok`. (The deployment runbook says
`config.php` is not overwritten by git deploys — edit the sandbox copy's
credentials, never production's.)

**B. Read-only smoke against the imported dump** — if a staging host is not
available, at minimum confirm the app's hottest read path still resolves:

```sql
SELECT id, order_number FROM orders WHERE user_email = '<a known customer>' ORDER BY created_at DESC LIMIT 1;
SELECT id, status FROM payment_intents WHERE order_id IS NOT NULL LIMIT 1;
```

## 6. Verify `api/storage` (support PDFs / documents)

```bash
mkdir -p /tmp/astro-storage-restore
tar -xzf "$BACKUP_DIR/$GEN/storage.tar.gz" -C /tmp/astro-storage-restore
# Team portraits (create the folder first on a fresh host):
#   mkdir -p api/uploads && tar -xzf "$BACKUP_DIR/$GEN/uploads.tar.gz" -C api/uploads
find /tmp/astro-storage-restore -type f | head -20
file /tmp/astro-storage-restore/family_docs/* 2>/dev/null | head -5   # expect PDF document
```

Then confirm the files are the *same* files, not just files:

```bash
# Compare against the live tree (safe: read-only).
find "$API_DIR/storage/family_docs" -type f | wc -l
find /tmp/astro-storage-restore/family_docs -type f | wc -l
diff <(cd "$API_DIR/storage" && find . -type f -exec md5sum {} + | sort -k2) \
     <(cd /tmp/astro-storage-restore && find . -type f -exec md5sum {} + | sort -k2) | head
```

A file that exists in the database (`orders.has_pdf = 1`) but not in storage is
a broken delivery after a disaster — worth knowing now.

## 7. Clean up and record the result

```bash
docker rm -f astro-restore                 # local sandbox
# cPanel: drop astro287_restore_test so a stale copy of customer data never lingers
```

Copy the table below into `docs/HEALTH_MONITORING_AND_BACKUP_VERIFICATION.md` (or the
ops log) — the point of the drill is the written result:

| date | generation restored | dump size | tables | orders | intents | storage files | restored by | result |
|---|---|---|---|---|---|---|---|---|
| _(fill in)_ | | | | | | | | |

## 8. If the drill fails

| symptom | likely cause | fix |
|---|---|---|
| `gzip -t` fails | truncated dump (disk full during the run) | check the host disk quota, re-run the backup, keep the failure in the log |
| dump imports but tables are empty | `mysqldump` ran against the wrong DB name | confirm `DB_NAME` in `api/config.php`; the marker records the name that was dumped |
| `last-backup.json` missing | the cron never ran | cPanel → Cron Jobs; run the script by hand once and watch for the marker |
| health endpoint says `storage included: false` | `tar` failed (permissions on `api/storage`) | `chmod 755 api/storage`, re-run |
| restore is missing recent orders | dump is stale, not broken | check `generatedAt` age — the cron is not firing |
