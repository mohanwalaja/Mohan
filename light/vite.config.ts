/**
 * ASTRO SIVAM — light UI (Sunrise Ivory)
 * =================================================
 *
 * This is a SECOND, standalone front-end that lives beside the existing
 * `src/` application. The classic design is never imported by it.
 *
 * TWO WAYS TO BUILD IT
 * --------------------
 *   npm run dev:light        → http://localhost:5200   (dev server, this UI)
 *   npm run dev              → the unchanged dark UI
 *
 *   npm run build:light      → light/dist               (standalone preview)
 *   vite build --mode light-deploy → ../dist/assets/light (the deploy build that
 *                              scripts/prerender-light.mjs turns into the
 *                              pages/<route>-light.html documents, served at
 *                              the canonical clean URLs by public/.htaccess
 *                              while the operator selects the light design in
 *                              Admin → Site Design)
 *
 * The deploy build keeps EVERY new byte inside the classic dist/assets/ folder
 * (tests/dist-shape.test.ts pins the deploy root to assets, audio, pages,
 * video-scenes) and loads nothing from the network: the bundle is content-
 * hashed under /assets/light/, and the public/ folder is deliberately not
 * copied again — the light documents reuse the brand files the classic build
 * already ships.
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

const deployOutDir = path.resolve(repoRoot, 'dist', 'assets', 'light');

export default defineConfig(({ mode }) => {
  /** The deploy build writes into the classic dist/ (assets/light/). */
  const deploy = mode === 'light-deploy';

  return {
    root: lightRoot,
    // Serve the repository's existing public/ folder, so the self-hosted fonts,
    // favicons, audio and images are the very same files the live site ships.
    // The deploy build does NOT copy it: dist/ already has those files at its
    // root (the classic build put them there).
    publicDir: deploy ? false : path.resolve(repoRoot, 'public'),
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
    build: deploy
      ? {
          outDir: deployOutDir,
          emptyOutDir: true,
          target: 'es2022',
          // The light documents are written by scripts/prerender-light.mjs,
          // which needs the content-hashed file names for its <script>/<link>
          // tags. outDir is outside this root, hence the explicit emptying.
          assetsDir: '',
          manifest: true,
        }
      : {
          outDir: path.resolve(lightRoot, 'dist'),
          emptyOutDir: true,
          target: 'es2022',
        },
    // `base` is a top-level option, but only the deploy build needs it: the
    // standalone preview stays on '/' like the dev server.
    base: deploy ? '/assets/light/' : '/',
  };
});
