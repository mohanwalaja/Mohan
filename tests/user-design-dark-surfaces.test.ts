import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Ivory design: no dark surfaces inside it.
 *
 * The navbar's signed-in card, the checkout modal and the order-review strip are
 * written dark and carry no `dark:` variants. The light design is a CSS layer
 * (`src/user-designs.css`) that repaints dark Tailwind utilities on the ivory
 * canvas, but it only ever matched `bg-*` utilities — never the *gradient*
 * helpers (`bg-gradient-to-r` + `from-/via-/to-`) or a modal scrim. The result
 * was exactly what the owner saw on a phone: a white page, a charcoal account
 * card in the drawer, a navy checkout header and a checkout body sitting on an
 * undimmed page.
 *
 * These checks pin the fix at the seam that broke: every dark-only block has a
 * named hook, and each hook has a light treatment with a background that is
 * actually light.
 */

const read = (path: string) => readFileSync(path, 'utf8');
const css = read('src/user-designs.css');
const navbar = read('src/components/layout/Navbar.tsx');
const checkout = read('src/components/cart/SingleServiceCheckoutModal.tsx');
const reviewStrip = read('src/components/reviews/OrderReviewStrip.tsx');

const luminance = (hex: string) => {
  const channels = hex.replace('#', '').match(/.{2}/g)!.map(pair => parseInt(pair, 16) / 255);
  const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
};

/** The declaration block of the first rule whose selector matches `pattern`. */
const ruleFor = (pattern: RegExp): string => {
  const match = pattern.exec(css);
  assert.ok(match, `no CSS rule matches ${pattern}`);
  const start = css.indexOf('{', match.index);
  const end = css.indexOf('}', start);
  return css.slice(start + 1, end);
};

