<?php
require_once __DIR__ . '/../branding.php';
/**
 * ASTRO SIVAM - Server-side Report HTML Views
 *
 * AstroReportViews produces the exact full HTML document string for all 4
 * services (Birth Jathagam 3 pages, Marriage Compatibility, Baby Naming,
 * Subha Muhurtham calendar) in English, Tamil and Hindi.
 *
 * There is NO server-side PDF renderer any more. This HTML feeds:
 *   - the admin preview routes (GET/POST /api/admin/preview-html), and
 *   - the PHP parity tests against the TypeScript builders.
 * Every customer-facing PDF is captured in the browser from the same shared
 * builders, at print density (see src/services/jathagamPdfExporter.ts).
 */

require_once __DIR__ . '/report_views/glossary_and_labels.php';
require_once __DIR__ . '/report_views/shared_layout_and_translit.php';
require_once __DIR__ . '/report_views/birth_jathagam_view.php';
require_once __DIR__ . '/report_views/birth_jathagam_lucky_and_css.php';
require_once __DIR__ . '/report_views/birth_jathagam_remedies.php';
require_once __DIR__ . '/report_views/wedding_matching_view.php';
require_once __DIR__ . '/report_views/muhurtham_view.php';
require_once __DIR__ . '/report_views/baby_naming_view.php';

class AstroReportViews
{
    use AstroReportSharedTrait;
    use AstroReportBirthJathagamTrait;
    use AstroReportBirthLuckyTrait;
    use AstroReportBirthRemediesTrait;
    use AstroReportWeddingTrait;
    use AstroReportMuhurthamTrait;
    use AstroReportBabyNamingTrait;

    /**
     * The Birth Jathagam is a STRICT three-sheet document. The total lives here
     * once - mirroring JATHAGAM_PAGE_COUNT in src/services/jathagamHtmlBuilder.ts
     * - so the three page headers can never disagree, and a fourth sheet can
     * never be introduced without this number changing too.
     */
    public const JATHAGAM_PAGE_TOTAL = 4;

    /**
     * The other three reports each carry their body/disclaimer sheets plus the
     * Report Guide & Glossary sheet. The totals live here so a page header can
     * never say "of 2" on a three-sheet document again - the glossary sheet was
     * appended without these totals changing, and the printed headers drifted.
     */
    public const WEDDING_PAGE_TOTAL = 3;
    public const MUHURTHAM_PAGE_TOTAL = 3;
    public const BABY_PAGE_TOTAL = 3;

}
