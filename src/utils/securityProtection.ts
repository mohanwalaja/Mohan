/**
 * ASTRO SIVAM console notice.
 *
 * The previous version of this file blocked right-click, drag, copy, PrintScreen,
 * devtools shortcuts, blurred content on focus loss and wiped the clipboard. All
 * of that is bypassable in seconds (DevTools, OS-level screenshot tools,
 * view-source) while actively harming legitimate users: it breaks copy/paste
 * for support, accessibility tooling, and in-app debugging. Replaced with a
 * console notice only, per the 12-Oct-2026 audit (item W3).
 *
 * Real content protection lives server-side: PREVIEW watermarks on free PDF
 * exports and email-only delivery of paid reports.
 */

export function initSecurityProtection(): void {
  if (typeof window === 'undefined' || typeof console === 'undefined') return;

  try {
    const bannerStyle =
      'color:#f59e0b;font-size:16px;font-weight:bold;background:#0f172a;padding:8px 14px;border-radius:6px;border:1px solid #f59e0b;';
    console.log('%cASTRO SIVAM', bannerStyle);
    console.log(
      '%cReport content is copyrighted. Free preview PDFs are watermarked; paid reports are delivered by email only.',
      'color:#94a3b8;font-size:13px;line-height:1.5;'
    );
  } catch (e) {
    // Console unavailable (very locked-down browsers) — nothing to do.
  }
}
