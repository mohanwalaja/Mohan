#!/usr/bin/env bash
# Full local verification for this repository.
#
# WHY THIS EXISTS
# GitHub Actions billing on this account is exhausted, so a green workflow is
# not available on every PR. This script is the local equivalent and is meant
# to be run before opening a pull request:
#
#   npm run test:all
#
# It runs, in order:
#   1. TypeScript (tsc --noEmit)
#   2. The production build (dist/ is required by the dist-shape and
#      initial-JS-budget checks inside the Node suite)
#   3. The full Node contract suite (scripts/run-tests.mjs)
#   4. All 15 PHP suites from scripts/run-php-tests.sh — with native PHP when it
#      is installed, otherwise through php-wasm at PHP 8.1 (the version CI uses)
#   5. The Playwright browser specs when a browser is available
#
# Nothing here needs network access except the one-time optional php-wasm
# install when native PHP is absent.
set -euo pipefail

cd "$(dirname "$0")/.."

PHP_WASM_VERSION="3.1.54"

echo "==> TypeScript (tsc --noEmit)"
npm run lint

echo
echo "==> Production build (vite + prerender)"
npm run build

echo
echo "==> Node contract suite (includes the built dist/ checks)"
npm test

echo
echo "==> PHP suites"
# The suite list lives in one place: scripts/run-php-tests.sh.
php_suites=()
while IFS= read -r php_suite; do
  php_suites+=("$php_suite")
done < <(sed -n '/^php_tests=(/,/^)/p' scripts/run-php-tests.sh | grep -oE 'tests/[A-Za-z0-9._/-]+\.php' || true)

if [ "${#php_suites[@]}" -eq 0 ]; then
  echo "Could not read the PHP suite list from scripts/run-php-tests.sh" >&2
  exit 1
fi

if command -v php >/dev/null 2>&1; then
  php_version=$(php -r 'echo PHP_VERSION;' 2>/dev/null || echo 'unknown')
  echo "Native PHP ${php_version}: all ${#php_suites[@]} suites"
  bash scripts/run-php-tests.sh
else
  echo "Native php not found: using php-wasm (PHP 8.1, the version CI runs)"
  npm install --no-save --no-audit --no-fund \
    "@php-wasm/node@${PHP_WASM_VERSION}" "@php-wasm/universal@${PHP_WASM_VERSION}"
  for php_suite in "${php_suites[@]}"; do
    printf '\n[PHP TEST] %s\n' "$php_suite"
    node scripts/php-wasm-run.mjs --php 8.1 "$php_suite"
  done
fi

echo
echo "==> Browser specs (Playwright)"
if [ -n "${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-}" ] || ls "${HOME}/.cache/ms-playwright"/chromium-* >/dev/null 2>&1; then
  npm run test:pdf
else
  echo "[SKIP] No Playwright Chromium is installed on this machine."
  echo "       Install it once with: npx playwright install chromium"
  echo "       (or point PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH at any Chromium build)."
fi

echo
echo "All locally-runnable tests passed."
