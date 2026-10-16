# Getting the service pages indexed — GSC, Bing & backlinks runbook

**Date:** 2026-10-16 · **Source:** index-coverage audit of astrosivam.com (2026-10-16) · **Status:** IN PROGRESS (on-site half shipped in this change; off-site half is manual)

**The finding.** `site:astrosivam.com` returns only the homepage, even though
the sitemap lists 14 URLs and every service page ships real prerendered HTML
(verified live). This is an **index-coverage problem, not a technical block**:
nothing on the site forbids indexing (`robots.txt` allows everything, no
`noindex` on public pages, self-referencing canonicals, crawlable links,
per-page structured data). The site's inner pages have recently changed from
an empty SPA shell to real documents, and the search engines have not yet
re-crawled, re-evaluated and indexed them — and a new/low-authority domain
needs a small amount of external signal (a few real backlinks) for the
money pages to move past "Crawled – currently not indexed".

## 1. What this change already did (on-site, shipped with the build)

- **Service-specific FAQ on every money page** (`src/data/serviceFaqs.ts`,
  rendered by `components/common/ServiceFaqSection.tsx`): /marriage-compatibility,
  /baby-naming, /birth-jathagam and /muhurtham each now carry 5 visible
  Q&As plus their own `FAQPage` JSON-LD. This is the single biggest on-site
  lever — each money page went from "a form" to a page of unique, query-matching
  prose ("10 porutham online", "baby naming by nakshatra", …).
- **Keyword-targeted titles/descriptions** for the money queries:
  - /marriage-compatibility → `10 Porutham Online: Marriage Compatibility (Kundali Matching) | ASTRO SIVAM`
  - /muhurtham → `Subha Muhurtham (Auspicious Dates) Report Online | ASTRO SIVAM`
  - /baby-naming description now opens with the exact query `Baby naming by nakshatra`.
- **`BreadcrumbList` JSON-LD on every indexable page** (Home → Services → page),
  so Google has an explicit site structure.
- **Keyword-anchored cross-links** between the four service pages
  (`components/common/RelatedReports.tsx`): each money page now internally links
  the other three with anchors that name the report.
- **Site-wide `Service` entities now carry their page URL** (`index.html` graph),
  tying the reviews' `itemReviewed` to resolvable pages.
- **Sitemap `lastmod` bumped to 2026-10-16 for the four service pages**;
  `public/sitemap.xml` stays byte-identical to the build output
  (`tests/seo-prerender-contract.test.ts` pins this).
- **Build guards** so none of the above can silently regress
  (`scripts/prerender.mjs`: `homepageStructuredDataProblems` extended to the
  service FAQs, new `breadcrumbProblems`; tests in
  `tests/homepage-structured-data.test.ts`).

**Deploy it** with the usual `npm run build:zip` + cPanel upload
([deployment guide](BIGROCK_CPANEL_DEPLOYMENT_GUIDE.md)) and — if Cloudflare
cache Rule 3 is enabled — purge the cached HTML afterwards
([Cloudflare runbook §5](CLOUDFLARE_CDN_SETUP.md)).

## 2. Google Search Console (the highest-leverage manual step)

Do this **once, right after the deploy**:

1. **Property.** If none exists, add `astrosivam.com` as a **Domain property**
   (verifies the whole site, including www). Verification is a **DNS TXT
   record** — add it in the Cloudflare DNS zone (the origin is behind
   Cloudflare, so cPanel DNS is not the place). A URL-prefix property also
   works (HTML-tag or meta-tag verification) but misses the `www` host.
2. **Sitemap.** Indexing → **Sitemaps** → add `sitemap.xml` (it resolves to
   `https://astrosivam.com/sitemap.xml`; `robots.txt` already points at it).
   It should report "Success, 14 URLs".
3. **Request indexing for the money pages** (Indexing → **URL Inspection** →
   paste URL → *Request Indexing*, one by one — the queue is capped, so do
   these ten first, in this order):
   1. `https://astrosivam.com/marriage-compatibility`  (10 porutham online)
   2. `https://astrosivam.com/baby-naming`             (baby naming by nakshatra)
   3. `https://astrosivam.com/birth-jathagam`
   4. `https://astrosivam.com/muhurtham`
   5. `https://astrosivam.com/services`
   6. `https://astrosivam.com/how-it-works`
   7. `https://astrosivam.com/about`
   8. `https://astrosivam.com/team`
   9. `https://astrosivam.com/contact`
   10. `https://astrosivam.com/`
4. **Pages report** (Indexing → Pages). Watch for:
   - **Crawled – currently not indexed** — normal right after a re-crawl of
     changed pages; Google re-evaluates within days to weeks. This is where
     "14 in sitemap, 1 indexed" lives today.
   - **Excluded – "Crawled – currently not indexed" reasons** (if shown):
     *Thin or duplicate content* is the one to watch — the FAQ content from
     step 1 of this change is the answer to it. If a money page stays
     excluded for 2+ weeks after the deploy, inspect it and note the reason.
   - **Indexing errors** for any of the 14 URLs (e.g. a redirect chain) —
     the `.htaccess` canonicalisation should make these zero; fix any that
     appear.
