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
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('jspdf') || id.includes('html2canvas')) {
                return 'vendor-pdf';
              }
              if (id.includes('astronomy-engine') || id.includes('tz-lookup')) {
                return 'vendor-astrology';
              }
              if (id.includes('recharts')) {
                return 'vendor-charts';
              }
              if (id.includes('leaflet')) {
                return 'vendor-maps';
              }
              return 'vendor-core';
            }
          },
        },
      },
    },
    plugins: [react(), tailwindcss(), apiDevMiddleware(), previewServePrecompressed(), compressBuildOutput()],
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
