/* ASTRO SIVAM — pre-paint website design (Ivory & Saffron dark-flash fix).
 *
 * THE BUG THIS CLOSES: with "01 · Ivory & Saffron" selected, every visit
 * painted the dark design first (prerendered HTML + dark canvas) and only
 * flipped to light once React had loaded and the public settings request
 * resolved — a ~2 s dark flash before the light UI.
 *
 * THE FIX: this script is a classic (non-inline — the CSP blocks inline
 * scripts) synchronous script in <head>, so it runs before the body exists.
 * It stamps the SAVED design onto <html>, and src/user-designs.css plus the
 * boot-critical inline style key off that attribute, so the first paint —
 * canvas, splash palette, and the prerendered document itself — is already
 * in the right design.
 *
 * States written to <html data-boot-design>:
 *   ivory     saved design is Ivory & Saffron  → data-user-design="ivory"
 *   original  saved design is the dark default → no design attribute
 *   pending   no saved design yet (first visit) → the boot splash holds the
 *             screen until the settings request resolves; a JS backstop
 *             (src/main.tsx) and the 8 s CSS escape release it even if that
 *             request hangs. Never a blank page.
 *   admin     admin route → never pre-paint a user design (admin stays dark)
 *
 * Reading the same `astrosivam_settings` cache that src/context/AuthContext.tsx
 * writes means reloads and direct links are always exact; a failed/empty read
 * simply falls back to `pending`. Pinned by tests/light-design-fixes.test.ts.
 */
(function () {
  try {
    var root = document.documentElement;
    if (!root) return;

    var path = String((window.location && window.location.pathname) || '/').toLowerCase();
    var query = String((window.location && window.location.search) || '');
    var isAdmin =
      /(^|\/)(admin|admin-portal|admin\.php)(\/|$)/.test(path) ||
      /[?&]route=admin(-portal)?(&|$)/.test(query);
    if (isAdmin) {
      root.setAttribute('data-boot-design', 'admin');
      return;
    }

    var design = 'pending';
    try {
      var cached = window.localStorage.getItem('astrosivam_settings');
      if (cached) {
        var parsed = JSON.parse(cached);
        design = parsed && parsed.userDesign === 'ivory' ? 'ivory' : 'original';
      }
    } catch (e) {
      // Storage blocked (private mode / disabled cookies): behave like a
      // first-time visitor — hold briefly, then reveal from live settings.
      design = 'pending';
    }

    root.setAttribute('data-boot-design', design);
    if (design === 'ivory') root.setAttribute('data-user-design', 'ivory');
  } catch (e) {
    // A broken pre-paint stamp must never hide the page.
  }
})();