5. **Links report** — after backlinks land (section 4), they should appear
   here; internal-link counts should show every public page linked by many.

**After every later deploy** that changes page content: bump that route's
`lastmod` in `scripts/prerender.mjs` (the build regenerates `dist/sitemap.xml`;
copy it to `public/sitemap.xml` — the contract test enforces byte-identity),
redeploy, and optionally re-submit the sitemap in GSC (auto-detection is slow
compared to a manual ping).

## 3. Bing Webmaster Tools (faster secondary index)

Bing's crawl of a small new site is usually much faster than Google's — this
is the place where the `site:` count will move first, and it doubles as a
sanity check that the pages are technically indexable.

1. Add the site (DNS TXT verification — same Cloudflare zone).
2. Sitemaps → submit `https://astrosivam.com/sitemap.xml`.
3. **Submit URLs** for the four money pages (`/marriage-compatibility`,
   `/baby-naming`, `/birth-jathagam`, `/muhurtham`).
4. Check Indexing status weekly; Bing often shows "Discovered" within days.

## 4. Backlinks — a few real ones, done once (the authority half)

The audit's own diagnosis: authority/crawl budget. Do **not** buy links or
use link farms — a handful of genuine, topically-relevant links is what
matters, and a few spammy ones would hurt more than help.

Priority order:

1. **Google Business Profile** for ASTRO SIVAM (business category
   "Astrology service" / "Consultant"). The registered office
   (Walajapet, Ranipet District — see [business registration doc](BUSINESS_REGISTRATION_AND_OFFICE_ADDRESS.md))
   can be used there; the website's contact-page-only address policy governs
   *the website*, not the profile. A verified GBP also puts the business in
   Google's local/knowledge surface, which is separate from web indexing but
   feeds the same domain's trust.
2. **Directories & listings** (one entry each, with the site URL):
   - Justdial, Sulekha, IndiaMART (Astrology / Horoscope services);
   - the Facebook business page already exists — make sure its website field
     is `https://astrosivam.com` and the page is public;
   - local business directories for the registered town/district;
   - Apple Maps / Bing Places via their respective "Add your business" flows.
3. **Astrology & wedding communities** (participate genuinely first; link
   only where a profile/answer legitimately belongs):
   - a Quora profile answering 10-porutham / nakshatra-naming questions
     (these are exactly the money queries — several good answers will rank);
   - Indian wedding-planning directories that list vendors by service
     (astrology consultation is a standard wedding-vendor category);
   - established astrology forums/communities with a signature or profile URL.
4. **Guest posts / mentions** (2–3 over a month or two): astrology or
   wedding blogs that accept expert write-ups; wedding magazines' vendor
   features. One natural dofollow link each is plenty.

Budget expectation: **~5–10 good backlinks over 4–6 weeks**, not hundreds.

## 5. Monitoring plan (15 minutes/week for 8 weeks)

| When | Check | Pass looks like |
|---|---|---|
| Weekly | GSC Pages report — count of "Indexed" URLs | climbs from 1 toward 14; no new "Excluded" reasons on money pages |
| Weekly | GSC URL Inspection of /marriage-compatibility & /baby-naming | "Indexed" (or at least "Crawled" with a re-evaluation in progress) |
| Biweekly | `site:astrosivam.com` in Google and in Bing | more than 1 result; the two money pages appear by week 4–6 |
| Biweekly | GSC Links report | backlinks from section 4 landing |
| Every deploy | sitemap re-submission if content changed | "Success, 14 URLs" |

**Stop condition:** when 10+ of the 14 URLs show as Indexed in GSC and both
money pages answer their `site:` queries, the issue is closed. If a money
page is still "Crawled – currently not indexed" 6 weeks after the deploy with
backlinks in place, that page needs a content pass (more unique text, stronger
internal linking) — the FAQ/breadcrumb/cross-link guards in this change are
the template for doing it without regressing.

## 6. What NOT to do

- Do not add `noindex`, change the self-referencing canonicals, or remove the
  sitemap from `robots.txt` — the crawlability contract is pinned by
  `tests/seo-prerender-contract.test.ts` and `tests/crawlable-links.test.tsx`.
- Do not buy links, submit to "SEO index" services, or spam comments — the
  fix for a new domain is a small amount of real relevance, and penalised
  links are hard to undo.
- Do not re-date or rewrite existing customer-facing text to chase keywords
  (same truthfulness rule the reviews work follows).
- Do not reintroduce `?lang=ta`/`?lang=hi` hreflang alternates until the
  languages are server-rendered (audit finding 3, still open).
