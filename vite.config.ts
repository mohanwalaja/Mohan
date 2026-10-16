import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { compressBuildOutput } from './vite-plugin-compress';

/**
 * Serve the operator's selected design during `vite preview`, mirroring
 * public/.htaccess rule (f2): while the activation marker api/.design-light
 * exists, a clean URL resolves to the LIGHT prerendered document
 * (dist/pages/<route>-light.html from scripts/prerender-light.mjs) instead of
 * the classic one — the same URLs, the same negotiation, the same bytes Apache
 * would serve.
 *
 * WHY: the switch is a server-side rewrite, so a preview that always served the
 * classic documents could not exercise it at all (and would leave "two designs,
 * one admin setting" untestable outside cPanel). A real host writes the marker
 * from the admin panel; a local preview has no PHP, so the marker is read from
 * the built dist/api/ when present and from the repository's api/ folder
 * otherwise — that second path is how a developer demos the switch locally
 * (`touch api/.design-light`).
 *
 * The route list mirrors the light rule in public/.htaccess; the four
 * account/operator routes (login, register, dashboard, admin) deliberately have
 * no light document.
 */
const LIGHT_DESIGN_ROUTES = [
  'services',
  'birth-jathagam',
  'marriage-compatibility',
  'baby-naming',
  'muhurtham',
  'how-it-works',
  'about',
  'team',
  'contact',
  'privacy-policy',
  'terms',
  'payment-policy',
  'refund-policy',
];

function previewServeSiteDesign(): Plugin {
  return {
    name: 'astro-preview-site-design',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        try {
          if (req.method !== 'GET' && req.method !== 'HEAD') return next();
          const outDir = path.resolve(server.config.root, server.config.build.outDir);
          const marker = [
            path.join(outDir, 'api', '.design-light'),
            path.join(server.config.root, 'api', '.design-light'),
          ].find((candidate) => fs.existsSync(candidate));
          if (!marker) return next();

          const rawUrl = req.url || '';
          const urlPath = decodeURIComponent(rawUrl.split('?')[0]);
          if (urlPath.startsWith('/assets/') || urlPath.startsWith('/pages/') || urlPath.startsWith('/api/')) {
            return next();
          }

          const trimmed = urlPath.replace(/^\/+|\/+$/g, '').toLowerCase();
          if (trimmed !== '' && !LIGHT_DESIGN_ROUTES.includes(trimmed)) return next();
          const name = trimmed === '' ? 'index' : trimmed;
          const candidate = path.join(outDir, 'pages', `${name}-light.html`);
          if (!candidate.startsWith(outDir + path.sep) || !fs.existsSync(candidate)) return next();

          const queryIndex = rawUrl.indexOf('?');
          const query = queryIndex === -1 ? '' : rawUrl.slice(queryIndex);
          req.url = `/pages/${name}-light.html${query}`;
          next();
        } catch {
          next();
        }
      });
    },
  };
}

/**
 * Serve the pre-compressed .br/.gz siblings during `vite preview`, replicating
 * public/.htaccess's Accept-Encoding negotiation.
 *
 * WHY: the preview smoke (playwright.preview.config.ts) claims to run against
 * "the exact asset layout that ships to cPanel", but plain preview always
 * served the raw .js files — while production transparently swaps in the
 * negotiated .br sibling. That blind spot is how the `__VITE_PRELOAD__`
 * incident reached production with a green CI: the poisoned bytes only ever
 * travelled through the .br path, which the smoke never exercised. With this
 * middleware the smoke executes the very bytes Apache would serve.
 */
/**
 * Serve the prerendered per-route documents during `vite preview`, mirroring
 * public/.htaccess rule (g): a clean URL like /services resolves to
 * dist/pages/services.html that scripts/prerender.mjs wrote at build time.
 *
 * WHY: the preview smoke (playwright.preview.config.ts) claims to run against
 * "the exact asset layout that ships to cPanel". Without this middleware
 * /services would fall through to the SPA shell in preview while production
 * serves the prerendered document — exactly the blind spot that hid the SEO
 * audit findings (every URL returning the identical empty shell).
 */

