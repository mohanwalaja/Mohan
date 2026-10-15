# Crawlable links, homepage structured data, verified customer reviews

**Date:** 2026-10-15 · **Source:** SEO audit of astrosivam.com (2026-10-15) · **Status:** FIXED

Follow-up to [SEO_STATIC_PRERENDER_FIX.md](SEO_STATIC_PRERENDER_FIX.md): the
pages now ship real HTML, and this round makes that HTML navigable, describes
the homepage to machines, and replaces stale testimonials with reviews from
paying customers.

## 1. Internal navigation was not crawlable (severity: high)

**Finding.** Every internal link (header, footer, policy links, service cards)
was a `<button data-route="…">` whose click called the SPA router. The
prerendered homepage contained exactly **two** anchors (Facebook and a
`mailto:`). Crawlers could not follow a single internal link, and visitors could
not middle-click, copy a link address or open a page in a new tab.

**Fix.**

- `src/components/common/RouteLink.tsx` renders `<a href="/canonical-path"
  data-route="key">`. A plain left-click is intercepted (`preventDefault` +
  SPA transition, so navigation stays instant). Everything else is left to the
  browser: Ctrl/⌘-click and middle-click open a new tab, Shift-click a window,
  `target="_blank"` is honoured, and "Copy link address" works.
- `src/services/routePaths.ts` (`routeHref`) is the single route-key → URL map.
  Links point at the **canonical** URL that has a prerendered document
  (`/privacy-policy`, `/terms`, `/payment-policy`, `/refund-policy`), never at
  the `/policy-*` aliases that `.htaccess` only keeps as 301s. `App.tsx` pushes
  the same URL, so the address bar after an in-app click is the indexed URL
  (it used to show `/policy-privacy`).
