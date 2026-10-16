import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { resolveLightDocumentDesign } from '@shared/services/designSwitch';
import { dismissBootSplash } from '@shared/services/bootSplash';
import './styles/app.css';

/**
 * ASTRO SIVAM — light design entry.
 *
 * Two builds land here:
 *   · `npm run dev:light` / `npm run preview:light` — the standalone light UI.
 *   · the DEPLOYED light documents (scripts/prerender-light.mjs), served at the
 *     canonical clean URLs by public/.htaccess while the operator has the light
 *     design selected in Admin → Site Design.
 *
 * The boot gate is the second case: a light document can outlive the setting
 * that produced it (the operator switches back to the classic design while a
 * tab still holds the light page, or someone opens a `-light.html` document
 * directly). It asks the public settings endpoint which design is selected and,
 * if it is no longer this one, sends the visitor to the classic page — the
 * light bundle never keeps showing a design the operator has retired. The
 * fetch is deliberately not awaited: the app paints immediately, exactly as it
 * does today, and only a real mismatch navigates.
 */

// The light documents carry the same inline boot splash as the classic ones
// (see tests/boot-splash-contract.test.ts). Hand it over as soon as React has
// mounted: the splash is pure markup + CSS, and the 8 s escape hatch inside it
// covers the case where this module never runs at all.
dismissBootSplash();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void resolveLightDocumentDesign();