function previewServePrerendered(): Plugin {
  return {
    name: 'astro-preview-prerendered',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        try {
          if (req.method !== 'GET' && req.method !== 'HEAD') return next();
          const rawUrl = req.url || '';
          const urlPath = decodeURIComponent(rawUrl.split('?')[0]);
          const match = urlPath.match(/^\/([a-z0-9-]+)\/?$/i);
          if (!match) return next();
          const outDir = path.resolve(server.config.root, server.config.build.outDir);
          const candidate = path.join(outDir, 'pages', `${match[1].toLowerCase()}.html`);
          if (!candidate.startsWith(outDir + path.sep)) return next();
          if (!fs.existsSync(candidate)) return next();
          const qIdx = rawUrl.indexOf('?');
          const query = qIdx === -1 ? '' : rawUrl.slice(qIdx);
          req.url = `/pages/${path.basename(candidate)}${query}`;
          next();
        } catch {
          next();
        }
      });
    },
  };
}

function previewServePrecompressed(): Plugin {
  const COMPRESSIBLE =
    /\.(js|mjs|css|html|json|svg|txt|xml|webmanifest|wasm|map)$/;
  const CONTENT_TYPES: Record<string, string> = {
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.webmanifest': 'application/manifest+json',
    '.wasm': 'application/wasm',
    '.map': 'application/json; charset=utf-8',
  };
  return {
    name: 'astro-preview-precompressed',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        try {
          if (req.method !== 'GET' && req.method !== 'HEAD') return next();
          let urlPath = decodeURIComponent((req.url || '').split('?')[0]);
          // Apache reaches index.html for `/` through its SPA fallback rewrite
          // and only then negotiates — mirror that final target here.
          if (urlPath.endsWith('/')) urlPath += 'index.html';
          if (!COMPRESSIBLE.test(urlPath)) return next();
          const outDir = path.resolve(server.config.root, server.config.build.outDir);
          const filePath = path.resolve(outDir, `.${urlPath}`);
          // No sibling files outside of dist/ — mirror the .htaccess "-f" guard.
          if (!filePath.startsWith(outDir + path.sep)) return next();
          const accept = String(req.headers['accept-encoding'] || '');
          const candidates: Array<[string, string]> = [];
          if (/\bbr\b/.test(accept)) candidates.push(['.br', 'br']);
          if (/\bgzip\b/.test(accept)) candidates.push(['.gz', 'gzip']);
          for (const [ext, encoding] of candidates) {
            const sibling = `${filePath}${ext}`;
            if (!fs.existsSync(sibling)) continue;
            res.setHeader('Content-Type', CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream');
            res.setHeader('Content-Encoding', encoding);
            res.setHeader('Vary', 'Accept-Encoding');
            if (req.method === 'HEAD') {
              res.statusCode = 200;
              res.end();
              return;
            }
            fs.createReadStream(sibling).pipe(res);
            return;
          }
          next();
        } catch {
          next();
        }
      });
    },
  };
}

function apiDevMiddleware(): Plugin {
  return {
    name: 'api-dev-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';

        // Handle calculate-preview in dev
        if (
          (url.startsWith('/api/services/calculate-preview') || url.includes('calculate-preview')) &&
          req.method === 'POST'
        ) {
          let body = '';
          req.on('data', chunk => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const data = JSON.parse(body || '{}');
              const { calculateLocalAstrology } = await import('./src/services/localAstrology');
              const result = calculateLocalAstrology(data.serviceType, data.payload);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, nodeType: 'TRUE', result }));
            } catch (err: any) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, message: err?.message || 'Calculation failed' }));
            }
          });
          return;
        }

        // Prevent dev server from serving raw PHP file sources as static 200 text
        if (url.endsWith('.php') || url.includes('.php?')) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, message: 'PHP script execution is not active on the dev server.' }));
          return;
        }

        next();
      });
    }
  };
}

