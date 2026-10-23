#!/bin/bash
# ============================================================================
# ASTRO SIVAM - weekly database + support-document backup
# ============================================================================
#
# WHY THIS EXISTS
# ---------------
# BigRock / cPanel backups are the last line of defense when the database is
# compromised or a bad migration runs. "We think the host dumps weekly" is not
# a backup. This script produces a dump we can point at, keeps a rotation of
# them on disk, and writes a machine-readable marker that
# GET /api/admin/health.php reads back - so the site itself reports whether the
# pipeline is alive.
#
# WHAT IT DUMPS
# -------------
#   1. the MySQL database (schema + data, single-transaction, no table locks)
#   2. api/storage/ - staged support PDFs / family documents
#
# WHAT IT DELIBERATELY DOES NOT DUMP
# ----------------------------------
#   * api/config.php  - contains the live DB password and is NOT overwritten by
#     git deploys (see .cpanel.yml). A database dump is worthless without the
#     credentials on the restore host, so it is archived separately, encrypted,
#     and kept out of the web root. See section 4.
#   * api/astrology/tmp/app_secret_key.txt - rotating runtime signing key.
#
# USAGE
# -----
#   bash scripts/backup/astro_site_backup.sh                 # dump + prune + marker
#   RETENTION=8 bash scripts/backup/astro_site_backup.sh     # keep 8 generations
#   BACKUP_DIR=/home/user/backups bash scripts/backup/astro_site_backup.sh
#
# SCHEDULING (cPanel > Cron Jobs, weekly):
#   15 2 * * 0  /bin/bash /home/astro287/repo/scripts/backup/astro_site_backup.sh >> /home/astro287/logs/backup.log 2>&1
#
# RESTORE VERIFICATION: scripts/backup/RESTORE_VERIFICATION.md - do it at least
# once per quarter against a sandbox database, not against production.
# ============================================================================

set -uo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
if [ -d "$REPO_DIR/api" ]; then
  API_DIR="$REPO_DIR/api"
else
  API_DIR="$REPO_DIR"
fi

BACKUP_DIR="${BACKUP_DIR:-$API_DIR/storage/backups}"
RETENTION="${RETENTION:-5}"
MYSQLDUMP_BIN="${MYSQLDUMP_BIN:-mysqldump}"
DATE_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

mkdir -p "$BACKUP_DIR" || fail "cannot create $BACKUP_DIR"
GENERATION_DIR="$BACKUP_DIR/$DATE_STAMP"
# The stamp has second resolution: a second run inside the same second (a manual
# re-run, or a slow cron overlapping) must not collide with the first one, or
# gzip refuses to overwrite and the backup silently fails.
if [ -e "$GENERATION_DIR" ]; then
  DATE_STAMP="${DATE_STAMP}-$$"
  GENERATION_DIR="$BACKUP_DIR/$DATE_STAMP"
fi
mkdir -p "$GENERATION_DIR" || fail "cannot create $GENERATION_DIR"

# ---------------------------------------------------------------------------
# 1. Database credentials
#
# Priority: real environment variables -> api/.env (never in the web root
# either; git-ignored) -> the constants in api/config.php, which is what the
# live host actually uses. Values are never printed.
# ---------------------------------------------------------------------------
DB_HOST="${DB_HOST:-}"; DB_NAME="${DB_NAME:-}"; DB_USER="${DB_USER:-}"; DB_PASS="${DB_PASS:-}"; DB_PORT="${DB_PORT:-3306}"

if [ -z "$DB_NAME" ] && [ -f "$API_DIR/.env" ]; then
  while IFS='=' read -r key value; do
    case "$key" in
      DB_HOST) DB_HOST="${value%\"}" ; DB_HOST="${DB_HOST#\"}" ;;
      DB_NAME) DB_NAME="${value%\"}" ; DB_NAME="${DB_NAME#\"}" ;;
      DB_USER) DB_USER="${value%\"}" ; DB_USER="${DB_USER#\"}" ;;
      DB_PASS) DB_PASS="${value%\"}" ; DB_PASS="${DB_PASS#\"}" ;;
      DB_PORT) DB_PORT="${value%\"}" ; DB_PORT="${DB_PORT#\"}" ;;
    esac
  done < <(grep -E '^\s*(DB_HOST|DB_NAME|DB_USER|DB_PASS|DB_PORT)\s*=' "$API_DIR/.env" 2>/dev/null | tr -d '\r')
fi

