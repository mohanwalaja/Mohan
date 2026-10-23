import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const testFiles = [
  'tests/user-design.test.ts',
  'tests/user-design-regressions.test.ts',
  'tests/user-design-dark-surfaces.test.ts',
  'tests/remedies.test.ts',
  // Cheap and first on purpose: it enforces the requested PHP-only GitHub
  // Actions setup so additional workflows cannot silently return.
  'tests/ci-security-gate.test.ts',
  // Also cheap and first: it pins the money paths' ordering of operations
  // (claim the payment intent before inserting order rows) against silent
  // refactors that no runtime test in this sandbox can reach.
  'tests/checkout-idempotency-contract.test.ts',
  // The family-order body limit (2026-10-20): ONE Subha Muhurtham report carries
  // a ~1.1 MB panchangam scan, so a tray holding a Muhurtham report crossed
  // config.php's 1 MiB getJsonBody() cap, the body was dropped, and the admin
  // saw "At least one service chart item is required in the family tray." with
  // four charts on screen. Pins the ORDER limit, the single body read and the
  // explicit order-body errors that can never blame an empty tray again.
  'tests/family-order-body-limit.test.ts',
  // Same reason, money leaving instead of entering: the 90% pre-approval
  // refund, its 3-working-day settlement promise and the refusal to refund an
  // approved (delivered) order must stay identical in the policy engine, the
  // one-click admin handler, the admin portal and the customer-facing page.
  'tests/refund-policy-contract.test.ts',
  // Same policy, but EXECUTED in a real PHP runtime when the optional
  // php-wasm dev dependency is installed (it SKIPs otherwise): the 90% split
  // and the 3-working-day calendar are arithmetic, and arithmetic must be run.
  'tests/refund-policy-php-runtime.test.ts',
  // And the inverse guard: the retired currency/branding must never come back.
  // It scans the shipped tree (frontend, PHP API, fixtures, scripts, CI, docs)
  // and fails with file+line for anything outside the three approved
  // functional occurrences (IANA zone, dial code, birthplace data).
  'tests/retired-branding-guard.test.ts',
  // The disclosure policy: the Udyam/MSME registration number (registered in
  // India) is PRINTED ON THE INVOICE and shown on the Contact page, while the
  // office address is CONTACT-PAGE-ONLY. Both invoice layouts are rendered here,
  // the PHP mirror of the number is compared, and repo scans prove no template
  // retypes the number or leaks the street address. The PHP runtime equivalent
  // runs in tests/invoice-business-registration.test.php.
  'tests/business-registration.test.ts',
  // Executes the backup script against a stubbed mysqldump: proves the marker,
  // the retention rotation and the "a failed dump cannot look like a backup"
  // failure path, none of which a code-reading review would catch.
  'tests/backup-and-health-contract.test.ts',
  // Also early: the render density (200 dpi A4 floor, 2.2× capture, JPEG 0.88
  // with a 0.80 floor) and the per-document byte budget are a contract. A
  // "quality" commit that quietly raises them would double every email again.
  'tests/pdf-pipeline-integrity.test.ts',
  'tests/report-pdf-size.test.ts',
  // The other half of the same contract: the CUSTOMER's dashboard download
  // must render the frozen snapshot at that same print density (the emailed
  // document), with no server-side renderer left to substitute a thinner one.
  // Also pins the profile copy the customer asked to remove.
  'tests/customer-report-download-quality.test.ts',
  // Same download, but does it DELIVER? Customer bug 2026-10-21 ("download the
  // report from user profile can't download", iPhone Safari: spinner, then
  // nothing). Pins the four defects that produced a silent spinner — the one
  // customer API call with no URL fallback, unbounded rAF waits that also
  // blocked the serialised render queue, a blob URL revoked 1.5 s after the
  // click, and a scripted click iOS drops once the gesture has expired — and
  // EXECUTES the fixes (a never-firing rAF, a fake browser taking the file, the
  // API fallbacks against a stub server) while re-asserting that print quality
  // did not move to get there.
  'tests/customer-report-download-delivery.test.ts',
  // The customer-facing half of the same flow: while a download runs, the
  // dashboard and the preview/sample modal say "Downloading…", never
  // "Rendering…"/"Preparing…" (the file is the preview, not a new render).
  'tests/download-progress-labels.test.ts',
  // Right after the render contract: the rendered PDFs must also REACH the
  // server. The admin "Approve / Send" routes once read their ~3 MB bodies
  // through config.php's 1 MiB getJsonBody() cap, which silently emptied them
  // ("Preview-quality report and invoice PDF did not reach the server"). Static
  // route/limit contracts always run; with php-wasm installed it also executes
  // the real routes (SQLite + a recording mailer that never sends) and the real
  // client delivery code against them when the optional local runtime is installed.
  'tests/admin-report-delivery.test.ts',
  // The CDN safety contract: two "dormant" bugs (a cacheable API response and a
  // URL->encoding map without Vary) become customer-visible incidents the moment
  // a shared edge cache sits in front of the origin. It also EXECUTES the
  // real PHP for the client-IP spoofing matrix and the session-cookie Secure
  // flag, so a resolver "simplification" cannot pass by reading plausibly.
  'tests/cloudflare-cdn-contract.test.ts',
  'tests/jathagam-summary-parity.test.ts',
  'tests/namakaran-meanings.test.ts',
  'tests/logo-assets.test.ts',
  'tests/mobile-inputs.test.tsx',
  // Keep the render-critical shell self-hosted, subsetted and within its small
  // preload budget so the Google Fonts CSS round-trip cannot creep back in.
  'tests/self-hosted-fonts.test.ts',
  'tests/birth-details-validation.test.ts',
  'tests/birth-details-edge.test.ts',
  'tests/timezone-offset.test.ts',
  'tests/family-report-tz-staleness.test.ts',
  'tests/family-report-engine-parity.test.ts',
  'tests/astrology-accuracy-regression.test.ts',
  'tests/birth-jathagam-sample.test.ts',
  'tests/subha-muhurtham-sample.test.ts',
  'tests/node-php-parity.test.ts',
  'tests/astrology-integrity-regression.test.tsx',
  // Birth Jathagam page 1 (owner request 2026-10-20): the English Janma Rasi
  // row prints "Mesham/Aries" (all twelve signs) in bold, the star name stays
  // and is bold, and every dosha card explains its dosha in exactly two
  // sentences in English, Tamil and Hindi. One JSON feeds both renderers.
  'tests/jathagam-page1-signs-and-doshas.test.ts',
  // Reads every customer-facing report as a layperson would: no duplicated
  // condition, every Sanskrit term glossed inline, no English fragment inside a
  // Tamil/Hindi report, plain-English verdicts.
  // The same readability work, second half: the marriage report printed
  // "Utthamam", "Madhyamam" and "Incompatible" in one Status column. All three
  // ranks must now read as one ladder, in the order's language, on both
  // renderers - and the appended guide sheet must not leave a header at "of 2".
  // Page 1 of the marriage report printed three measures of the same match
  // (7.5 / 10, 75%, 8 / 10 Poruthams matched) with nothing saying what each
  // measured. One number must survive, and the meter must agree with it.
  // A verdict with no next step is a dead end. The marriage report must hand a
  // matching couple to the Subha Muhurtham service (and a non-matching one to a
  // human), and Baby Naming must say why the first sound matters at all.
  'tests/report-next-steps.test.ts',
  'tests/jathagam-chart-legend.test.ts',
  'tests/wedding-single-score.test.ts',
  'tests/wedding-verdict-labels.test.ts',
  'tests/report-readability-guard.test.ts',
  // One shared glossary (api/astrology/report_glossary.json) explains every
  // specialist term in one line, in all three languages, in the PDF and the
  // browser preview. See docs/REPORTS_READABILITY_AUDIT_2026-10-20.md.
  'tests/report-glossary.test.ts',
  'tests/jathagam-card-rules.test.ts',
  'tests/jathagam-lucky-indicators.test.ts',
  'tests/vimshottari-dasha-timeline.test.ts',
  'tests/dosha-rule-accuracy.test.ts',
  'tests/porutham-reference.test.ts',
  'tests/muhurtham-astronomy-regression.test.ts',
  // Owner decision (2026-10-24): the Muhurtham product advertises and prints
  // ONLY the good time. The avoidance windows stay an internal part of the scan
  // (they are how Nalla Neram is derived) but must never reappear in the
  // homepage card, the Muhurtham page, the Services feature list, the FAQ, a
  // testimonial, the invoice line, the SEO description, the rules knowledge
  // base, the order preview table — or the sample PDF a visitor opens before
  // paying, which this renders for real in en/ta/hi.
  'tests/muhurtham-good-time-only.test.ts',
  // Order journey (owner request 2026-10-24): every public page, every delivery
  // FAQ and the AI Astrologer must state the same four steps — the order goes
  // to the India-based priest team, they calculate and verify it, the
  // administrator approves it, and the PDF report + tax invoice are emailed to
  // the registered address with the priest-team verification line. The copy
  // test pins the surfaces; the runtime test EXECUTES the chat answer in en/ta/hi.
  'tests/order-journey-copy.test.ts',
  'tests/ai-astrologer-order-journey.test.ts',
  'tests/sample-engine-meaning.test.ts',
  'tests/report-dob-format.test.ts',
  'tests/ai-astrologer-sources.test.ts',
  'tests/ai-astrologer-knowledge.test.ts',
  'tests/ai-astrologer-report.test.ts',
  'tests/ai-astrologer-access.test.ts',
  'tests/ai-astrologer-report-language.test.ts',
  'tests/ai-astrologer-family-persons.test.ts',
  'tests/ai-astrologer-provider.test.ts',
  'tests/ai-astrologer-consistency.test.ts',
  'tests/ai-astrologer-failure-path.test.ts',
  'tests/ai-astrologer-guided.test.ts',
  'tests/ai-astrologer-guided-focus.test.ts',
  'tests/ai-astrologer-guided-runtime.test.ts',
  'tests/ai-astrologer-service-runtime.test.ts',
  'tests/ai-astrologer-php-runtime.test.ts',
  'tests/ai-astrologer-all-questions-complete.test.ts',
  'tests/ai-astrologer-full-check-and-hindi-purge.test.ts',
  'tests/jathagam-page2-wiring.test.ts',
  'tests/jathagam-page2-php-parity.test.ts',
  'tests/all-four-services-parity.test.ts',
  // Deployment-shape contract for the code-split build: the six heavy route
  // chunks must exist inside dist/assets, and the cPanel root folder list must
  // never grow. Runs its built-output checks whenever dist/ is present.
  'tests/dist-shape.test.ts',
  // SEO prerender contract (audit 2026-10-14): every URL must ship its own
  // document with a self-referencing canonical and real body content — the
  // identical-empty-shell + homepage-canonical + fake-hreflang bug class.
  'tests/seo-prerender-contract.test.ts',
  // The sitemap serving contract (2026-10-17 "sitemap.xml 406"): the sitemap
  // was served as application/x-gzip with no Content-Encoding header (the
  // compressed sibling was negotiated but its encoding was never declared),
  // and the host WAF answers 406 to non-browser clients. Both are pinned
  // here, together with the rule that the WAF is never switched off wholesale.
  'tests/sitemap-serving-contract.test.ts',
  // SEO audit 2026-10-15. (1) Internal navigation is real <a href> links to
  // canonical URLs — the prerendered homepage used to ship two anchors and no
  // followable internal link; RouteLink's click semantics are executed here.
  'tests/crawlable-links.test.tsx',
  // (2) Homepage FAQPage + Review/AggregateRating JSON-LD, built from the same
  // arrays as the visible FAQ and review cards, homepage-only.
  'tests/homepage-structured-data.test.ts',
  // (3) Verified reviews from paid, delivered orders: client logic and wiring
  // always; the real PHP routes (eligibility, moderation, public fields,
  // refund-after-publish) whenever the dev-only php-wasm runtime is present.
  'tests/customer-reviews.test.ts',
  // Chat-gateway webhook SSRF guard (audit 2026-10-15): both sender branches
  // validate the admin-configured URL before the order payload is posted, the
  // transport cannot be bounced off-host by a redirect, and saving a bad URL
  // in admin settings fails fast.
  'tests/chat-webhook-ssrf.test.ts',
  // The mobile white-screen fix (2026-10-14): the inline boot-critical style
  // and the splash at the top of every prerendered document must keep painting
  // the brand surface before the stylesheet and the bundle arrive — and must
  // keep handing the screen to the app on every JS path (the hand-off helper
  // is EXECUTED here against a stub DOM, not just read).
  'tests/boot-splash-contract.test.ts',
  // Lazy route modules must keep exporting the component names App.tsx maps.
  'tests/route-chunk-exports.test.ts',
  // The initial-JS budget (audit PERF-1): the homepage must not download the
  // PDF renderer or Leaflet — not on first paint, not on an idle callback —
  // and the deferred features must stay reachable on demand. Runs both
  // source-level checks and (when dist/ exists) checks over the shipped bytes.
  'tests/initial-js-budget.test.ts',
  'tests/lockfile-drift.test.ts',
  // USD is the base price; INR is always auto-calculated (Services page,
  // admin panel, checkout and the PHP order/payment checks). Also pins the
  // USD → INR RATE as an admin setting (₹95 default, ₹40–₹300 accepted band):
  // a hard-coded ₹84 silently under-charged every India price by ~12%.
  'tests/usd-base-pricing.test.ts',
  // The admin uploads an astrology team portrait instead of pasting a URL
  // (250 KB budget, shrunk in the browser, sniffed and renamed on the server,
  // folder cannot execute code). Executes the PHP rules when wasm is present.
  'tests/team-photo-upload.test.ts',
  // And the real routes end-to-end under PHP-WASM (upload -> member -> public
  // team card -> replace/delete cleanup), which is the flow the admin performs.
  'tests/team-photo-e2e.test.ts',
  // "Add Member" looked dead because the insert named columns api/schema.sql
  // never declared (HTTP 500, empty body, silently ignored). Runs the real
  // create/update routes against both the current and the pre-migration table.
  'tests/team-member-save.test.ts',
  // Every page in the desktop row must also be reachable from the phone menu
  // (the Astrology Team page was filtered out of it). Both menus now come from
  // services/navigation.ts, which this exercises directly.
  'tests/mobile-nav-team-link.test.ts',
  // "Publish every waiting review today" + the price-card promises (chat
  // window and refund percent must match the PHP they advertise). Runs the real
  // bulk-moderation route under PHP-WASM, including a refunded-order skip.
  'tests/reviews-publish-all.test.ts',
  // Saved family members + frozen report download: order forms must start
  // blank (explicit picker, never silent auto-fill), up to 6 family
  // members are saveable, and a dashboard re-download must render the
  // immutable order-date snapshot ("Prepared on" = the frozen date) with
  // zero recalculation. Includes real PHP renderer execution under
  // PHP-WASM when installed.
  'tests/family-members-and-frozen-download.test.ts',
  'tests/service-form-save-details.test.ts',
  // A brand-new user who signs in with Google must not be pushed into a
  // checkout with an empty form. Every service page re-checks the form after
  // sign-in, and the checkout modal refuses an incomplete payload outright.
  'tests/checkout-requires-birth-details.test.ts',
  // A half-filled order form survives the navbar Login link and a browser
  // refresh: the router returns the customer to the page they left, and each
  // report form restores its own short-lived draft (never a saved profile,
  // never consent or payment data, and never over live typing).
  'tests/form-draft-and-login-return.test.ts',
  // WhatsApp/Viber alerts + the download-language rule: downloads render
  // ONLY the ordered language (never all three, never switchable by
  // parameter), customers verify one saved number per app by OTP, and
  // order-status alerts go only to those verified numbers. Reports and
  // invoices are never sent over chat (email is the only document
  // channel). Includes real PHP helper execution under PHP-WASM.
  'tests/chat-alerts-verified-and-download-language.test.ts',
  // Birthday wishes (owner request 2026-10-21): customers who save birth
  // details can be wished on WhatsApp/Viber on those birthdays - their own
  // profile and their saved family members. Consent defaults OFF on the server
  // AND needs the customer's own switch, wishes go only to numbers verified in
  // that specific app, the text is a greeting in the customer's chosen language
  // (never a report, never an invoice), and a cron re-run or a second press of
  // the admin button messages nobody twice. Includes real PHP execution under
  // PHP-WASM (date rules, dedupe, dry run, per-run cap, gateway failure).
  'tests/birthday-wishes.test.ts',
  // Full security/CSRF, login/Google/Admin auth flows, multipart email delivery,
  // Ivory button contrast, and 1-click Email Birthday Wishes end-to-end suite.
  'tests/security-auth-email-birthday-audit.test.ts',
  // My Orders cards use the admin-style order/name/payment/action summary,
  // but keep per-order/per-person expansion and the customer-only download
  // icons beside report names. Delivery recovery stays visible even when closed.
  // Static ordering contract also runs where a browser is unavailable.
  'tests/order-card-collapse.test.ts',
  // Payment trust popup (owner request 2026-10-22): one tap at payment time
  // explains own-currency billing, PayPal-enabled cards without an account,
  // and card safety; top-right close, then continue to payment.
  'tests/how-payment-works.test.ts',
  // Accessibility (2026-10-21 audit): every page opens with 20+ focusable
  // header links, so a keyboard user had to traverse the whole navigation
  // before reaching the content. The skip link must be the first focusable
  // element on every route, must target the real <main> id, and must be a
  // readable, opaque panel when focused.
  'tests/a11y-skip-link-contract.test.ts',
  // RFC 9116: /.well-known/security.txt with a contact and a future Expires,
  // served as text/plain and shipped inside the deploy zip.
  'tests/security-txt.test.ts',
  // Full-system Birth Details, Worldwide Location Picker & Post-Order Recalculation suite.
  'tests/birth-details-and-location-upgrade.test.tsx',
  // AI Astrologer order-language sync & full security/UX audit contracts.
  'tests/ai-astrologer-tamil-order-and-audit.test.ts',
  // 100% Live-Preview High-Quality Email PDF System (zero server PDF system).
  'tests/high-quality-email-pdf-system.test.ts',
  // Upgraded Admin 1-Click Batch Approve, Multi-Select, Payment Verification & Retry System.
  'tests/admin-batch-approval.test.ts',
  // Audit S1/S2/S5, metadata.json cleanup & minimal 3-folder cPanel File Manager root hygiene.
  'tests/advisories-and-cpanel-root-hygiene.test.ts',
  // Audit S8: modular chapter decomposition across all 4 oversized source files + lazy AdminPortal split.
  'tests/s8-modular-architecture.test.ts'
];
const tsxCli = resolve(projectRoot, 'node_modules/tsx/dist/cli.mjs');

for (const relativeFile of testFiles) {
  console.log(`\n[TEST] ${relativeFile}`);
  const result = spawnSync(
    process.execPath,
    [tsxCli, resolve(projectRoot, relativeFile)],
    { cwd: projectRoot, stdio: 'inherit' }
  );

  if (result.error) {
    console.error(result.error);
    process.exitCode = 1;
    break;
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
