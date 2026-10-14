import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// NOTE (2026-10-12): the offline service worker was removed (cache-first
// served a stale app shell after deploys). public/sw.js now only self-retires
// any already-installed worker; we no longer register one here.