if [ -z "$DB_NAME" ] && [ -f "$API_DIR/config.php" ]; then
  php_value() {
    # Reads one define('NAME', 'value') without executing the file.
    grep -E "define\(\s*'$1'" "$API_DIR/config.php" 2>/dev/null \
      | head -n 1 | sed -E "s/.*'$1'\s*,\s*'([^']*)'\s*\).*/\1/"
  }
  DB_HOST="${DB_HOST:-$(php_value DB_HOST)}"
  DB_NAME="${DB_NAME:-$(php_value DB_NAME)}"
  DB_USER="${DB_USER:-$(php_value DB_USER)}"
  DB_PASS="${DB_PASS:-$(php_value DB_PASS)}"
  DB_PORT="${DB_PORT:-$(php_value DB_PORT)}"
fi

[ -n "$DB_NAME" ] || fail "database name not found (set DB_NAME or check api/config.php)"
[ -n "$DB_USER" ] || fail "database user not found (set DB_USER or check api/config.php)"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"

# ---------------------------------------------------------------------------
# 2. Database dump
# ---------------------------------------------------------------------------
DUMP_FILE="$GENERATION_DIR/database.sql"

log "dumping database '$DB_NAME' from $DB_HOST:$DB_PORT"
if [ -n "$DB_PASS" ]; then
  MYSQL_PWD="$DB_PASS" "$MYSQLDUMP_BIN" \
    --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" \
    --single-transaction --quick --skip-lock-tables --routines --events --triggers \
    --default-character-set=utf8mb4 --add-drop-table \
    "$DB_NAME" > "$DUMP_FILE" 2>"$GENERATION_DIR/database.err"
else
  "$MYSQLDUMP_BIN" \
    --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" \
    --single-transaction --quick --skip-lock-tables --routines --events --triggers \
    --default-character-set=utf8mb4 --add-drop-table \
    "$DB_NAME" > "$DUMP_FILE" 2>"$GENERATION_DIR/database.err"
fi

DUMP_STATUS=$?
if [ $DUMP_STATUS -ne 0 ] || [ ! -s "$DUMP_FILE" ]; then
  # Keep the error file (it is the evidence) but never publish a marker for a
  # backup that did not happen.
  log "mysqldump failed (exit $DUMP_STATUS) - see $GENERATION_DIR/database.err"
  log "$(head -c 400 "$GENERATION_DIR/database.err" 2>/dev/null)"
  exit 1
fi

if ! gzip -9 "$DUMP_FILE"; then
  fail "could not compress the database dump"
fi
DUMP_FILE="$DUMP_FILE.gz"
DUMP_BYTES="$(wc -c < "$DUMP_FILE" | tr -d ' ')"

# A dump with a header but no data means a credentials/schema mismatch; treat a
# suspiciously small dump as a failure rather than a backup.
if [ "$DUMP_BYTES" -lt 4096 ]; then
  fail "dump is only ${DUMP_BYTES} bytes - refusing to call that a backup"
fi
log "database dump: $(numfmt --to=iec "$DUMP_BYTES" 2>/dev/null || echo "${DUMP_BYTES} bytes")"

# ---------------------------------------------------------------------------
# 3. Support documents (api/storage) - staged PDFs and family documents.
#    api/storage/.htaccess denies HTTP access; this tarball inherits umask 077.
# ---------------------------------------------------------------------------
STORAGE_STATUS='{"included": false, "files": 0, "bytes": 0}'
if [ -d "$API_DIR/storage" ]; then
  STORAGE_TAR="$GENERATION_DIR/storage.tar.gz"
  if tar --exclude='./backups' -czf "$STORAGE_TAR" -C "$API_DIR/storage" . 2>/dev/null; then
    STORAGE_FILES="$(find "$API_DIR/storage" -type f -not -path '*/backups/*' 2>/dev/null | wc -l | tr -d ' ')"
    STORAGE_BYTES="$(wc -c < "$STORAGE_TAR" | tr -d ' ')"
    STORAGE_STATUS="{\"included\": true, \"files\": ${STORAGE_FILES}, \"bytes\": ${STORAGE_BYTES}, \"archive\": \"storage.tar.gz\"}"
    log "storage archive: ${STORAGE_FILES} file(s), $(numfmt --to=iec "$STORAGE_BYTES" 2>/dev/null || echo "${STORAGE_BYTES} bytes")"
  else
    STORAGE_STATUS='{"included": false, "files": 0, "bytes": 0, "error": "tar failed"}'
    log "WARNING: api/storage could not be archived - the marker will say so"
  fi
else
  STORAGE_STATUS='{"included": false, "files": 0, "bytes": 0, "error": "api/storage missing"}'
  log "WARNING: api/storage not found"
