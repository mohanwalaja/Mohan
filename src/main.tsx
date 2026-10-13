import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

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

