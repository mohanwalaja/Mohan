import { brotliCompressSync, gzipSync, constants as zlibConstants } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * Emits Brotli- and gzip-compressed siblings for every build artifact so the
 * static host can serve <file>.br / <file>.gz directly instead of compressing
 * on the fly. This does NOT change what index.html references (it always keeps
 * the original URL); public/.htaccess maps each request to the precompressed
 * file when the browser advertises the matching Accept-Encoding.
 *
 * Why build-time instead of on-the-fly: shared cPanel hosts run mod_deflate
 * (gzip) but frequently lack mod_brotli, so Brotli only becomes available this
 * way. zlib is part of Node, so this adds zero runtime dependencies.
 *
 * WHY THIS HOOK IS writeBundle AND MUST NEVER GO BACK TO generateBundle
 * (the astrosivam.com outage of 2026-10-13, `ReferenceError:
 * __VITE_PRELOAD__ is not defined` on every lazy route):
 *
 * Vite rewrites the dynamic-import preload placeholder `__VITE_PRELOAD__` in
 * the `generateBundle` hook of its core `vite:build-import-analysis` plugin.
 * Vite's `resolvePlugins()` assembles the hook order as
 *
 *     ...userPostPlugins, ...buildPlugins.post   // build-import-analysis lives here
 *
 * so a user plugin with `enforce: 'post'` — like this one used to be — runs its
 * `generateBundle` BEFORE the placeholder replacement. Compressing there froze
 * the unreplaced identifier into the .br/.gz siblings while the raw .js files
 * (written after every generateBundle hook) came out clean. cPanel's .htaccess
 * negotiates every .js request to the poisoned .br sibling, so production
 * executed code containing a free `__VITE_PRELOAD__` reference — and the local
 * `grep __VITE_PRELOAD__ dist/assets/*.js` found nothing, hiding the bug.
 *
 * `writeBundle` runs after ALL generateBundle hooks and after Rollup has
 * written the final files to disk, so this plugin now re-reads the emitted
 * bytes from disk: whatever ships in <file> is exactly what gets compressed,
 * regardless of plugin ordering. tests/dist-shape.test.ts re-verifies that
 * invariant (raw + decompressed siblings) after every build.
 */
export function compressBuildOutput(): Plugin {
  // Text assets worth pre-compressing. Images/fonts are already compressed
  // and must not be re-encoded, so they are skipped.
  const compressible =
    /\.(js|mjs|cjs|css|html|json|svg|txt|xml|webmanifest|wasm|map)$/i;

  return {
    name: 'astro-compress-build-output',
    apply: 'build',
    enforce: 'post',
    writeBundle(options, bundle) {
      // Vite's build always resolves output.dir to build.outDir; the fallback
      // keeps the plugin correct for exotic configs that only set outFile.
      const outDir = options.dir ?? path.resolve(process.cwd(), 'dist');

      const jobs: Array<{ fileName: string; contents: Buffer; absPath: string }> = [];
      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type !== 'asset' && output.type !== 'chunk') continue;
        if (!compressible.test(fileName)) continue;
        // Read the bytes Rollup actually wrote to disk. In generateBundle the
        // chunk objects can still be mutated by other plugins' hooks later
        // (that is exactly how the preload placeholder leaked), so their
        // in-memory `code`/`source` must never be the compression input here.
        const absPath = path.join(outDir, fileName);
        let contents: Buffer;
        try {
          contents = readFileSync(absPath);
        } catch (err) {
          this.warn(`Pre-compressed sibling skipped, cannot read ${fileName}: ${String(err)}`);
          continue;
        }
        // Not worth framing a compressed envelope around very small files.
        if (contents.length < 1024) continue;
        jobs.push({ fileName, contents, absPath });
      }

      for (const { fileName, contents, absPath } of jobs) {
        try {
          // Brotli quality 11: slowest/best. This runs once per deploy, and the
          // win is the largest of the three encodings on modern browsers.
          writeFileSync(
            `${absPath}.br`,
            brotliCompressSync(contents, {
              params: {
                [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
                [zlibConstants.BROTLI_PARAM_SIZE_HINT]: contents.length,
              },
            }),
          );
        } catch (err) {
          this.warn(`Brotli compression skipped for ${fileName}: ${String(err)}`);
        }
        try {
          // gzip level 9, fallback for clients without Brotli (older Safari).
          writeFileSync(`${absPath}.gz`, gzipSync(contents, { level: 9 }));
        } catch (err) {
          this.warn(`gzip compression skipped for ${fileName}: ${String(err)}`);
        }
      }
    },
  };
}
