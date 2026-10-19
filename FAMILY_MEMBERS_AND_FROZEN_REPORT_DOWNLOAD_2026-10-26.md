# Saved family members, no silent auto-fill, frozen report downloads (2026-10-26)

Customer requests implemented together:

1. **Order forms no longer take the signed-in customer's own birth details
   by default.** Every order form (Birth Jathagam, Marriage Compatibility,
   Subha Muhurtham, Baby Naming, and each person card in the multi-person
   checkout) now starts **blank** with a "Who is this report for?" picker:
   *Enter new details* (default), *Myself*, or any saved family member.
   Picking someone fills the form; nothing is ever filled silently.
2. **Saved birth details live in one place: the Family Members tab** (new
   tab in the dashboard, **maximum 6 people in total, the customer included** —
   there is no separate saved birth profile), so future orders need no form
   filling.
   "Order for <name>" on a member card hands that one explicit pick to
   the order form (one-time `sessionStorage` hint, consumed once).
3. **Delivered reports can be downloaded from the dashboard — frozen.**
   The download renders the immutable snapshot frozen on the order date
   and can never recalculate: it always produces the report as ordered,
   never a refreshed one. Report **only** — the tax invoice stays
   email-only, as before.
4. **Reports mention the date of prepared.** Every report prints its
   prepared date, and for a frozen download that is the original order
   date — never the re-download date. Birth Jathagam gains the stamp it
   was missing (PHP page headers + the TS builder footer); Wedding
   Matching, Muhurtham and Baby Naming already printed an issued date,
   which is now frozen-safe (it comes from the snapshot).

## The always-overwrite bug that had to die first

`api/services/index.php` saved the *ordered person's* birth details over
the customer's own `birth_profiles` row on **every** order:

```php
if (($saveAsProfile || true) && ...) { ... }
```

So ordering for a spouse quietly replaced the customer's own profile
(and the next order then auto-filled *those* details). Now the profile
is written only when the client explicitly sends `saveAsProfile`, which
the Birth Jathagam form does only when **"Myself"** was picked (or the
customer ticked the save box for themselves). Picked family members are
updated through the family API; new people can be saved as family from
the form with a relation. No order can touch `birth_profiles` otherwise.

## Frozen snapshot design

- `api/migrations/016_family_members_and_report_snapshot.sql` adds the
  `family_members` table and `report_snapshot` / `report_snapshot_at`
  on `orders` and `order_items`, then one-time backfills by **copying**
  the stored `calculated_result` (never recalculating history).
  `api/schema.sql` carries the same for fresh installs. The family table
  is also created at runtime (`CREATE TABLE IF NOT EXISTS`, the project
  convention for first-boot tables); snapshot columns are migration-only
  and the code verifies them (`astro_table_columns`), degrading to the
  stored `calculated_result` — still frozen, still never recalculated —
  until the migration runs.
- `astro_write_report_snapshot()` (api/config.php) writes the snapshot
  **once at order creation** in all three write paths (single order,
  legacy multi-order, multi-person header + items) and only while the
  snapshot is still empty. Admin preview/send never call it, so later
  recalculations for fulfilment can never thaw a frozen report.
- `GET /api/services/orders/:id/report-snapshot` (optional `?itemId=`):
  owner-only (`WHERE id = ? AND user_id = ?`, foreign ids look missing),
  delivered orders only (`COMPLETED`/`GENERATED` + `has_pdf`, per-item
  `SENT`), rate-limited, report-only. It returns the frozen snapshot
  BODY as JSON and nothing else: no recalculation, no rebuild/upgrade
  path, and no writes to any result column. The browser then renders it
  with the same builders and print profile as the emailed PDF. (This
  replaced the old `/report-pdf` route, which streamed a server-rendered
  file; the mPDF renderer itself was removed in Oct 2026.)
- Prepared date = the snapshot's `generatedAt` (filled from
  `report_snapshot_at`, else the order's `created_at`, when a legacy
  stored result lacks one). It is rendered into the Birth Jathagam page
  headers (`Prepared on: 05 Feb 2026` / தயாரிக்கப்பட்ட நாள் / तैयार तिथि,
  on the existing reference line so fixed page heights do not move), the
  TS Jathagam footer, and the dashboard shows "Prepared on <date> •
  <Language>" next to each download. Live previews keep today's date
  because their result was just calculated.

## Print-quality dashboard download (2026-10-19 update)

The dashboard download used to be the server-side mPDF render — a visibly
thinner document with different pagination than the emailed PDF. It now
renders the frozen report in the customer's browser through the SAME HTML
builders and the SAME 300 dpi capture profile (`EMAIL_RENDER_OPTIONS`) that
produced the emailed document and the admin's approved preview, so the file a
customer downloads from their profile is the file that was emailed to them.

- `GET /api/services/orders/:id/report-snapshot` (optional `?itemId=`) returns
  the frozen snapshot body for ONE delivered report to its owner. It is the
  same owner-only/delivered-only/per-item-`SENT` gate as the old PDF route,
  is rate-limited separately, and performs no recalculation and no writes. The
  orders list still carries metadata only (`hasReportSnapshot`,
  `reportSnapshotAt`) — the body is fetched on the Download click.
- `downloadPaidReportPdf()` (exporter) renders that snapshot at the print
  profile through `renderEmailPdfBase64` (the same helper every paid email
  uses, including the 2480 × 3508 px floor) and saves it. Only a device that
  cannot allocate the print canvas drops to the documented last-resort
  density; if even that fails, the dashboard reports the failure — the server
  no longer has a PDF renderer to fall back to. No path recalculates the
  report.
- A legacy snapshot without `generatedAt` is stamped with `reportSnapshotAt`
  (else the order's `created_at`) before rendering, so it can never print
  today's date.

Deployment needs no schema change: the route reads the same snapshot columns
(falling back to `calculated_result` when they are absent). Upload
`api/services/index.php` and the rebuilt frontend bundle.

## Verification

- `tests/family-members-and-frozen-download.test.ts` (registered in
  `scripts/run-tests.mjs`): pure saved-people logic, the client/server
  relation-enum match, per-file wiring contracts (no auto-fill remnants,
  picker present, save-gating, owner scoping, 6-member cap, snapshot
  write-once, forbidden recalculation calls in the snapshot block, the
  removed server PDF route and renderer,
  migration/schema parity), plus real PHP renderer execution under
  PHP-WASM when installed — a frozen legacy baby snapshot renders as
  frozen (fails closed instead of recalculating) while the same input
  without the frozen flag still recalculates for fulfilment, and the
  Jathagam header prints the frozen 2024 prepared date.
- `npx tsc --noEmit`, `npm test`, `npm run build` all pass.

Deployment note: run migration 016 on production (it is idempotent-safe
to skip only in the sense that nothing breaks without it — family saving
works immediately, downloads use stored results — but the true
snapshots and the history freeze need it applied once).
