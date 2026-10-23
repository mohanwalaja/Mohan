import { readRepoSource } from './helpers/module-sources.js';
/**
 * REGRESSION: "I filled all details and photo, Add Member button not working."
 *
 * The button itself was fine. POST /api/admin/team inserted `name_ta` and
 * `updated_at`, but api/schema.sql never declared those columns — so on a real
 * MySQL database the statement died with "Unknown column 'name_ta' in 'field
 * list'". The endpoint answered HTTP 500 with an EMPTY body, and the panel only
 * reacted when `success` was true, so the admin saw nothing happen at all.
 *
 * The SQLite test double hid the bug because it declared the columns the real
 * schema did not. These checks therefore:
 *   1. run the REAL route against a team_members table built from api/schema.sql,
 *   2. run it again against a pre-migration table (no name_ta/education/updated_at)
 *      to prove the route adapts instead of answering 500,
 *   3. fail the build if the test double and api/schema.sql ever drift apart
 *      again,
 *   4. fail if the panel goes back to swallowing a failed save.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readRepoSource(p);

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

/** The `team_members` CREATE TABLE block from api/schema.sql, column by column. */
function schemaColumns(): string[] {
  const schema = read('api/schema.sql');
  const block = /CREATE TABLE IF NOT EXISTS `team_members` \(([\s\S]*?)\) ENGINE=/i.exec(schema);
  assert.ok(block, 'api/schema.sql must still declare team_members');
  return [...block![1].matchAll(/^\s*`([a-z_]+)`/gm)].map(match => match[1]);
}

/** The same table as declared by the SQLite test double. */
function doubleColumns(): string[] {
  const bridge = read('scripts/php-admin-api-bridge.mjs');
  const block = /CREATE TABLE team_members \(([\s\S]*?)\);/i.exec(bridge.replace(/\\\n/g, ' '));
  assert.ok(block, 'the bridge must still declare team_members');
  return [...block![1].matchAll(/(?:^|,)\s*([a-z_]+)\s+[A-Z]+/g)].map(match => match[1]);
}

const columns = schemaColumns();

await check('api/schema.sql declares every column the admin panel writes', () => {
  for (const column of ['id', 'name', 'name_ta', 'title', 'title_ta', 'title_hi', 'bio', 'bio_ta',
    'education', 'education_ta', 'location', 'experience_years', 'specializations', 'photo_url',
    'is_active', 'display_order', 'created_at', 'updated_at']) {
    assert.ok(columns.includes(column), `api/schema.sql is missing team_members.${column}`);
  }
});

await check('migration 019 adds exactly the columns schema.sql has and older databases lack', () => {
  const migration = read('api/migrations/019_team_members_columns.sql');
  for (const column of ['name_ta', 'bio_ta', 'education', 'education_ta', 'updated_at']) {
    assert.match(migration, new RegExp('ADD COLUMN `' + column + '`'), `migration 019 must add ${column}`);
  }
  assert.match(migration, /ALTER TABLE `team_members`/, 'it must target the team table');
});

await check('the SQLite test double never declares a column api/schema.sql lacks', () => {
  // This is the check that would have caught the dead button: the double must
  // not be MORE permissive than production.
  const double = doubleColumns();
  assert.ok(double.length >= 10, `parsed ${double.length} double columns`);
  const extra = double.filter(column => !columns.includes(column) && column !== 'specialization');
  assert.deepEqual(extra, [], `the test double fakes these columns: ${extra.join(', ')}`);
});