- Converted to links: Navbar (brand, desktop and mobile nav, login/register,
  dashboard/admin), Footer (brand — previously a clickable `<div>` — "Contact
  Us", services, company and policy links), homepage hero "How it works" and
  service cards, Services page cards, policy tabs and inline links, How-it-works
  CTAs (`HowItWorksPage.css` got matching `a` selectors), 404 page, Team page,
  login ↔ register links, admin "return to site", dashboard sign-in/quick-order
  links, and the post-order "View in Customer Dashboard" buttons.
- Still buttons, because they are actions rather than navigation: sign out, cart,
  menu toggles, "View services" (scrolls within the page) and "Top".
- `data-route` stays on every link, so the hover/focus/touch chunk prefetch
  (`services/routeChunks.ts`) works unchanged.

**Result.** The prerendered homepage now has 39 anchors, and every internal one
points at a canonical, prerendered URL.

**Guards.**

- `scripts/prerender.mjs` → `crawlableLinkProblems()`. **The build fails** if
  any document ships a `<button data-route>`, an `<a data-route>` without a
  canonical href, or lacks links to the public pages.
- `tests/crawlable-links.test.tsx`. Pins `routeHref` against the prerender
  route table and the `.htaccess` alias list. It also runs RouteLink's real
  click handler against plain, modifier, middle-button and `target=_blank`
  clicks, and scans the source and the shipped documents.
- `tests/browser/homepage-navigation.spec.ts` (CI smoke job). In a real
  browser it checks that a plain click keeps the same document, that Back
  works, that Ctrl/⌘- and middle-click open a new tab and are not
  `preventDefault`-ed, and that no `button[data-route]` exists.

## 2. Homepage structured data was missing

**Finding.** There was no `FAQPage` for the five homepage FAQs and no
`Review`/`AggregateRating` for the testimonials.

**Fix.** Both are rendered *by the homepage itself* (`components/common/JsonLd.tsx`)
from the same arrays that render the visible content, so the markup cannot
describe text the visitor does not see:

- `FAQPage` is built from `src/data/homeFaq.ts` (moved out of `HomePage.tsx`
  verbatim).
- One `Review` per displayed review, with author, `datePublished`,
  `reviewBody` and `reviewRating`. Its `itemReviewed` is the service bought:
  the same `@id` as the Service node in `index.html`, plus that service page's
  URL.
- `AggregateRating` on the Organization equals the visible summary ("4.9 out
  of 5 · N reviews"). It counts every curated testimonial plus **every**
  published customer review, not just the page of reviews returned.
- Not in `index.html`: that file is the template of every prerendered page,
  and these items are homepage content only.
- Not marked `data-prerender-seo`: the markup lives in the page tree, so it is
  in the prerendered HTML *and* the live DOM, and it leaves with the page on
  SPA navigation.
- `serializeJsonLd()` escapes `<`, `>` and `&`, so review text written by a
  customer can never close the `<script>` element.

**Guards.**

- `homepageStructuredDataProblems()` in `scripts/prerender.mjs` **fails the
  build** in these cases:
  - the homepage lacks FAQPage or Review markup;
  - any question, answer, review body, author or rating value is not visible
    on the page;
  - another page carries this markup.
- `tests/homepage-structured-data.test.ts` covers the rest.

**Expectations.** Google currently shows FAQ rich results only for a few
authoritative sites. It also shows no review stars for an organisation's
reviews of itself ("self-serving reviews"). The markup is valid and truthful
for every consumer, but it is not a promise of rich results.

## 3. Testimonials were stale and unauditable — paid customers can now review

**Finding.** Six hand-entered testimonials, dated Dec 2025 – Feb 2026, tied to
no order, with an unexplained green check next to each name.

**What was deliberately not done.** The six testimonials were **not re-dated
or rewritten**. That would misrepresent them. They are kept verbatim in
`src/data/testimonials.ts`, with their real month as an ISO date (`2026-02`), a
link to the service page each one is about, and no "verified" badge, because
they were not submitted through an order. Freshness now comes from real
customers.

**How reviews work.**

1. **Who can write one.** Only the owner of a **paid** order (`PAID` mode,
   amount > 0, payment confirmed) whose report was **delivered** (`COMPLETED`,
   or the legacy `GENERATED`) and **not refunded**. The single rule is
   `astro_review_order_eligibility()` in `api/reviews.php`. It is enforced on
   submit, re-checked when an admin publishes, and applied again when the
   public list is read: a refund after publication hides the review.
2. **Where.** Customer Dashboard → every eligible order card shows "Rate &
   review" (`OrderReviewStrip`). The form (`ReviewFormModal`) asks for:
   - a rating of 1–5;
   - an optional headline;
   - the review (20–1500 characters);
   - a display name (pre-filled as "Kavita M.");
   - an optional location;
   - consent to publication.

   Links and email addresses are refused. Multi-person orders can review each
   service they contained. Editing sends the review back to moderation.
3. **Moderation.** Admin Portal → **Customer Reviews**:
   - Publish, Don't publish (with an optional reason the customer sees), or
     Delete.
   - Each review shows the order number, amount, order status and customer
     email it is verified against.
   - The panel reminds moderators to publish critical reviews too. Hiding low
     ratings misleads customers and breaks consumer-protection rules on
     reviews.
4. **Homepage.** When the visitor scrolls near the reviews section, published
   reviews load (`GET /api/services/reviews`, public fields only: display name,
   optional location, service, rating, text, publication date).
   - They are listed first, newest first, labelled **Verified purchase**, and
     linked to their service page.
   - The prerendered HTML (for crawlers that never run JavaScript) contains
     the curated testimonials. Google renders JavaScript and sees both.

**API** (`api/reviews.php`, wired in `api/services/index.php` and `api/admin/index.php`):

| Method & path | Who | What |
|---|---|---|
| `GET /api/services/reviews?limit=&service=` | public | published reviews + totals over all of them |
| `POST /api/services/reviews` | customer | create / edit one review (rate limited: 20/hour) |
| `GET /api/services/my-reviews` | customer | own reviews + which orders/services can be reviewed |
| `GET /api/admin/reviews?status=` | admin | moderation queue + counts |
| `POST /api/admin/reviews/:id/approve` · `/reject` | admin | publish / hide (reason optional) |
| `DELETE /api/admin/reviews/:id` | admin | delete |

Every action is written to the audit log: `REVIEW_SUBMITTED`, `_UPDATED`,
`_APPROVED`, `_REJECTED` and `_DELETED`.

**Guards.** `tests/customer-reviews.test.ts`:

- Client logic, and the client limits matching the server constants.
- Migration 011, `schema.sql` and the runtime guard declaring the same table.
- **The real PHP routes under PHP-WASM** (SQLite test double). They cover
  every eligibility case, validation and sanitising (Tamil kept, control and
  bidi-override characters removed), moderation, the public field set, edit →
  re-moderation, refund-after-publish and the audit trail.
- CI runs that runtime half with `ASTRO_REQUIRE_PHP_WASM_TESTS=1`, so it
  cannot silently skip.

## 4. Follow-ups (same day)

### "Rate your report" in every paid delivery email

Customers were never told they could review. Every delivery email of an order
that will be reviewable once delivered now carries a **How was your report?**
block with a **Rate your report** button
(`astro_review_invite_email_html()` in `api/reviews.php`):

- **Link.** `https://astrosivam.com/dashboard?review=<order number>`. It always
  uses the canonical host, never the host of the admin request that sent the
  email.
- **Who gets it.** The same rule as review eligibility
  (`astro_review_invite_applies()`), applied to the order as the delivery
  leaves it (`COMPLETED`, payment confirmed). So it goes to every paid
  customer, whatever they may think of the report. Free-beta, zero-amount,
  cancelled, rejected and refunded orders get no invitation. The wording asks
  for an *honest* review.
- **Templates.**
  - `api/admin/index.php`: single-order approve and resend.
  - `api/admin/family_approval.php`: family bundles; first email only when
    the delivery is split.
  - `api/admin/order_items.php`: multi-person orders, **only on the email that
    completes the order** (`astro_order_items_send_completes_order()`), never
    on a partial delivery.
  - `api/admin/approve_order.php`: the no-rewrite fallback endpoint.
- **Dashboard.** `src/services/reviewInvite.ts` takes `?review=` off the
  address bar and remembers it for the tab (sessionStorage). The invitation
  therefore survives the sign-in detour (dashboard → login → dashboard). Once
  `my-reviews` has loaded, the dashboard opens that order's review form. If
  this account cannot review the order, an explanation is shown instead. A
  signed-out visitor is told which order the sign-in is for.
- **Bug fixed on the way.** The dashboard fetched reviews only on mount. On a
  fresh page load the session check (`GET /api/auth/me`) had not resolved yet,
  so "Rate & review" could be missing. It now refetches as soon as the
  customer is known.

### One WebPage JSON-LD per page, in the page tree

`scripts/prerender.mjs` used to bake each route's `WebPage` JSON-LD as a
`data-prerender-seo` head tag, which `main.tsx` deletes at boot. Google's
rendered DOM never had it, and its `name` was raw title HTML (`Refund &amp;
Cancellation Policy`).

- `<SEO>` now renders it through `<JsonLd id="webpage">`
  (`buildWebPageJsonLd()` in `src/services/structuredData.ts`), using the same
  canonical, title and description as the head tags. Every indexable page
  carries one in the prerendered HTML **and** in the live DOM, and it is
  replaced on SPA navigation. `noindex` pages carry none.
- `webPageStructuredDataProblems()` in the prerender **fails the build** if an
  indexable document lacks exactly one, or if its `@id`/`url`, `name` or
  `description` differ from the canonical, `<title>` or meta description. It
  also fails if a `noindex` document carries one.

**Guards.**

- `tests/customer-reviews.test.ts`:
  - invitation link parsing and storage, with a fake browser;
  - every template wired to the one helper;
  - under PHP-WASM: the eligibility matrix, escaping, the multi-person
    "completes the order" rule, and the **real approve route** emailing the
    invitation for a paid order and none for a free-beta one. The recording
    mailer double now keeps the email HTML.
- `tests/browser/review-invite.spec.ts` (new CI step in the Playwright job):
  - a signed-in landing with a slow session check;
  - the signed-out → log in → form flow;
  - an order the account cannot review.
- `tests/homepage-structured-data.test.ts`: `<SEO>` → guard round trip,
  guard mutations, and every shipped document.
- `tests/browser/homepage-navigation.spec.ts`: in a real browser, the WebPage
  is in the live DOM, is swapped on SPA navigation (home → refund policy), and
  disappears on `/login`.

## Deploying

1. Upload the build as usual (`npm run build:zip`). `api/reviews.php` and the
   migration are part of `api/`.
2. Run `api/migrations/011_customer_reviews.sql` in phpMyAdmin. This is
   optional: `astro_reviews_ensure_table()` creates the table on first use,
   and retries without foreign keys on hosts that refuse them.
3. The sitemap's homepage `lastmod` moved to 2026-10-15. Re-submit
   `sitemap.xml` in Search Console if you like.
4. Nothing to configure for the "Rate your report" invitation. Paid delivery
   emails carry it once the updated `api/` files are uploaded:
   - `api/reviews.php`;
   - `api/admin/index.php`, `family_approval.php`, `order_items.php` and
     `approve_order.php`.

## Notes

- The homepage carries both its `WebPage` (`@id` `https://astrosivam.com/`)
  and the `FAQPage` (`@id` `…/#faq`). They are separate entities, which is
  valid.
- `tests/browser/admin-free-orders.spec.ts` (5 tests) and
  `repeat-family-checkout.spec.ts` (1 test) already fail on `main` before this
  change: they look for checkout copy that has since changed. They are not part
  of CI.
