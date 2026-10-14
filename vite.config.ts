import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { compressBuildOutput } from './vite-plugin-compress';

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
 * public/.htaccess rule (g): a clean URL like /services resolves to the flat
 * dist/services.html that scripts/prerender.mjs wrote at build time.
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
          const candidate = path.join(outDir, `${match[1].toLowerCase()}.html`);
          if (!candidate.startsWith(outDir + path.sep)) return next();
          if (!fs.existsSync(candidate)) return next();
          const qIdx = rawUrl.indexOf('?');
          const query = qIdx === -1 ? '' : rawUrl.slice(qIdx);
          req.url = `/${path.basename(candidate)}${query}`;
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
    packages: ['astronomy-engine', 'tz-lookup'],
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
            if (id.includes('vite/preload-helper')) return 'vendor-core';
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
    plugins: [react(), tailwindcss(), apiDevMiddleware(), previewServePrerendered(), previewServePrecompressed(), compressBuildOutput()],
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
