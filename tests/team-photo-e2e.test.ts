/**
 * END-TO-END: an admin adds an astrologer's photo and it reaches the public site.
 *
 * Runs the REAL api/admin/index.php + api/services/index.php under PHP-WASM
 * (scripts/php-admin-api-bridge.mjs, throwaway SQLite, no network), i.e. the
 * same routes Apache serves. This is the flow the owner asked for:
 *
 *   choose a file (no URL)  ->  POST /api/admin/team/photo
 *                           ->  POST /api/admin/team   (photoUrl = the upload)
 *                           ->  GET  /api/services/team (the public card data)
 *                           ->  replace / delete the member (file cleaned up)
 *
 * Requires the optional wasm runtime; SKIPs (and says so) when it is absent:
 *   npm install --no-save @php-wasm/node@3.1.54 @php-wasm/universal@3.1.54
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

/* ---------------------------------------------------------------- *
 * A tiny, real PNG encoder so the fixture is a genuine image (GD is
 * not guaranteed in every runtime, and a fake header must be refused).
 * ---------------------------------------------------------------- */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();
function crc32(buf: Buffer): number {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
/** Solid-ish RGB portrait of the requested size. */
function makePng(width: number, height: number): Buffer {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const offset = y * stride + 1 + x * 3;
      // Slow, smooth bands: a real portrait-sized PNG that compresses to a few
      // KB, so the fixture exercises the 250 KB budget instead of tripping it.
      raw[offset] = 120 + ((x >> 4) % 60);
      raw[offset + 1] = 80 + ((y >> 4) % 70);
      raw[offset + 2] = 40 + (((x + y) >> 5) % 80);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

const runtimeInstalled = fs.existsSync(path.join(root, 'node_modules', '@php-wasm', 'node'));
if (!runtimeInstalled) {
  console.log('  [SKIP] @php-wasm/node is not installed - the team-photo end-to-end flow did not run.');
  console.log('         npm install --no-save @php-wasm/node@3.1.54 @php-wasm/universal@3.1.54');
  console.log('\n[OK] team photo e2e: skipped');
  process.exit(0);
}

const { createAdminApiBridge } = await import('../scripts/php-admin-api-bridge.mjs');
const bridge = await createAdminApiBridge();
await bridge.reset();

const bytesOf = (res: any): Buffer => Buffer.from(res.bytes ?? res.body ?? []);
const jsonOf = (res: any) => {
  const text = typeof res.text === 'string' ? res.text : bytesOf(res).toString('utf8');
  return JSON.parse(text);
};

console.log('--- TEAM PHOTO END-TO-END ---');

let uploadedUrl = '';
let uploadedBytes = 0;

await check('an uploaded portrait is stored and a site URL comes back', async () => {
  const png = makePng(420, 420);
  const res = await bridge.request({ method: 'POST', url: '/api/admin/team/photo', json: { imageBase64: png.toString('base64') } });
  const body = jsonOf(res);
  assert.equal(res.status, 200, bytesOf(res).toString('utf8').slice(0, 400));
  assert.equal(body.success, true, body.message);
  assert.match(body.photoUrl, /^\/api\/uploads\/team\/[a-f0-9]{24}\.(png|jpg|webp)$/);
  assert.ok(body.bytes > 0 && body.bytes <= 250 * 1024, `stored ${body.bytes} bytes`);
  uploadedUrl = body.photoUrl;
  uploadedBytes = body.bytes;
});

await check('the stored photo is served to the browser as an image', async () => {
  const res = await bridge.request({ method: 'GET', url: uploadedUrl, auth: false });
  assert.equal(res.status, 200, 'the public URL must resolve');
  assert.match(String(res.contentType || res.headers?.['content-type'] || ''), /image\/(png|jpeg|webp)/);
  assert.equal(bytesOf(res).length, uploadedBytes, 'the served bytes are the stored photo');
});

await check('the member is created with the uploaded photo (no pasted URL)', async () => {
  const res = await bridge.request({
    method: 'POST',
    url: '/api/admin/team',
    json: {
      nameEn: 'Pandit Test Raman',
      titleEn: 'Senior Sivachariyar',
      experienceYears: 21,
      specializations: ['Birth Jathagam'],
      photoUrl: uploadedUrl,
      isActive: true,
      order: 1
    }
  });
  const body = jsonOf(res);
  assert.equal(res.status, 200, bytesOf(res).toString('utf8').slice(0, 400));
  assert.equal(body.success, true, body.message);
});

await check('the public team endpoint returns that photo for the site card', async () => {
  const res = await bridge.request({ method: 'GET', url: '/api/services/team', auth: false });
  const body = jsonOf(res);
  assert.equal(body.success, true);
  const member = (body.team || []).find((m: any) => m.nameEn === 'Pandit Test Raman');
  assert.ok(member, 'the new member is listed publicly');
  assert.equal(member.photoUrl, uploadedUrl, 'the public card gets the uploaded photo');
  // The public cards read `nameEn`; without it every real member rendered as
  // the generic "Astrology Scholar" placeholder.
  assert.equal(member.nameEn, 'Pandit Test Raman', 'the public card gets the real name');
});

await check('replacing the photo deletes the old file', async () => {
  const publicTeam = jsonOf(await bridge.request({ method: 'GET', url: '/api/services/team', auth: false }));
  const memberId = (publicTeam.team || []).find((m: any) => m.nameEn === 'Pandit Test Raman')?.id;
  assert.ok(memberId);

  const replacement = jsonOf(
    await bridge.request({ method: 'POST', url: '/api/admin/team/photo', json: { imageBase64: makePng(300, 300).toString('base64') } })
  );
  assert.equal(replacement.success, true, replacement.message);

  const put = await bridge.request({ method: 'PUT', url: `/api/admin/team/${memberId}`, json: { photoUrl: replacement.photoUrl } });
  assert.equal(put.status, 200);

  const oldFile = await bridge.request({ method: 'GET', url: uploadedUrl, auth: false });
  assert.equal(oldFile.status, 404, 'the replaced portrait must not linger on disk');
  const newFile = await bridge.request({ method: 'GET', url: replacement.photoUrl, auth: false });
  assert.equal(newFile.status, 200);
  uploadedUrl = replacement.photoUrl;
});

await check('removing the member removes their photo', async () => {
  const publicTeam = jsonOf(await bridge.request({ method: 'GET', url: '/api/services/team', auth: false }));
  const memberId = (publicTeam.team || []).find((m: any) => m.nameEn === 'Pandit Test Raman')?.id;
  const del = await bridge.request({ method: 'DELETE', url: `/api/admin/team/${memberId}` });
  assert.equal(del.status, 200);
  const gone = await bridge.request({ method: 'GET', url: uploadedUrl, auth: false });
  assert.equal(gone.status, 404, 'a deleted member leaves no photo behind');
});

await check('a non-image upload is refused with a usable message', async () => {
  const res = await bridge.request({
    method: 'POST',
    url: '/api/admin/team/photo',
    json: { imageBase64: Buffer.from('<?php echo "pwned"; ?>').toString('base64') }
  });
  const body = jsonOf(res);
  assert.equal(res.status, 400);
  assert.equal(body.success, false);
  assert.match(body.message, /JPG, PNG or WebP/);
});

await check('an upload over 250 KB is refused', async () => {
  // 700×700 of noise compresses poorly, so the PNG crosses the budget.
  const noise = Buffer.alloc(700 * 700 * 3 + 700);
  for (let i = 0; i < noise.length; i++) noise[i] = (i * 37 + (i % 251)) & 0xff;
  const res = await bridge.request({
    method: 'POST',
    url: '/api/admin/team/photo',
    json: { imageBase64: noise.toString('base64') }
  });
  const body = jsonOf(res);
  assert.equal(res.status, 400, 'anything larger than the budget must not be stored');
  assert.equal(body.success, false);
});

await check('only an admin can upload a photo', async () => {
  const res = await bridge.request({
    method: 'POST',
    url: '/api/admin/team/photo',
    json: { imageBase64: makePng(120, 120).toString('base64') },
    auth: false
  });
  assert.notEqual(res.status, 200, 'an anonymous upload must be rejected');
});

await check('the admin listing shows the photo it stored', async () => {
  const photo = jsonOf(
    await bridge.request({ method: 'POST', url: '/api/admin/team/photo', json: { imageBase64: makePng(200, 260).toString('base64') } })
  );
  assert.equal(photo.success, true, photo.message);
  await bridge.request({
    method: 'POST',
    url: '/api/admin/team',
    json: { nameEn: 'Sastri Test Ganesan', titleEn: 'Muhurtha Vidwan', photoUrl: photo.photoUrl, order: 2 }
  });
  const listing = jsonOf(await bridge.request({ method: 'GET', url: '/api/admin/team' }));
  const member = (listing.team || []).find((m: any) => m.nameEn === 'Sastri Test Ganesan');
  assert.ok(member, 'the member is listed in the panel');
  assert.equal(member.photoUrl, photo.photoUrl, 'the panel shows the uploaded photo');
});

await bridge.close();
console.log(`\n[OK] team photo e2e: ${passed} checks passed`);
process.exit(0);