/**
 * Vendor chunks, grouped by npm package.
 *
 * WHY BY PACKAGE: a module id like `node_modules/canvg/lib/index.es.js` never
 * contains the string "jspdf", yet canvg is jspdf's SVG renderer. Matching on
 * ids put every such transitive dependency into `vendor-core` — the chunk the
 * app entry statically imports — so jspdf's and recharts' dependencies were
 * unconditionally downloaded by every visitor, including on the homepage.
 *
 * Every package NOT listed here (react, react-dom, lucide-react, …) stays in
 * `vendor-core`, i.e. in the initial bundle: React itself must never be
 * deferred (white-screen safety, tests/dist-shape.test.ts).
 */
/**
 * The HTML report builders, one chunk each (audit PERF-1).
 *
 * WHY THEY ARE NAMED CHUNKS: `jathagamPdfExporter` imports all five builders,
 * and Rollup's default chunking folds a module that is both statically and
 * dynamically imported into the chunk of the static importer. That put the
 * builders INSIDE the exporter chunk — the chunk that statically imports the
 * PDF engine — so `import('.../jathagamHtmlBuilder')` from the preview modal
 * resolved to the exporter and a visitor opening a sample report downloaded
 * jspdf + html2canvas after all. Naming each builder forces them out of the
 * exporter chunk, and the preview's dynamic import then fetches only the
 * builder for the report being shown (the Baby Naming builder carries the
 * ~370 KB name tables, the Muhurtham one the ~245 KB scan data).
 */
const REPORT_BUILDER_CHUNKS = [
  'jathagamHtmlBuilder',
  'weddingHtmlBuilder',
  'babyNamingHtmlBuilder',
  'muhurthamHtmlBuilder',
  'invoiceHtmlBuilder',
];

const VENDOR_CHUNK_GROUPS: Array<{ name: string; packages: string[] }> = [
  {
    name: 'vendor-pdf',
    // jspdf + html2canvas and everything they pull in. Loaded only when a
    // visitor actually downloads/exports a PDF.
    packages: [
      'jspdf',
      'jspdf-autotable',
      'html2canvas',
      'canvg',
      'dompurify',
      'fflate',
      'fast-png',
      'pako',
      'iobuffer',
      'rgbcolor',
      'stackblur-canvas',
      'svg-pathdata',
      'raf',
      'performance-now',
      'core-js',
      '@babel/runtime',
    ],
  },
  {
    name: 'vendor-charts',
    // recharts and its state/d3 layer — the admin analytics dashboard only.
    packages: [
      'recharts',
      'victory-vendor',
      'd3-array',
      'd3-color',
      'd3-ease',
      'd3-format',
      'd3-interpolate',
      'd3-path',
      'd3-scale',
      'd3-shape',
      'd3-time',
      'd3-time-format',
      'd3-timer',
      'internmap',
      'decimal.js-light',
      '@reduxjs/toolkit',
      'react-redux',
      'redux',
      'redux-thunk',
      'reselect',
      'immer',
      'es-toolkit',
      'clsx',
      'eventemitter3',
      'tiny-invariant',
      'use-sync-external-store',
    ],
  },
  {
    name: 'vendor-astrology',
    packages: ['astronomy-engine'],
  },
  {
    // Form timezone lookup does not need the astronomy calculation engine.
    name: 'vendor-timezone',
    packages: ['tz-lookup'],
  },
  {
    name: 'vendor-maps',
    // Leaflet — imported only by the on-demand map picker modal.
    packages: ['leaflet'],
  },
];

/** The npm package a node_modules module id belongs to (`@scope/name` included). */
function nodePackageName(id: string): string {
  const marker = 'node_modules/';
  const index = id.lastIndexOf(marker);
  if (index === -1) return '';
  const rest = id.slice(index + marker.length);
  if (!rest.startsWith('@')) return rest.split('/')[0];
  const [scope, name] = rest.split('/');
  return name ? `${scope}/${name}` : scope;
}

