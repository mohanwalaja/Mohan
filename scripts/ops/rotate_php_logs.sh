#!/bin/bash
# ============================================================================
# ASTRO SIVAM - PHP error log rotation
# ============================================================================
#
# WHY A SCRIPT AND NOT logrotate(8)
# --------------------------------
# A shared cPanel/BigRock account cannot install /etc/logrotate.d entries (that
# needs root), and an unrotated error log is a liability twice over: it grows
# until the account hits its disk quota and the site goes down, and it buries
# this week's payment failure under six months of warnings.
#
# WHAT IT ROTATES
# ---------------
#   * a dedicated PHP error log (error_log ini setting - see the runbook), and
#   * the optional scripts/backup log, when pointed at the same directory.
#
# HOW IT IS SCHEDULED (cPanel > Cron Jobs, weekly, after the backup):
#   45 2 * * 0  /bin/bash /home/astro287/repo/scripts/ops/rotate_php_logs.sh >> /home/astro287/logs/rotate.log 2>&1
#
# CONFIGURATION (environment overrides; all optional)
#   LOG_DIR   directory holding the logs            (default: /home/$USER/logs)
#   LOG_FILES space separated file names to rotate  (default: php_error.log error.log)
#   MAX_MB    rotate once the file is bigger than   (default: 20)
#   KEEP      compressed generations to keep        (default: 6)
#
# Rotating an empty/nonexistent log is a no-op, never an error: a cron job that
# mails a failure every week trains the operator to ignore it.
# ============================================================================

set -uo pipefail

LOG_DIR="${LOG_DIR:-/home/${USER:-$(id -un)}/logs}"
LOG_FILES="${LOG_FILES:-php_error.log error.log}"
MAX_MB="${MAX_MB:-20}"
KEEP="${KEEP:-6}"
MAX_BYTES=$(( MAX_MB * 1048576 ))
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

if [ ! -d "$LOG_DIR" ]; then
  log "no log directory at $LOG_DIR - nothing to rotate (set LOG_DIR, or create it and point PHP's error_log at it)"
  exit 0
fi

rotated=0
for name in $LOG_FILES; do
  file="$LOG_DIR/$name"
  [ -f "$file" ] || continue

  size="$(wc -c < "$file" | tr -d ' ')"
  if [ "$size" -lt "$MAX_BYTES" ]; then
    log "$name is ${size} bytes (< $MAX_BYTES) - keeping"
    continue
  fi

  target="$file.$STAMP"
  # `mv` first, then gzip: PHP keeps writing to the original path (a new file
  # the OS creates on the next write), so nothing is lost in the gap.
  if ! mv "$file" "$target"; then
    log "ERROR: could not move $file - check ownership/permissions"
    continue
  fi
  gzip -9 "$target" || log "WARNING: could not compress $target"
  log "rotated $name (${size} bytes) -> $(basename "$target").gz"
  rotated=$((rotated + 1))

  # Keep the newest KEEP generations of this file, drop the rest. Ordering is
  # by NAME, not mtime: the stamps are UTC `YYYYMMDDTHHMMSSZ` (so lexicographic
  # order is chronological) and mtime ties - a restore that copies a whole
  # directory at once - would otherwise let the prune drop the newest archive.
  mapfile -t generations < <(ls -1 "$file".*.gz 2>/dev/null | sort -r)
  if [ "${#generations[@]}" -gt "$KEEP" ]; then
    for old in "${generations[@]:$KEEP}"; do
      log "pruning $(basename "$old")"
      rm -f "$old" || log "WARNING: could not remove $old"
    done
  fi
done

if [ "$rotated" -eq 0 ]; then
  log "nothing to rotate in $LOG_DIR"
else
  log "rotation complete: $rotated file(s), keeping $KEEP generations"
fi
