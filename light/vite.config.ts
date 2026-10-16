/**
 * ASTRO SIVAM — "Daylight" light UI (preview build)
 * =================================================
 *
 * This is a SECOND, standalone front-end that lives beside the existing
 * `src/` application. Nothing here is imported by the current site and nothing
 * in the current site imports from here — the production design keeps working
 * exactly as it does today.
 *
 *   npm run dev:light     → http://localhost:5200   (this UI)
 *   npm run dev           → the unchanged dark UI
 *
 * Shared, already-verified code (the astrology engine, pricing rules, business
 * identity, FAQ copy, team and testimonial data) is reused through the
 * `@shared` alias so this UI can never disagree with the shipped one about an
 * ayanamsa, a price or a delivery promise.
 */
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const lightRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(lightRoot, '..');

export default defineConfig({
  root: lightRoot,
  // Serve the repository's existing public/ folder, so the self-hosted fonts,
  // favicons, audio and images are the very same files the live site ships.
  publicDir: path.resolve(repoRoot, 'public'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': path.resolve(repoRoot, 'src'),
      '@': path.resolve(lightRoot, 'src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5200,
    strictPort: true,
    // The Arena live preview reaches this server through its own proxied
    // hostname, so Vite's host allowlist has to be opened for the preview to
    // load at all (this dev server only ever serves this preview UI).
    allowedHosts: true,
    fs: { allow: [repoRoot] },
  },
  preview: { host: '0.0.0.0', port: 5200, strictPort: true, allowedHosts: true },
  build: {
    outDir: path.resolve(lightRoot, 'dist'),
    emptyOutDir: true,
    target: 'es2022',
  },
});
