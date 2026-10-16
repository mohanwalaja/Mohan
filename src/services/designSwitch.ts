/**
 * The one place that knows how an operator's design choice reaches a visitor.
 *
 * ASTRO SIVAM ships TWO designs, and only two:
 *
 *   'classic-primary'  the original dark/indigo site (repo root: src/) — the
 *                      default, and the only one that has ever been live
 *   'sunrise-ivory'    the light re-skin (its own bundle: light/)
 *
 * HOW THE CHOICE IS MADE (Admin → Site Design)
 * --------------------------------------------
 * The operator picks the design in the admin portal; the id is persisted as
 * `activeThemeTemplate` in `system_settings.general_settings` (no schema
 * migration — the admin settings PUT merges it) and published by the public
 * `api/services.php?action=settings` payload.
 *
 * HOW THE CHOICE REACHES A VISITOR
 * --------------------------------
 * The two designs are separate bundles, so switching cannot be a paint-class
 * toggle. The dark documents stay exactly where they are; the light design
 * ships its own prerendered documents beside them (`pages/<route>-light.html`,
 * plus `pages/index-light.html` for the homepage), and Apache serves whichever
 * set the operator selected. The selection is carried by a tiny ACTIVATION
 * MARKER file that `api/admin/index.php` writes or removes when the setting
 * changes; public/.htaccess only rewrites a clean URL to the light document
 * while that marker exists, so:
 *
 *   - the dark design keeps today's static serving path, byte-for-byte, with
 *     no PHP, no extra request and no client-side hop;
 *   - the light design is served AT THE SAME canonical URLs (so the canonical
 *     link, the sitemap and the URL topology are identical under both);
 *   - a deployment where the marker cannot be written still works: the admin
 *     panel reports it and visitors keep the dark design instead of a
 *     half-switched site.
 *
 * WHY THE MARKER AND NOT A PHP ROUTER: this site is static-first. Reading the
 * setting from MySQL on every page view would put PHP in the hot path of every
 * visitor; the marker is written once per admin click and read by mod_rewrite
 * for free.
 *
 * THE REVERSE DIRECTION (light document → dark design)
 * ---------------------------------------------------
 * `resolveLightDocumentDesign()` below is the light bundle's boot gate. A light
 * document can outlive the setting that produced it — the operator switches
 * back to the dark design while a tab still holds the light page, or a visitor
 * opens one of the light documents directly by path. In that case the light
 * bundle asks the public settings endpoint and sends the visitor to the dark
 * document for the same route instead of showing a design the operator has
 * retired.
 *
 * IMPORTANT: this file is imported by BOTH build roots — the dark site
 * (`src/`) and the light app (`light/`). It must stay dependency free and
 * side-effect free; the entries call it themselves. Keep
 * `DEFAULT_THEME_TEMPLATE` in step with `DEFAULT_ACTIVE_THEME_TEMPLATE` in
 * api/admin/index.php and api/services/index.php, and keep the page list in
 * step with the light prerender (scripts/prerender-light.mjs).
 */

/** The two shipped designs. Deliberately closed — no other id is served. */
export const SHIPPED_THEME_TEMPLATES = ['classic-primary', 'sunrise-ivory'] as const;

export type ShippedThemeTemplateId = (typeof SHIPPED_THEME_TEMPLATES)[number];

/** The dark design stays the default: an unconfigured install is unchanged. */
export const DEFAULT_THEME_TEMPLATE: ShippedThemeTemplateId = 'classic-primary';

/** The light design's id, named once so the admin copy and the gate agree. */
export const LIGHT_THEME_TEMPLATE: ShippedThemeTemplateId = 'sunrise-ivory';

/** The public settings endpoint every visitor can read without a session. */
export const PUBLIC_SETTINGS_URL = 'api/services.php?action=settings';

/** sessionStorage key for the resolved design (per tab, never a cookie). */
export const DESIGN_SESSION_KEY = 'astrosivam_site_design';

/**
 * The activation marker. `api/admin/index.php` writes or deletes this file
 * inside the deploy root's api/ folder when `activeThemeTemplate` changes;
 * public/.htaccess serves the light documents while it exists. Keep the path in
 * step with the `RewriteCond` there and with `designMarkerPath()` in the PHP.
 */
export const DESIGN_ACTIVATION_MARKER = 'api/.design-light';

/** The suffix that makes a light document out of a route document name. */
export const LIGHT_DESIGN_DOCUMENT_SUFFIX = '-light.html';

/**
 * Route keys that ship a light document.
 *
 * Every public marketing page has one. The four account/admin surfaces do NOT:
 * Log In, Sign Up, the customer dashboard and the admin portal are signed-in
 * tools, not marketing pages — they keep the classic interface under both
 * designs (the light UI links to the live account pages for exactly that
 * reason), and they are the four `noindex` routes in the prerender table.
 */
export const LIGHT_DESIGN_EXCLUDED_ROUTES = ['login', 'register', 'dashboard', 'admin'] as const;

/** True for a route key that has a light document. */
export function hasLightDocument(routeKey: string): boolean {
  return !(LIGHT_DESIGN_EXCLUDED_ROUTES as readonly string[]).includes(String(routeKey));
}

