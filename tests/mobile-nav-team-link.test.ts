/**
 * The phone menu must offer every page the desktop row offers.
 *
 * Report (2026-10-21): "In mobile navbar add astrology team page — in desktop
 * already there". The Astrology Team page had been deliberately filtered out of
 * the phone menu, so a visitor on a phone could not open /team from the
 * navigation at all, even though it is a real page with its own URL.
 *
 * Both menus are now built from one destination list, and the phone groups come
 * from a pure function that is exercised here — so a page cannot quietly vanish
 * from the phone navigation again.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ABOUT_NAV_KEYS,
  PRIMARY_NAV_DESTINATIONS,
  buildMobileNavGroups
} from '../src/services/navigation';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

const navbar = read('src/components/layout/Navbar.tsx');
const language = read('src/context/LanguageContext.tsx');
const app = read('src/App.tsx');
const prerender = read('scripts/prerender.mjs');

/** The English label map, parsed from LanguageContext (no DOM needed). */
const translations: Record<string, string> = {};
for (const match of language.matchAll(/^\s{2}([a-z_]+): '((?:[^'\\]|\\.)*)',/gm)) {
  translations[match[1]] = match[2];
}
const hasTranslation = (key: string) => Boolean(translations[key]);

/** Shape the Navbar builds for a row (label already resolved). */
const navLinks = PRIMARY_NAV_DESTINATIONS.map(destination => ({
  key: destination.key,
  label: destination.labelKey,
  route: destination.route
}));
const howItWorks = { key: 'how_it_works', label: 'how_it_works', route: 'how-it-works' };

check('the astrology team page exists in the primary destinations', () => {
  const team = PRIMARY_NAV_DESTINATIONS.find(destination => destination.key === 'team');
  assert.ok(team, 'the team page must be a navigation destination');
  assert.equal(team!.route, 'team', 'it routes by the app route key "team"');
  assert.equal(team!.labelKey, 'astrology_team', 'its label is translated');
});

check('the mobile menu puts the team page in the About Us group', () => {
  const groups = buildMobileNavGroups(navLinks, [howItWorks]);
  assert.equal(groups.length, 2, 'services and company pages');
  assert.deepEqual(
    groups.map(group => group.title),
    ['Vedic Services', 'About Us']
  );

  const about = groups.find(group => group.title === 'About Us')!;
  assert.deepEqual(
    about.links.map(link => link.key),
    ['team', 'how_it_works'],
    'the team page leads the About Us group, followed by How It Works'
  );
  assert.equal(about.links[0].route, 'team');
});

check('no destination is lost or duplicated between the two mobile groups', () => {
  const groups = buildMobileNavGroups(navLinks, [howItWorks]);
  const shown = groups.flatMap(group => group.links);
  const expected = [...PRIMARY_NAV_DESTINATIONS.map(destination => destination.key), 'how_it_works'];

  assert.deepEqual(new Set(shown.map(link => link.key)), new Set(expected), 'every page is offered');
  assert.equal(shown.length, expected.length, 'and nothing is listed twice');
  for (const link of shown) {
    assert.ok(link.route && link.route.length > 0, `${link.key} has a route`);
    assert.ok(link.label, `${link.key} has a label`);
  }
});

check('the services group keeps the five services in their published order', () => {
  const services = buildMobileNavGroups(navLinks, [howItWorks])[0].links.map(link => link.key);
  assert.deepEqual(services, [
    'home',
    'birth_jathagam',
    'marriage_compatibility',
    'baby_naming',
    'muhurtham'
  ]);
  for (const key of ABOUT_NAV_KEYS) {
    assert.ok(!services.includes(key), `${key} is not a paid service row`);
  }
});

check('the grouping is stable for any link list (no hidden filter)', () => {
  // A single-item list still comes back in one of the two groups.
  const lone = buildMobileNavGroups([{ key: 'team' }]);
  assert.deepEqual(lone[0].links, [], 'team never sits in the services group');
  assert.deepEqual(lone[1].links.map(link => link.key), ['team']);
  // An unknown future page defaults to the services group rather than vanishing.
  const future = buildMobileNavGroups([{ key: 'reviews' }]);
  assert.deepEqual(future[0].links.map(link => link.key), ['reviews']);
});

check('the Navbar renders both menus from that one destination list', () => {
  assert.match(navbar, /PRIMARY_NAV_DESTINATIONS\.map/, 'the desktop row comes from the shared list');
  assert.match(navbar, /buildMobileNavGroups/, 'the phone groups come from the shared helper');
  assert.match(navbar, /\{mobileNavGroups\.map\(/, 'both groups are rendered');
  assert.match(navbar, /data-testid=\{`mobile-nav-\$\{link\.key\}`\}/, 'each phone row is addressable');
  // The old bug: the phone menu was built by filtering the team page out.
  assert.doesNotMatch(navbar, /mobileNavLinks/, 'the hand-maintained phone list is gone');
  assert.doesNotMatch(navbar, /filter\(link => link\.key !== 'team'\)/, 'the team page is no longer filtered out');
});

check('the team page is a real, crawlable, prerendered page', () => {
  assert.match(app, /if \(pathname === '\/team'\) return 'team'/, '/team resolves in the app router');
  assert.match(app, /case 'team':/, 'the router renders the team page');
  assert.match(prerender, /path: '\/team'/, '/team is prerendered for search engines');
  assert.match(read('src/pages/AstrologyTeamPage.tsx'), /export/, 'the page component exists');
});

check('the menu label is translated, so it cannot show a raw key', () => {
  const team = PRIMARY_NAV_DESTINATIONS.find(destination => destination.key === 'team')!;
  assert.match(language, /astrology_team: 'Astrology Team'/, 'the English label is defined');
  assert.equal(hasTranslation(team.labelKey), true, 'the key resolves');
  assert.equal(translations[team.labelKey], 'Astrology Team');
  for (const destination of PRIMARY_NAV_DESTINATIONS) {
    assert.equal(hasTranslation(destination.labelKey), true, `${destination.key} label resolves`);
  }
});

console.log(`\nMobile navigation parity passed (${passed} checks).`);