// The palette lives on the [data-user-design] root; resolve its tokens so a
// rule written as `background:var(--surface)` is checked as a real colour.
const tokens = Object.fromEntries(
  [...(/\[data-user-design\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? '').matchAll(/(--[a-z-]+)\s*:\s*(#[0-9a-f]{3,8})/gi)]
    .map(m => [m[1], m[2]])
);
const resolve = (block: string) => block.replace(/var\((--[a-z-]+)\)/gi, (whole, name: string) => tokens[name] ?? whole);

const expectLight = (label: string, block: string) => {
  // Only background declarations are surfaces; `color:` is the ink.
  const surfaces = [...resolve(block).matchAll(/(?:^|[;{\s])background(?:-image|-color)?\s*:([^;]+)/gi)]
    .map(m => m[1]).join(';');
  const hexes = [...surfaces.matchAll(/#([0-9a-f]{6})\b/gi)].map(m => `#${m[1]}`);
  assert.ok(hexes.length > 0, `${label}: rule declares no colour`);
  for (const hex of hexes) {
    assert.ok(luminance(hex) > 0.5, `${label}: ${hex} is a dark surface on the ivory canvas`);
  }
};

// 1. The three reported surfaces carry a hook, so the CSS has something stable
//    to target instead of guessing at utility-class soup.
assert.match(navbar, /className="nav-account-card /, 'the signed-in drawer card needs its hook');
assert.match(checkout, /className="checkout-modal-overlay /, 'the checkout scrim needs its hook');
assert.match(checkout, /className="checkout-modal-shell /, 'the checkout modal needs its hook');
assert.match(checkout, /className="checkout-modal-header /, 'the checkout header needs its hook');
assert.match(checkout, /className="checkout-free-card /, 'the free/admin card needs its hook');
assert.match(reviewStrip, /className="order-review-strip /, 'the dashboard review strip needs its hook');

// The hooks must sit on the very elements that own the dark gradient, otherwise
// the rule paints a wrapper and the gradient still shows.
assert.match(navbar, /nav-account-card[^"]*bg-gradient-to-r from-amber-500\/\[0\.12\] via-slate-900\/70/,
  'the drawer hook must stay on the gradient card itself');
assert.match(checkout, /checkout-modal-header[^"]*bg-gradient-to-r from-slate-950/,
  'the header hook must stay on the gradient header itself');
assert.match(checkout, /checkout-free-card[^"]*bg-gradient-to-br from-emerald-950\/40/,
  'the free-card hook must stay on the gradient card itself');

// 2. Each hook resolves to a light background.
expectLight('navbar account card', ruleFor(/\[data-user-design\] \.nav-account-card \{[^}]*\}/));
expectLight('checkout header', ruleFor(/\[data-user-design\] \.checkout-modal-header \{[^}]*\}/));
expectLight('checkout shell', ruleFor(/\[data-user-design\] \.checkout-modal-shell \{[^}]*\}/));
expectLight('free/admin card', ruleFor(/\[data-user-design\] \.checkout-modal-shell \.checkout-free-card \{[^}]*\}/));
expectLight('order review strip', ruleFor(/\[data-user-design\] \.order-review-strip \{[^}]*\}/));

// 3. Ink on those light surfaces is dark enough to read.
const expectInk = (label: string, pattern: RegExp) => {
  const block = ruleFor(pattern);
  const ink = /color:(#[0-9a-f]{6}|var\(--[a-z-]+\))/i.exec(block)?.[1] ?? '';
  const resolved = resolve(`background:${ink}`);
  const hex = /#([0-9a-f]{6})/i.exec(resolved)?.[0];
  assert.ok(hex, `${label}: the light surface sets no ink colour`);
  assert.ok(luminance(hex) < 0.3, `${label}: ${hex} ink is too pale on ivory`);
};
expectInk('navbar account name', /\[data-user-design\] \.nav-account-card :is\(h4,[^}]*\{/);
expectInk('checkout header title', /\[data-user-design\] \.checkout-modal-header :is\(h2,[^}]*\{/);
expectInk('free-card copy', /\[data-user-design\] \.checkout-modal-shell \.checkout-free-card p \{[^}]*\}/);

// 4. A modal backdrop stays a backdrop: the generic "bg-black becomes a card"
//    rule must not turn a full-screen scrim into an opaque white panel.
assert.match(css, /\[data-user-design\] :is\(\.fixed,\.absolute\)\.inset-0\[class\*="bg-black"\] \{ background:rgba\(52,39,29,\.55\)!important; \}/,
  'full-screen scrims must stay dimmed');
assert.match(css, /\[data-user-design\] \.checkout-modal-overlay \{ background:rgba\(52,39,29,\.55\)!important; \}/,
  'the checkout scrim must stay dimmed');

// 5. Dark 900/950 tiles inside the checkout (payment states, brand pills,
//    instruction panel) are neutralised too — the modal has no dark: variants.
assert.match(css, /\[data-user-design\] \.checkout-modal-shell :is\([\s\S]*?\[class\*="bg-blue-950"\][\s\S]*?\) \{ background:#faf6ef!important; \}/,
  'dark payment tiles must become pale');
assert.match(checkout, /checkout-method[^`]*aria-pressed|aria-pressed=\{paymentMethod === 'PAYPAL'\}/,
  'payment tiles expose their selected state');
assert.equal((checkout.match(/aria-pressed=\{paymentMethod ===/g) || []).length, 3,
  'all three payment tiles state whether they are selected');
assert.match(css, /\.checkout-method\[aria-pressed="true"\] \{[\s\S]*?background:var\(--tint\)!important/,
  'the selected payment tile must read as selected on ivory');

// 6. Chips elsewhere (payment brands, review states, error notes) are lightened
//    only when the dark fill is unconditional: a `dark:`/`hover:` variant must
//    keep its own base surface.
assert.match(css, /\[class\*="bg-blue-950"\][\s\S]{0,400}?:not\(\[class\*=":bg-"\]\) \{ background:#f3f7fb!important; \}/,
  'unconditional blue/sky/orange dark fills must become pale');
assert.match(css, /\[class\*="bg-rose-950"\][\s\S]{0,400}?:not\(\[class\*=":bg-"\]\) \{ background:#fdf2f3!important; \}/,
  'unconditional rose/red dark fills must become pale');

// 7. Dark mode must be untouched: every rule added here is scoped to
//    [data-user-design], which only exists while the ivory design is active.
const blockStart = css.lastIndexOf('/*', css.indexOf('Dark-only blocks'));
const added = css.slice(blockStart).replace(/\/\*[\s\S]*?\*\//g, '');
const selectors = added.split('}')
  .map(chunk => chunk.split('{')[0].trim())
  .filter(selector => selector.length > 0);
assert.ok(selectors.length >= 10, 'the light-surface block should contain its rules');
for (const selector of selectors) {
  assert.ok(selector.startsWith('[data-user-design]'),
    `a light rule escaped the ivory scope and would restyle dark mode: ${selector}`);
}
assert.doesNotMatch(css, /\[data-user-design="ivory"\] \.nav-account-card/,
  'navbar rules must follow the shared [data-user-design] hook');

console.log('Light design: dark surfaces in the drawer, checkout and review strip are painted for ivory.');