/** 'services' → 'services-light.html'; 'index' → 'index-light.html'. */
export function lightDocumentName(routeFile: string): string {
  const name = String(routeFile).replace(/\.html$/i, '');
  return `${name}${LIGHT_DESIGN_DOCUMENT_SUFFIX}`;
}

/** '/services' → 'services.html'; '/' or '/index.html' → 'index.html'. */
export function documentNameForPath(pathname: string): string {
  const clean = String(pathname || '/').split('/').filter(Boolean).pop() || 'index';
  return /\.html?$/i.test(clean) ? clean.toLowerCase() : `${clean.toLowerCase()}.html`;
}

/** A design is only ever one of the two shipped ids. */
export function normalizeThemeTemplate(value: unknown): ShippedThemeTemplateId {
  return (SHIPPED_THEME_TEMPLATES as readonly unknown[]).includes(value)
    ? (value as ShippedThemeTemplateId)
    : DEFAULT_THEME_TEMPLATE;
}

/** True only for the id that has its own bundle + `-light.html` documents. */
export function isLightThemeTemplate(value: unknown): boolean {
  return normalizeThemeTemplate(value) === LIGHT_THEME_TEMPLATE;
}

/**
 * The public settings payload is delivered in a couple of shapes across
 * versions (`{settings:{…}}`, `{data:{settings:{…}}}` or the settings object
 * itself). Read all of them; anything else resolves to the default.
 */
export function readActiveThemeTemplate(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return undefined;
  const root = payload as Record<string, any>;
  const candidates = [
    root.activeThemeTemplate,
    root.settings?.activeThemeTemplate,
    root.data?.activeThemeTemplate,
    root.data?.settings?.activeThemeTemplate,
  ];
  return candidates.find((value) => typeof value === 'string' && value.length > 0);
}

export interface LightDocumentDesignOptions {
  /** Where to GET the public settings; pass null to disable the gate entirely. */
  settingsUrl?: string | null;
  /** Test seam — defaults to window.location. */
  location?: { pathname: string; search?: string; hash?: string };
  /** Test seam — defaults to window's sessionStorage when it is usable. */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  /** Test seam — defaults to window's fetch. */
  fetchImpl?: typeof fetch;
  /** Test seam — defaults to a real navigation via window.location.replace. */
  navigate?: (destination: string) => void;
}

/**
 * The light bundle's boot gate: resolve the operator's design from the public
 * settings and, when it is no longer the light one, send the visitor to the
 * classic document for the same page.
 *
 * Never throws: an unreachable API, a malformed payload or a storage-less
 * private-mode tab all resolve to the light design, because the document was
 * served by the very rewrite that only fires while the light design is active.
 */
export async function resolveLightDocumentDesign(
  options: LightDocumentDesignOptions = {},
): Promise<ShippedThemeTemplateId> {
  const {
    settingsUrl = PUBLIC_SETTINGS_URL,
    location = typeof window !== 'undefined' ? window.location : undefined,
    storage = safeSessionStorage(),
    fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : undefined,
    navigate = defaultNavigate,
  } = options;

  // A missing seam means a non-browser caller (a test, a prerender script) or a
  // disabled gate: nothing to resolve and nothing to do.
  if (!settingsUrl || !location || !fetchImpl) return DEFAULT_THEME_TEMPLATE;

  const active = await fetchImpl(settingsUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((payload: unknown) => {
      const reported = readActiveThemeTemplate(payload);
      // A payload that names no design at all (an older API, an empty settings
      // row) is not evidence that the operator switched: keep the design this
      // document was served under. A payload that names a design does decide.
      return reported === undefined ? LIGHT_THEME_TEMPLATE : normalizeThemeTemplate(reported);
    })
    .catch(() => LIGHT_THEME_TEMPLATE);

  remember(storage, active);

  if (active !== LIGHT_THEME_TEMPLATE) {
    const currentFile = documentNameForPath(location.pathname);
    // The light documents are the `-light.html` twins of the route documents;
    // the dark design serves the clean URL itself.
    const darkFile = currentFile.replace(/-light\.html$/i, '.html');
    const path = darkFile === 'index.html' ? '/' : `/${darkFile.replace(/\.html$/i, '')}`;
    navigate(`${path}${location.search || ''}${location.hash || ''}`);
  }

  return active;
}

/** A real navigation — the two designs are separate bundles, so not pushState. */
function defaultNavigate(destination: string) {
  if (typeof window !== 'undefined' && typeof window.location.replace === 'function') {
    window.location.replace(destination);
  }
}

/** sessionStorage throws in private-mode/partitioned contexts — never break boot. */
function safeSessionStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    const store = typeof window !== 'undefined' ? window.sessionStorage : null;
    if (!store) return null;
    const probe = '__astrosivam_probe__';
    store.setItem(probe, '1');
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

function remember(storage: Pick<Storage, 'getItem' | 'setItem'> | null, active: ShippedThemeTemplateId) {
  try {
    storage?.setItem(DESIGN_SESSION_KEY, active);
  } catch {
    /* private mode: the choice just is not remembered for this tab */
  }
}