fi

# ---------------------------------------------------------------------------
# 3b. Admin-uploaded photos (api/uploads) - astrology team portraits.
#     These live only on the server (never in dist.zip), so a database dump
#     alone would restore members pointing at images that no longer exist.
# ---------------------------------------------------------------------------
UPLOADS_STATUS='{"included": false, "files": 0, "bytes": 0}'
if [ -d "$API_DIR/uploads" ]; then
  UPLOADS_TAR="$GENERATION_DIR/uploads.tar.gz"
  if tar -czf "$UPLOADS_TAR" -C "$API_DIR/uploads" . 2>/dev/null; then
    UPLOAD_FILES="$(find "$API_DIR/uploads" -type f -not -name '.htaccess' 2>/dev/null | wc -l | tr -d ' ')"
    UPLOAD_BYTES="$(wc -c < "$UPLOADS_TAR" | tr -d ' ')"
    UPLOADS_STATUS="{\"included\": true, \"files\": ${UPLOAD_FILES}, \"bytes\": ${UPLOAD_BYTES}, \"archive\": \"uploads.tar.gz\"}"
    log "uploads archive: ${UPLOAD_FILES} file(s), $(numfmt --to=iec "$UPLOAD_BYTES" 2>/dev/null || echo "${UPLOAD_BYTES} bytes")"
  else
    UPLOADS_STATUS='{"included": false, "files": 0, "bytes": 0, "error": "tar failed"}'
    log "WARNING: api/uploads could not be archived - the marker will say so"
  fi
else
  UPLOADS_STATUS='{"included": false, "files": 0, "bytes": 0, "error": "api/uploads missing"}'
  log "WARNING: api/uploads not found"
fi

# ---------------------------------------------------------------------------
# 4. Credentials archive (optional, encrypted, deliberately outside the marker)
#
# Uncomment on the host and set ASTRO_BACKUP_PASSPHRASE in the cron
# environment. Restoring a database without api/config.php means hand-editing
# credentials on the restore host, so keep an encrypted copy with the dumps:
#
#   export ASTRO_BACKUP_PASSPHRASE='...'
#   tar -czf "$GENERATION_DIR/private-config.tar.gz" -C "$REPO_DIR" api/config.php api/.env 2>/dev/null
#   openssl enc -aes-256-cbc -pbkdf2 -salt -in "$GENERATION_DIR/private-config.tar.gz" \
#     -out "$GENERATION_DIR/private-config.tar.gz.enc" -pass env:ASTRO_BACKUP_PASSPHRASE \
#     && shred -u "$GENERATION_DIR/private-config.tar.gz"
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# 5. Marker that /api/admin/health.php reads back
# ---------------------------------------------------------------------------
HOST_NAME="$(hostname 2>/dev/null || echo unknown)"
GIT_REVISION="$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"

cat > "$BACKUP_DIR/last-backup.json" <<JSON
{
  "generatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "generation": "$DATE_STAMP",
  "host": "$HOST_NAME",
  "gitRevision": "$GIT_REVISION",
  "database": {"name": "$DB_NAME", "dump": "database.sql.gz", "dumpBytes": $DUMP_BYTES},
  "storage": $STORAGE_STATUS,
  "uploads": $UPLOADS_STATUS,
  "retention": {"keep": $RETENTION, "directory": "$BACKUP_DIR"}
}
JSON

# ---------------------------------------------------------------------------
# 6. Rotation - oldest generations first, current one always kept.
# ---------------------------------------------------------------------------
# `ls -1d */` instead of `find -printf`: the cPanel host and CI (GNU) both
# support -printf, but BSD/macOS find does not, and a rotation that silently
# stops pruning fills the account quota.
GENERATIONS=()
mapfile -t GENERATIONS < <(cd "$BACKUP_DIR" 2>/dev/null && ls -1d */ 2>/dev/null | sed 's#/$##' | sort -r)
if [ "${#GENERATIONS[@]}" -gt "$RETENTION" ]; then
  for old in "${GENERATIONS[@]:$RETENTION}"; do
    log "pruning $old"
    rm -rf "${BACKUP_DIR:?}/$old" || log "WARNING: could not prune $old - check ownership of $BACKUP_DIR"
  done
fi
KEPT="$(cd "$BACKUP_DIR" 2>/dev/null && ls -1d */ 2>/dev/null | wc -l | tr -d ' ')"

log "backup complete: $GENERATION_DIR (${KEPT} generation(s) on disk, keep $RETENTION)"
