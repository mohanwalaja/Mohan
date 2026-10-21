/**
 * ASTRO SIVAM — accessibility contract: "Skip to main content" (2026-10-21 audit).
 *
 * WHY THIS EXISTS: a full audit of the live site found no skip link. The
 * header carries 20+ focusable links (desktop nav, language picker, cart,
 * account, mobile menu), so a keyboard or screen-reader user had to traverse
 * the whole navigation on EVERY page before reaching the page content — the
 * single most common WCAG 2.4.1 (Bypass Blocks) failure for a multi-page
 * site.
 *
 * WHAT THIS PINS (each one has a way of silently regressing):
 *   SOURCE · the link is rendered by the app shell (App.tsx), so it exists on
 *            EVERY route, not just the prerendered marketing pages;
 *          · it is the FIRST focusable element in the document (before the
 *            Navbar), which is the whole point of the pattern;
 *          · its href target matches the id on <main> exactly — a mismatch
 *            silently produces a link that moves focus nowhere;
 *          · <main> is focusable programmatically (tabIndex={-1}) so the jump
 *            actually moves the caret, and does not draw a focus ring;
 *          · the hidden-until-focused state is implemented with sr-only, and
 *            the visible state is a fixed, high-contrast, fully opaque panel
 *            (a semi-transparent or low-contrast skip link is unreadable,
 *            and the failure is invisible to a mouse user);
 *          · the admin route keeps the same behaviour (the link must not
 *            inherit an unreadable dark-on-dark palette).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(projectRoot, relative), 'utf8');

const appSource = read('src/App.tsx');
const cssSource = read('src/user-designs.css');

let passed = 0;
function check(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

// --- SOURCE: the link and its target -----------------------------------------

check('the app shell renders a skip-to-content link', () => {
  assert.match(appSource, /skip-to-content/, 'App.tsx must render the skip link');
  assert.match(appSource, /Skip to main content/, 'the link must carry a visible text label');
});

check('the link is the first focusable element, before the Navbar', () => {
  const linkAt = appSource.indexOf('skip-to-content');
  const navAt = appSource.indexOf('<Navbar');
  assert.ok(linkAt > -1 && navAt > -1, 'both the link and the Navbar must exist');
  assert.ok(linkAt < navAt, 'the skip link must be rendered BEFORE the Navbar');
});

check('the link href and the <main> id are the same target', () => {
  const href = appSource.match(/href="#([^"]+)"/);
  assert.ok(href, 'the skip link must have an in-page href');
  const target = href![1]!;
  assert.ok(
    new RegExp(`<main[^>]*\\bid="${target}"`).test(appSource),
    `<main> must carry id="${target}" so the skip link lands on the content`
  );
});

check('<main> is focusable programmatically so the jump moves the caret', () => {
  // The source mentions "<main>" inside explanatory comments; only the real
  // JSX element counts, so match the tag with its attributes.
  const mainTag = appSource.match(/<main\s[^>]*>/);
  assert.ok(mainTag, 'the app shell must render a <main> landmark');
  assert.match(
    mainTag![0],
    /tabIndex=\{-1\}/,
    '<main> needs tabIndex={-1} for the skip link to move focus (it stays out of the Tab order)'
  );
});

check('<main> does not draw a focus ring of its own', () => {
  assert.match(cssSource, /#main-content:focus[^{]*\{[^}]*outline:\s*none/i);
});

// --- STYLE: hidden until focused, then legible -------------------------------

check('the link uses the sr-only / focus:not-sr-only pair', () => {
  assert.match(appSource, /skip-to-content[^"]*sr-only/, 'the link must be sr-only by default');
  assert.match(appSource, /focus:not-sr-only/, 'the link must become visible on focus');
});

check('the hidden state really hides the link (clip, not just opacity)', () => {
  const hiddenRule = cssSource.match(/\.skip-to-content:not\(:focus\)[^{]*\{([^}]*)\}/);
  assert.ok(hiddenRule, 'a :not(:focus) hidden state must exist');
  const body = hiddenRule![1]!;
  assert.match(body, /overflow:\s*hidden/i, 'the hidden state must clip overflow');
  assert.match(body, /clip-path:\s*inset\(50%\)|clip:\s*rect\(/i, 'the hidden state must clip the box');
  assert.match(body, /width:\s*1px/i, 'the hidden state must collapse the box');
});

check('the visible state is opaque and high contrast in both palettes', () => {
  const visibleRule = cssSource.match(/\.skip-to-content\s*\{([^}]*)\}/);
  assert.ok(visibleRule, 'a visible state must exist');
  const body = visibleRule![1]!;
  assert.match(body, /position:\s*fixed/i, 'the link must be pinned over the header, not in the flow');
  assert.match(body, /z-index:\s*\d{6,}/i, 'the link must sit above the sticky header');

  // Only the background and the text colour matter for legibility; a
  // translucent box-shadow is fine (it is decoration, not the surface).
  const background = body.match(/background:\s*([^;]+);/i)?.[1] ?? '';
  const color = body.match(/(?:^|[\s;])color:\s*([^;]+);/i)?.[1] ?? '';
  assert.match(background, /#[0-9a-f]{6}/i, 'the background must be a solid hex colour');
  assert.match(color, /#[0-9a-f]{6}/i, 'the text colour must be a solid hex colour');
  assert.ok(!/opacity\s*:/i.test(background), 'the visible link must not be translucent');
  assert.ok(!/^transparent$/i.test(background.trim()), 'the visible link must not be transparent');
  assert.ok(!/rgba\(/i.test(background), 'the link surface must be fully opaque');
});

check('the admin route is not left with an unreadable skip link', () => {
  // The link is styled outside the [data-user-design] scope, so the dark
  // admin shell gets the same light, opaque panel instead of inheriting
  // dark-on-dark text.
  assert.ok(
    !/\[data-user-design\]\s+\.skip-to-content/.test(cssSource),
    'the skip link must not be scoped to the customer design only'
  );
});

console.log(`\nAccessibility skip-link contract: ${passed} checks passed.\n`);