export default defineConfig(() => {
  return {
    base: '/',
    // Strip console.log/debug/info in production builds to keep the shipped
    // JS clean; console.warn and console.error are preserved so operators can
    // still see real warnings in the browser console.
    esbuild: {
      drop: process.env.NODE_ENV === 'production' ? ['console'] : [],
    },
    // No source maps in production builds: they are stripped from every deploy
    // path anyway, and skipping them keeps the pre-compression step (below)
    // from generating .map.br / .map.gz files that would never be served.
    build: {
      sourcemap: false,
      emptyOutDir: true,
      rollupOptions: {
        output: {
          // Vendor chunking by PACKAGE rather than by substring match on the
          // module id (audit PERF-1). The old rules recognised only the four
          // direct imports, so every transitive dependency fell into
          // `vendor-core` — the one vendor chunk the entry chunk always
          // imports. The homepage therefore downloaded jspdf's raster/SVG
          // helpers (canvg 169 KB, pako 109 KB, dompurify 84 KB, fflate,
          // fast-png, svg-pathdata, stackblur) and recharts' state layer
          // (redux, immer, d3, es-toolkit, …) as part of React's chunk, even
          // though they are reachable only from the PDF renderer and the
          // admin charts. They now ship with those features and are fetched
          // when — and only when — the feature is used.
          manualChunks(id) {
            // The Vite preload helper is statically imported by EVERY chunk
            // that performs a dynamic import, including the app entry. When
            // Rollup parked it inside a heavy chunk (it landed in
            // `vendor-pdf`), that whole chunk became a static dependency of the
            // entry and Vite emitted a modulepreload for it on first paint —
            // the homepage downloaded jspdf + html2canvas to run a helper for
            // dynamic imports it had not made yet. Keep it in the chunk the
            // entry already needs.
            if (id.includes('vite/preload-helper') || id.includes('commonjsHelpers')) return 'vendor-core';
            // Forms use timezone lookup, reports use its formatting helpers.
            // Keep this shared utility out of the heavy report-builder chunks.
            if (/\/lib\/timezone\.tsx?$/.test(id)) return 'timezone';
            // The registered-business identity (Udyam/MSME number + office
            // address) is read by the Contact page AND by the deferred invoice
            // builder, so Rollup hoisted it INTO the invoice builder's manual
            // chunk - which made that chunk a static dependency of the entry and
            // re-opened the PERF-1 finding (the homepage preloading the
            // report-builder/PDF path). Pin it to the vendor chunk the entry
            // already downloads; the deferred invoice chunk then merely imports
            // what is already on the page.
            if (/\/data\/businessInfo\.ts$/.test(id)) return 'vendor-core';
            // The live Muhurtham form needs the scanner, not the report HTML.
            // Explicit shared-engine boundaries stop report builders from
            // absorbing calculation/data modules used by the form as well.
            if (id.includes('/lib/astrology/') || id.includes('/services/jathagamDoshaData.')) return 'astrology-core';
            if (/\/lib\/muhurtham\/(scanner\.ts|rules\.json)$/.test(id)) return 'scanner';
            // One chunk per report builder — see REPORT_BUILDER_CHUNKS.
            for (const builder of REPORT_BUILDER_CHUNKS) {
              if (new RegExp(`/services/${builder}\\.tsx?$`).test(id)) return builder;
            }
            if (id.includes('node_modules')) {
              const pkg = nodePackageName(id);
              for (const group of VENDOR_CHUNK_GROUPS) {
                if (group.packages.includes(pkg)) return group.name;
              }
              return 'vendor-core';
            }
            return undefined;
          },
        },
      },
    },
    // previewServeSiteDesign() runs before previewServePrerendered(): the
    // design marker decides which document set a clean URL resolves to (the
    // same order public/.htaccess uses).
    plugins: [react(), tailwindcss(), apiDevMiddleware(), previewServeSiteDesign(), previewServePrerendered(), previewServePrecompressed(), compressBuildOutput()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // Dev-only: when DEV_PREVIEW_API is set, route /api to the Node stand-in
      // (scripts/dev-preview-api.ts) so report previews work without PHP.
      proxy: process.env.DEV_PREVIEW_API
        ? { '/api': { target: `http://127.0.0.1:${process.env.DEV_PREVIEW_API_PORT || 8787}`, changeOrigin: true } }
        : undefined,
    },
    preview: {
      allowedHosts: true as const,
      proxy: process.env.DEV_PREVIEW_API
        ? { '/api': { target: `http://127.0.0.1:${process.env.DEV_PREVIEW_API_PORT || 8787}`, changeOrigin: true } }
        : undefined,
    },
  };
});
