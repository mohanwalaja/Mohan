# Admin report delivery fix — "Preview-quality report and invoice PDF did not reach the server"

## Symptom

On `/admin`, sending a pending order showed `⏳ Preparing preview-quality report & invoice for Order #…`
and then:

> Preview-quality report and invoice PDF did not reach the server. No email was sent; render and upload
> both documents before approving.

No email was sent and the order stayed pending. This happened on every attempt, not intermittently.

## Root cause

The browser renders the report and invoice (html2canvas + jsPDF, ≥ 1900 × 2800 px per A4 page) and posts
them to the API. Real renders are large:

| Real Chromium render (desktop, 3× scale) | Report | Invoice | Approve request body |
|---|---|---|---|
| Birth Jathagam, English | 3.06 MB | 0.62 MB | **4.91 MiB** |
| Birth Jathagam, Tamil   | 3.55 MB | 0.62 MB | **5.56 MiB** |

`deliverOrderPdfPayload()` sends both PDFs **inline** in the approve request while they total ≤ 5 MB,
and otherwise stages them one document per request (`/stage-doc`).

Every one of those routes read its JSON with `getJsonBody()` from `api/config.php`. That function caps a
body at **1 MiB** and above the cap it returns `[]` silently, exactly as if nothing had been sent. The approve
route therefore saw no PDFs, found nothing staged, and its fail-closed gate answered `422` with the message
above. The staging route had the same problem: any document over 1 MiB got a `413` telling the operator
to "raise post_max_size", while `post_max_size` was already 128M.

`api/.user.ini` had raised PHP's limits (128M) for this exact pipeline. Its own comment describes the old
failure ("the request body arrives EMPTY, no error is raised"). The 1 MiB cap in `getJsonBody()`
brought the same silent empty body back, one layer higher.

Reproduced against the original code with the real PHP routes (see Tests):

| Request | Original code | Fixed |
|---|---|---|
| Real browser render, Tamil: `POST /api/admin/orders/:id/approve` (5.56 MiB) | **422**, the message above | 200, emailed |
| jsPDF fixture: approve with inline report + invoice (2.81 MiB) | **422**, the message above | 200, both PDFs attached byte-identical |
| Same route, valid PDFs, body 0.59 MiB (control) | 200 | 200 |
| `POST /api/admin/orders/:id/stage-doc` (2.35 MiB) | 413 "raise post_max_size" | 200, staged |

### Why the fix is not in `config.php`

Both deploy paths (`.cpanel.yml` and `deploy_cpanel.sh`) deliberately **keep the live `api/config.php`**,
because it holds the database credentials. A change to `getJsonBody()` there would never reach an existing
installation. The new reader therefore lives in its own file, `api/request_body.php`, which every deploy
copies.

## What changed

**`api/request_body.php` (new)**: `astro_document_json_body()` reads document-carrying bodies with
`ASTRO_DOCUMENT_JSON_MAX_BYTES` (64 MiB). That covers one maximum-size 40 MiB staged PDF in base64 and stays
below `post_max_size` (128M). Nothing is silent any more:

- too large → `413 {bodyTooLarge: true}` with the real sizes;
- announced but never delivered (post_max_size / proxy / ModSecurity) → `413 {bodyDiscarded: true}`;
- malformed JSON → `400`.

Each rejection happens before the route does anything: nothing is staged, approved or emailed.
Ordinary JSON routes keep the 1 MiB `getJsonBody()`.

**Routes switched to the document reader:** `api/admin/index.php` (stage-doc, single approve,
resend-email, family approve/resend, multi-person item send/send-all), `api/admin/approve_order.php`,
`api/admin/orders.php?action=approve` (group branch) and the direct `api/admin/family_docs.php` entry point.

**Order association (both PDFs must belong to the order being delivered):**

- The staging scope and owning orders come from the database (`astroFamilyDocsResolveTarget`). Nothing is
  staged for an order or group that does not exist (`422`, because the admin panel reads a 404 from a
  staging URL as "route not deployed").
- A report labelled for a different order, or with an order id and number that disagree, is refused
  (`orderMismatch`). The manifest records the database's id and number.
- Approval attaches only a staged report recorded for exactly this order. The old fallback attached a
  lone staged report whatever order it named.
- Staging never reports success for a file it did not fully record. A short write or a failed manifest
  write removes the PDF and returns an error.

**Safety gate unchanged:** the PDF validator (size, header/EOF, page count, ≥ 1900 × 2800 px raster per
page) and the fail-closed `422` gate are untouched. A missing or low-resolution document still sends nothing.

**Related hardening**