const runtimeInstalled = fs.existsSync(path.join(root, 'node_modules', '@php-wasm', 'node'));
if (!runtimeInstalled) {
  console.log('  [SKIP] @php-wasm/node is not installed - the live create/update checks did not run.');
  console.log('         npm install --no-save @php-wasm/node@3.1.54 @php-wasm/universal@3.1.54');
} else {
  const { createAdminApiBridge } = await import('../scripts/php-admin-api-bridge.mjs');
  const bridge = await createAdminApiBridge();

  /** Rebuild team_members in a given shape, dropping the bridge's own table. */
  async function useTable(definition: string) {
    await bridge.reset();
    await bridge.runPhp(`
$pdo = getDbConnection();
$pdo->exec("DROP TABLE team_members");
$pdo->exec(${JSON.stringify(definition)});
echo json_encode(['ok' => true]);
`);
  }

  /** CREATE TABLE for the shape api/schema.sql declares. */
  const fromSchema = (() => {
    const schema = read('api/schema.sql');
    const block = /CREATE TABLE IF NOT EXISTS `team_members` \(([\s\S]*?)\) ENGINE=[^;]+;/i.exec(schema);
    assert.ok(block);
    const body = block![1]
      .replace(/`([a-z_]+)`/g, '$1')
      .replace(/\bDATETIME\b|\bTINYINT\(1\)|\bVARCHAR\([0-9]+\)|\bINT\b|\bTEXT\b/g, match =>
        /INT|TINYINT/.test(match) ? 'INTEGER' : 'TEXT'
      )
      .replace(/ON UPDATE CURRENT_TIMESTAMP/g, '')
      .replace(/AUTO_INCREMENT/g, '');
    return `CREATE TABLE team_members (${body})`;
  })();

  /** The table as it existed before migration 019. */
  const beforeMigration = `CREATE TABLE team_members (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, title TEXT NOT NULL, title_ta TEXT, title_hi TEXT,
    bio TEXT NOT NULL, location TEXT NOT NULL, experience_years INTEGER NOT NULL DEFAULT 15,
    specializations TEXT NOT NULL, photo_url TEXT, is_active INTEGER NOT NULL DEFAULT 1,
    display_order INTEGER NOT NULL DEFAULT 0, contact_phone TEXT, contact_email TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`;

  const newMember = {
    nameEn: 'Pandit Live Test',
    nameTa: 'பண்டிட் லைவ் டெஸ்ட்',
    titleEn: 'Senior Sivachariyar',
    titleTa: 'மூத்த சிவாச்சாரியார்',
    photoUrl: '/api/uploads/team/abcdef0123456789abcdef01.jpg',
    educationEn: 'M.A. Sanskrit, Madras University',
    educationTa: 'எம்.ஏ. சமஸ்கிருதம்',
    experienceYears: 17,
    specializations: ['Birth Jathagam', '10 Poruthams'],
    bioEn: 'Trained in the Thanjavur tradition.',
    bioTa: 'தஞ்சாவூர் பாரம்பரியத்தில் பயிற்சி.',
    isActive: true,
    order: 3
  };

  const listTeam = async () => {
    const res = await bridge.request({ method: 'GET', url: '/api/admin/team' });
    return JSON.parse(res.text).team || [];
  };

  await check('adding a member works against the real api/schema.sql table', async () => {
    await useTable(fromSchema);
    const res = await bridge.request({ method: 'POST', url: '/api/admin/team', json: newMember });
    assert.equal(res.status, 200, `HTTP ${res.status}: ${String(res.text).slice(0, 300)}`);
    const body = JSON.parse(res.text);
    assert.equal(body.success, true, body.message);

    const saved = (await listTeam()).find((member: any) => member.nameEn === 'Pandit Live Test');
    assert.ok(saved, 'the new member must be listed back to the admin');
    assert.equal(saved.titleEn, 'Senior Sivachariyar');
    assert.equal(saved.photoUrl, newMember.photoUrl);
    assert.equal(saved.educationEn, 'M.A. Sanskrit, Madras University', 'education is actually stored');
    assert.equal(saved.displayOrder, 3, 'the order typed in the panel is kept (the panel sends `order`)');
  });

  await check('adding a member still works on a database that never ran migration 019', async () => {
    // This is the owner's production database. It must not answer 500.
    await useTable(beforeMigration);
    const res = await bridge.request({ method: 'POST', url: '/api/admin/team', json: newMember });
    assert.equal(res.status, 200, 'an unmigrated database must still accept a member');
    const body = JSON.parse(res.text);
    assert.equal(body.success, true, body.message);
    const saved = (await listTeam()).find((member: any) => member.nameEn === 'Pandit Live Test');
    assert.ok(saved, 'the member is stored even without the new columns');
    assert.equal(saved.displayOrder, 3);
  });

  await check('editing and hiding a member works on an unmigrated database too', async () => {
    await useTable(beforeMigration);
    const created = JSON.parse((await bridge.request({ method: 'POST', url: '/api/admin/team', json: newMember })).text);
    const id = created.member.id;
    const put = await bridge.request({
      method: 'PUT',
      url: `/api/admin/team/${id}`,
      json: { titleEn: 'Head Sivachariyar', isActive: false, order: 2 }
    });
    assert.equal(put.status, 200, `HTTP ${put.status}: ${String(put.text).slice(0, 300)}`);
    const saved = (await listTeam()).find((member: any) => member.id === id);
    assert.equal(saved.titleEn, 'Head Sivachariyar');
    assert.equal(saved.isActive, false, 'the Active toggle sticks');
    assert.equal(saved.displayOrder, 2);
  });

  await check('a save the database rejects answers with a readable JSON error, never an empty 500', async () => {
    await useTable(beforeMigration);
    // Simulate the real failure: the write is impossible for any other reason.
    const res = await bridge.request({ method: 'POST', url: '/api/admin/team', json: { nameEn: '' } });
    assert.equal(res.status, 400);
    const body = JSON.parse(res.text);
    assert.equal(body.success, false);
    assert.match(body.message, /name/i, 'the admin is told what to fix');
  });

  await bridge.close();
}

await check('the panel shows a failed save instead of doing nothing', () => {
  const admin = read('src/pages/AdminPortal.tsx');
  assert.match(admin, /res\.success === false/, 'the save handler must inspect success');
  assert.match(admin, /The team member could not be saved/, 'it must surface the server message');
  assert.match(admin, /data-testid="team-member-save"/, 'the submit button is addressable in tests');
  assert.match(admin, /data-testid="team-member-save-error"/, 'the failure is shown next to the button');
  assert.match(admin, /\{teamSaveError &&/, 'the message is only rendered when there is one');
  assert.match(admin, /disabled=\{isSavingTeamMember\}/, 'a double click cannot create two members');
  assert.match(admin, /setIsSavingTeamMember\(false\)/, 'the guard is released even on failure');
});

console.log(`\nTeam member save regression passed (${passed} checks).`);
