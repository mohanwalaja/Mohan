import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {dismissBootSplash, capturePrerenderedPage} from './services/bootSplash';
import './index.css';

// Prerendered documents (scripts/prerender.mjs) carry the page's SEO head
// tags baked into the static HTML for crawlers that never run JavaScript.
// React 19 hoists its own <title>/<meta>/<link> when the SPA mounts, so the
// baked copies must go first — otherwise SPA navigation would leave the first
// page's stale title/canonical sitting next to the current one. The baked
// body inside #root needs no cleanup: createRoot replaces it on first render.
for (const el of Array.from(document.querySelectorAll('[data-prerender-seo]'))) {
  el.remove();
}

// Mobile guard: the document must never pan sideways. On phones, focusing the
// birth date / time inputs could trigger a programmatic horizontal scroll /
// zoom toward the field that the visitor could not undo (only a reload reset
// it). `overflow-x: clip` in index.css blocks this on modern browsers; this
// listener resets any residual horizontal scroll on focus for older engines.
const resetHorizontalScroll = () => {
  if (document.documentElement.scrollLeft !== 0) document.documentElement.scrollLeft = 0;
  if (document.body.scrollLeft !== 0) document.body.scrollLeft = 0;
};
document.addEventListener('focusin', () => requestAnimationFrame(resetHorizontalScroll));

capturePrerenderedPage();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Boot-splash safety valve (mobile white-screen fix, 2026-10-14 — see
// src/services/bootSplash.ts for the whole story). The normal hand-off is
// App.tsx's RouteLoadedMarker, which releases customer pages after their public
// design resolves (or immediately when a valid cache exists) and keeps admin
// startup immediate. This timer also covers a stuck settings request, a render
// that throws outside the boundary, a route chunk the recovery could not
// rescue, or a locked-up main thread. On those days the visitor gets the
// prerendered document instead of a splash that never ends.
//
// The value sits below the splash's own 8 s CSS escape hatch (index.html), so
// the CSS fallback remains what saves a document where this file never runs —
// a stale deploy whose entry chunk 404s, or a wrong content-encoding.
const BOOT_SPLASH_GIVE_UP_MS = 6000;
window.setTimeout(dismissBootSplash, BOOT_SPLASH_GIVE_UP_MS);

// NOTE (2026-10-12): the offline service worker was removed (cache-first
// served a stale app shell after deploys). public/sw.js now only self-retires
// any already-installed worker; we no longer register one here.

