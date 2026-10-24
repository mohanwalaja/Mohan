import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {dismissBootSplash, capturePrerenderedPage} from './services/bootSplash';
import './index.css';

// Prerendered documents (scripts/prerender.mjs) carry the page's SEO head
// tags baked into the static HTML for crawlers that never run JavaScript, and
// raw dev / SPA fallback loads carry index.html's static head tags.
// React 19 hoists its own <title>/<meta>/<link> when the SPA mounts, so the
// initial copies must go first — otherwise SPA navigation leaves duplicate
// <title> and <link rel="canonical"> elements in <head>.
for (const el of Array.from(
  document.head.querySelectorAll(
    '[data-prerender-seo], title, link[rel="canonical"], meta[name="description"], meta[name="robots"], meta[property^="og:"]:not([property="og:locale"]), meta[name^="twitter:"]'
  )
)) {
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
// App.tsx's RouteLoadedMarker, which fires the moment a route has rendered.
// This timer only matters when that never happens even though this module DID
// execute: a render that throws outside the boundary, a route chunk the
// recovery could not rescue, a locked-up main thread. On those days the visitor
// gets the prerendered document (fully styled by now — the stylesheet is a
// separate, earlier request) instead of a spinner that never ends.
//
// The value sits below the splash's own 8 s CSS escape hatch (index.html), so
// the CSS fallback remains what saves a document where this file never runs —
// a stale deploy whose entry chunk 404s, or a wrong content-encoding.
const BOOT_SPLASH_GIVE_UP_MS = 3500;
window.setTimeout(dismissBootSplash, BOOT_SPLASH_GIVE_UP_MS);

// PWA install + offline fallback. Registration is production-only so a worker
// cannot interfere with Vite development or HMR. public/sw.js caches only the
// self-contained offline document; it never restores the retired cache-first
// app-shell strategy and never intercepts API/calculation requests.
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Installation is progressive enhancement: the online app still works
      // when a browser or host policy blocks service-worker registration.
    });
  }, { once: true });
}

