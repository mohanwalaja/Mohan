/**
 * Navigation destinations, shared by the desktop row and the phone menu.
 *
 * Both menus are built from ONE list so a page cannot be reachable on a laptop
 * and invisible on a phone. That is exactly what happened to the Astrology Team
 * page: the phone menu filtered it out, and since it is a real page with its own
 * URL (/team) and its own prerendered document, phone visitors had no way to
 * open it from the navigation.
 *
 * The label is a translation key resolved by LanguageContext; the icon and the
 * click handler stay in the Navbar (this module is plain data + one pure
 * grouping function, so tests can exercise it without a DOM).
 */

export interface NavDestination {
  /** Stable identifier used for React keys and for which group a row lands in. */
  key: string;
  /** In-app route key understood by App.tsx ('team' → /team). */
  route: string;
  /** LanguageContext key for the visible label. */
  labelKey: string;
}

/** The top navigation, in display order (identical on desktop and phone). */
export const PRIMARY_NAV_DESTINATIONS: NavDestination[] = [
  { key: 'home', route: 'home', labelKey: 'home' },
  { key: 'birth_jathagam', route: 'birth-jathagam', labelKey: 'birth_jathagam' },
  { key: 'marriage_compatibility', route: 'marriage-compatibility', labelKey: 'marriage_compatibility' },
  { key: 'baby_naming', route: 'baby-naming', labelKey: 'baby_naming' },
  { key: 'muhurtham', route: 'muhurtham', labelKey: 'muhurtham' },
  { key: 'team', route: 'team', labelKey: 'astrology_team' }
];

/**
 * Destinations that are not a paid service. On a phone they sit in the
 * "About Us" group under the services instead of being mixed in with them.
 * The Astrology Team page belongs here, and it must stay in this list — dropping
 * it silently removes the page from the phone menu.
 */
export const ABOUT_NAV_KEYS = ['team'] as const;

export interface NavGroup<T> {
  title: string;
  links: T[];
}

/**
 * Group the primary destinations for the phone menu, with any extra
 * phone-only rows (e.g. "How It Works") appended to the About Us group.
 * Every destination is returned exactly once, in the order it was given.
 */
export function buildMobileNavGroups<T extends { key: string }>(
  links: T[],
  aboutExtras: T[] = []
): Array<NavGroup<T>> {
  const about = new Set<string>(ABOUT_NAV_KEYS);
  return [
    { title: 'Vedic Services', links: links.filter(link => !about.has(link.key)) },
    { title: 'About Us', links: [...links.filter(link => about.has(link.key)), ...aboutExtras] }
  ];
}
