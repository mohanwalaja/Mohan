import { brotliCompressSync, gzipSync, constants as zlibConstants } from 'node:zlib';
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
 */
export function compressBuildOutput(): Plugin {
  return {
    name: 'astro-compress-build-output',
    apply: 'build',
    enforce: 'post',
    async generateBundle(_options, bundle) {
      // Text assets worth pre-compressing. Images/fonts are already compressed
      // and must not be re-encoded, so they are skipped.
      const compressible =
        /\.(js|mjs|cjs|css|html|json|svg|txt|xml|webmanifest|wasm|map)$/i;

      const jobs: Array<{ fileName: string; contents: Buffer }> = [];
      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type !== 'asset' && output.type !== 'chunk') continue;
        if (!compressible.test(fileName)) continue;
        // OutputAsset carries `source`; OutputChunk carries `code`. Normalise
        // both to a Buffer so the compressors get the exact emitted bytes.
        const contents = output.type === 'chunk'
          ? Buffer.from(output.code)
          : Buffer.isBuffer(output.source)
            ? output.source
            : Buffer.from(output.source as string);
        // Not worth framing a compressed envelope around very small files.
        if (contents.length < 1024) continue;
        jobs.push({ fileName, contents });
      }

      for (const { fileName, contents } of jobs) {
        try {
          // Brotli quality 11: slowest/best. This runs once per deploy, and the
          // win is the largest of the three encodings on modern browsers.
          this.emitFile({
            type: 'asset',
            fileName: `${fileName}.br`,
            source: brotliCompressSync(contents, {
              params: {
                [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
                [zlibConstants.BROTLI_PARAM_SIZE_HINT]: contents.length,
              },
            }),
          });
        } catch (err) {
          this.warn(`Brotli compression skipped for ${fileName}: ${String(err)}`);
        }
        try {
          // gzip level 9, fallback for clients without Brotli (older Safari).
          this.emitFile({
            type: 'asset',
            fileName: `${fileName}.gz`,
            source: gzipSync(contents, { level: 9 }),
          });
        } catch (err) {
          this.warn(`gzip compression skipped for ${fileName}: ${String(err)}`);
        }
      }
    },
  };
}