- `orders.php?action=approve` used to mark a standalone order `COMPLETED`, `email_status = SENT`,
  `has_pdf = 1` and `has_invoice = 1` without validating or sending any PDF. It now refuses with `409`,
  changes nothing, and points to the validated delivery route. The app never called it.
- `family_approval.php`: an undefined `$sizeNote` in the family success message, emitted after the
  email had gone out, is now `$oversizeNote`.
- Admin panel: on failure the "⏳ Preparing…" banner is cleared, so it no longer sits next to the error as if
  delivery were still running.
- `safeJson()`: an HTML `413` from the web server or a firewall (LiteSpeed, ModSecurity) is now reported as
  "rejected the request as too large (HTTP 413)… Nothing was saved or emailed" instead of the generic
  "Server response was not in JSON format."
- `SINGLE_ORDER_INLINE_LIMIT_BYTES`: the comment now states it is a decoded-byte limit and references the
  server limit. A test enforces the relationship.

## Tests

| Suite | Runs in | Covers |
|---|---|---|
| `tests/admin-report-delivery.test.php` | CI PHP job (`npm run test:php`, PHP 8.1) | body reader limits and explicit errors; association rules; staging refusal and manifest-failure cleanup; staging targets from the DB |
| `tests/admin-report-delivery.test.ts` | `npm test` (static half); CI Node job, with the runtime required (all 35 checks) | static route/limit/deploy/CI contracts (always); with php-wasm: the real `api/admin/*.php` routes on a throwaway SQLite DB with a recording mailer that never sends: success, every failure path, cross-order association, mail failure, resend, fallback endpoints; the real client (`deliverOrderPdfPayload` → `api.approveOrder`), inline and staged; the PHP suite above under PHP 8.1 |
| `tests/browser/admin-report-delivery.spec.ts` | manual (`npx playwright test …`), needs php-wasm | real Chromium renders (en + ta) through the real client into the real PHP gate; attachments byte-identical, named for the right order |

The real-route checks need the test-only PHP-WASM runtime:
`npm install --no-save @php-wasm/node@3.1.54 @php-wasm/universal@3.1.54`. It bundles every PHP version
(~480 MB), so it is not a devDependency. Locally, without it, those checks report SKIP and the static
contracts still run.

In CI they cannot be skipped. The `Node test suite` job in `.github/workflows/build.yml` runs `npm test`,
then installs exactly that pinned runtime (`--no-save`, so `package.json`, `package-lock.json` and
`bun.lock` are untouched), then runs this file again with `ASTRO_REQUIRE_PHP_WASM_TESTS=1`. That flag
turns a missing runtime into a failure, the same convention as `ASTRO_REQUIRE_MPDF_TESTS` in the PHP job.
A static check in the file asserts this wiring. The runtime is installed after `npm test`, so the other
optional php-wasm suites keep their existing CI behaviour.

With the original route files from `9440d06` swapped in, 27 of the 35 Node checks fail. They include the
end-to-end client check, which fails with the exact production message. The other 8 pass for two reasons:
- They cover behaviour that was already correct: the 422 with no PDFs, the low-resolution rejection,
  `approve_order.php`'s unbounded read, the client failure path, and no PHP warnings.
- They test code the swap leaves in place: the limits contract, the client's 413 message, and the CI
  wiring.

The browser spec fails with the exact production message.

Helpers: `scripts/php-admin-api-bridge.mjs` runs the real admin API under php-wasm (doubles only for the
database connection and the SMTP transport, under `tests/fixtures/admin-delivery/`).
`scripts/php-wasm-run.mjs [--php 8.1] <file.php>` runs any PHP test file without a native PHP.

## Deploying

Upload `api/request_body.php` with the changed `api/admin/*.php` files and the new frontend build
(`npm run build:zip` includes everything). No `config.php`, `.user.ini`, `.htaccess` or database change is
needed. To verify, send one pending order from `/admin`. In the host's access log, the
`POST /api/admin/orders/<id>/approve` request (several MB) should now return `200` instead of `422`.

## Not changed (found during the investigation)

- The customer-dashboard resend calls `POST /api/services/orders/:id/request-resend-email` and
  `/services/(orders|family-orders)/:id/stage-doc`, which have no PHP handlers.
- The browser's failure telemetry posts to `/api/services/client-error`, which has no PHP handler, so
  production keeps no application-level record of failed approvals. Web-server access logs are the
  evidence source.
- Multi-person item sends still fall back to server-rendered PDFs when a browser PDF is absent. With the
  body limit fixed, the browser PDFs now arrive, but the fallback policy itself is unchanged.
