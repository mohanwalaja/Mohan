#!/usr/bin/env node
/**
 * Builds the Namakaran (baby naming) name bank for BOTH report engines from the
 * single human-editable source of truth: data/namakaran_name_bank.psv
 *
 *   node scripts/build_namakaran_bank.mjs            # validate + regenerate
 *   node scripts/build_namakaran_bank.mjs --check    # validate only (CI / tests)
 *
 * Outputs:
 *   src/lib/astrology/namakaranNameBank.ts        (browser preview + browser-side TypeScript)
 *   api/astrology/namakaran_name_bank.php        (official PHP report HTML)
 *
 * The two generated files carry the same content hash, so a test can prove the
 * live preview and the delivered report always show the same names.
 *
 * ---------------------------------------------------------------------------
 * WHY EVERY NAME IS STORED IN THREE SCRIPTS
 *   The earlier bank stored a Roman spelling only and transliterated it at
 *   print time. Machine transliteration cannot know that "Suthanthira" is
 *   சுதந்திரா and "Sunil" is சுனில், so Tamil pages carried misspelt names
 *   (சுதந்த்ஹிர, சுநில்). Each row now carries the hand-written Tamil and Hindi
 *   spelling of the name, and the generator refuses a row whose Tamil spelling
 *   does not open with the exact pada letter of column 1.
 *
 * VALIDATION RULES
 *   - column 1 is one of the pada letters printed by babynames.ts
 *   - column 4 is the Roman name (plain ASCII letters)
 *   - column 5 is Tamil script only and opens with column 1 (see tamilPadaCore)
 *   - column 6 is Devanagari only
 *   - column 7 is a short English meaning covered by the meaning glossary
 *   - no duplicate Roman or Tamil spelling inside one akshara + gender + style
 * ---------------------------------------------------------------------------
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TSV_PATH = resolve(ROOT, 'data', 'namakaran_name_bank.psv');
const OUT_TS = resolve(ROOT, 'src', 'lib', 'astrology', 'namakaranNameBank.ts');
const OUT_PHP = resolve(ROOT, 'api', 'astrology', 'namakaran_name_bank.php');

const MAX_PER_SIDE = 8;
const MAX_MEANING_LENGTH = 30;

const PULLI = '\u0BCD';
const LATIN = /[A-Za-z]/;
const TAMIL_ONLY = /^[\u0B80-\u0BFF .'-]+$/u;
const HINDI_ONLY = /^[\u0900-\u097F .'-]+$/u;

/** The Tamil pada letter a written name opens with (mirrors namakaranSound.ts). */
export function tamilPadaCore(text) {
  const value = String(text || '').normalize('NFC').trim();
  const head = /^([\u0B85-\u0BB9])([\u0BBE-\u0BCD\u0BD7]?)/u.exec(value);
  if (!head) return '';
  const letter = head[1];
  const sign = head[2] || '';
  if (sign !== PULLI) return letter + sign;

  let rest = value.slice(head[0].length);
  for (let guard = 0; guard < 4; guard += 1) {
    const next = /^([\u0B95-\u0BB9])([\u0BBE-\u0BCD\u0BD7]?)/u.exec(rest);
    if (!next) return letter;
    if ((next[2] || '') !== PULLI) return letter + (next[2] || '');
    rest = rest.slice(next[0].length);
  }
  return letter;
}

// ---------------------------------------------------------------------------
// 1. Read the canonical 108-pada table straight out of babynames.ts so the two
//    can never drift apart.
// ---------------------------------------------------------------------------
function readPadaTable() {
  const src = readFileSync(resolve(ROOT, 'src', 'lib', 'astrology', 'babynames.ts'), 'utf8');
  const blocks = [...src.matchAll(/nakshatraIndex:\s*(\d+),([\s\S]*?)(?=\n  \{\n    nakshatraIndex:|\n\](?:;|\.map))/g)];
  const padas = [];
  for (const [, index, body] of blocks) {
    const padaRe = /\{ padaNumber: (\d+), letterTa: '([^']*)', letterEn: '([^']*)', letterHi: '([^']*)'/g;
    for (const [, padaNumber, letterTa, letterEn, letterHi] of body.matchAll(padaRe)) {
      padas.push({
        nakshatraIndex: Number(index),
        padaNumber: Number(padaNumber),
        letterTa,
        letterEn,
        letterHi
      });
    }
  }
  if (padas.length !== 108) {
    throw new Error(`Expected the canonical 108-pada table, found ${padas.length} entries.`);
  }
  return padas;
}

// ---------------------------------------------------------------------------
// 2. Parse the TSV.
// ---------------------------------------------------------------------------
function readTsv() {
  const lines = readFileSync(TSV_PATH, 'utf8').split(/\r?\n/);
  const rows = [];
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const cells = line.split('|').map(c => c.trim());
    if (cells.length !== 7) {
      rows.push({ line: idx + 1, error: `expected 7 pipe-separated columns, found ${cells.length}` });
      return;
    }
    const [akshara, gender, style, name, tamil, hindi, meaning] = cells;
    rows.push({ line: idx + 1, akshara, gender, style, name, tamil, hindi, meaning });
  });
  return rows;
}

// ---------------------------------------------------------------------------
// 3. Validate.
// ---------------------------------------------------------------------------
function validate(rows, padaTable) {
  const problems = [];
  const knownAksharas = new Set(padaTable.map(p => p.letterTa));
  const seenEn = new Map();
  const seenTa = new Map();

  for (const row of rows) {
    if (row.error) {
      problems.push(`line ${row.line}: ${row.error}`);
      continue;
    }
    const { akshara, gender, style, name, tamil, hindi, meaning } = row;
    if (!knownAksharas.has(akshara)) {
      problems.push(`line ${row.line}: unknown akshara "${akshara}" (not one of the 108 pada letters)`);
      continue;
    }
    if (!['M', 'F'].includes(gender)) problems.push(`line ${row.line}: gender must be M or F (found "${gender}")`);
    if (!['S', 'N'].includes(style)) problems.push(`line ${row.line}: style must be S or N (found "${style}")`);

    if (!name || !/^[A-Za-z][A-Za-z .'-]*$/.test(name)) {
      problems.push(`line ${row.line}: Roman name "${name}" must be plain Roman letters`);
    }
    if (!tamil) {
      problems.push(`line ${row.line}: missing Tamil spelling`);
    } else {
      if (LATIN.test(tamil)) problems.push(`line ${row.line}: Tamil spelling "${tamil}" carries Latin letters`);
      if (!TAMIL_ONLY.test(tamil)) problems.push(`line ${row.line}: Tamil spelling "${tamil}" has characters outside Tamil script`);
      const expected = tamilPadaCore(akshara);
      const actual = tamilPadaCore(tamil);
      if (actual !== expected) {
        problems.push(`line ${row.line}: Tamil spelling "${tamil}" starts with ${actual || 'nothing'}, but ${akshara} needs ${expected}`);
      }
    }
    if (!hindi) {
      problems.push(`line ${row.line}: missing Hindi spelling`);
    } else {
      if (LATIN.test(hindi)) problems.push(`line ${row.line}: Hindi spelling "${hindi}" carries Latin letters`);
      if (!HINDI_ONLY.test(hindi)) problems.push(`line ${row.line}: Hindi spelling "${hindi}" has characters outside Devanagari`);
    }
    if (!meaning) {
      problems.push(`line ${row.line}: missing meaning`);
    } else if (meaning.length > MAX_MEANING_LENGTH) {
      problems.push(`line ${row.line}: meaning "${meaning}" is ${meaning.length} chars (max ${MAX_MEANING_LENGTH})`);
    } else if (LATIN.test(meaning) === false) {
      problems.push(`line ${row.line}: meaning "${meaning}" must be English text`);
    }

    const keyEn = `${akshara}|${gender}|${style}|${name.toLowerCase()}`;
    if (seenEn.has(keyEn)) {
      problems.push(`line ${row.line}: duplicate name "${name}" for ${akshara} ${gender} ${style} (first seen on line ${seenEn.get(keyEn)})`);
    } else {
      seenEn.set(keyEn, row.line);
    }
    const keyTa = `${akshara}|${gender}|${style}|${tamil}`;
    if (seenTa.has(keyTa)) {
      problems.push(`line ${row.line}: duplicate Tamil spelling "${tamil}" for ${akshara} ${gender} ${style} (first seen on line ${seenTa.get(keyTa)})`);
    } else {
      seenTa.set(keyTa, row.line);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// 4. Build the nested bank.
// ---------------------------------------------------------------------------
function buildBank(rows) {
  const bank = {};
  for (const row of rows) {
    if (row.error) continue;
    const { akshara, gender, style, name, tamil, hindi, meaning } = row;
    const ak = (bank[akshara] = bank[akshara] || {
      M: { south: [], north: [] },
      F: { south: [], north: [] }
    });
    const list = style === 'S' ? ak[gender].south : ak[gender].north;
    list.push({ n: name, t: tamil, h: hindi, m: meaning });
  }
  return bank;
}

// ---------------------------------------------------------------------------
// 5. Emit both files.
// ---------------------------------------------------------------------------
function writeTs(bank, hash, aksharaOrder) {
  const entries = aksharaOrder
    .filter(ak => bank[ak])
    .map(ak => {
      const node = bank[ak];
      const side = (g, s) => `[${node[g][s]
        .map(x => `{n:${JSON.stringify(x.n)},t:${JSON.stringify(x.t)},h:${JSON.stringify(x.h)},m:${JSON.stringify(x.m)}}`)
        .join(',')}]`;
      return `  ${JSON.stringify(ak)}: { M: { south: ${side('M', 'south')}, north: ${side('M', 'north')} }, ` +
        `F: { south: ${side('F', 'south')}, north: ${side('F', 'north')} } }`;
    })
    .join(',\n');

  const content = `/**
 * AUTO-GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Source of truth : data/namakaran_name_bank.psv
 * Generator       : scripts/build_namakaran_bank.mjs
 * Content hash    : ${hash}
 *
 * The same hash is written into api/astrology/namakaran_name_bank.php so the
 * live preview, the browser-side TypeScript and the official report can be proven to
 * show an identical name bank.
 */

export const NAMAKARAN_BANK_HASH = '${hash}';

/** Page 2 of the Namakaran report shows at most this many names per side. */
export const NAMAKARAN_MAX_PER_SIDE = ${MAX_PER_SIDE};

export type NamakaranNameStyle = 'south' | 'north';
export type NamakaranGender = 'M' | 'F';

export interface NamakaranBankEntry {
  /** Name in Roman script, printed by the English report. */
  n: string;
  /** Hand-written Tamil spelling, printed by the Tamil report. */
  t: string;
  /** Hand-written Devanagari spelling, printed by the Hindi report. */
  h: string;
  /** Short English meaning (localized through the meaning glossary). */
  m: string;
}

export interface NamakaranBankColumn {
  south: NamakaranBankEntry[];
  north: NamakaranBankEntry[];
}

export interface NamakaranBankAkshara {
  M: NamakaranBankColumn;
  F: NamakaranBankColumn;
}

/**
 * Keyed by the pada akshara (Tamil) of the birth star. Aksharas that share a
 * Tamil letter share one list on purpose: Tamil does not distinguish the
 * voiced/voiceless readings (ச = cha/sa, க = ka/ga ...), so one list serves
 * every pada that prints that letter. Every Tamil spelling below opens with the
 * exact letter of its key.
 */
export const NAMAKARAN_BANK: Record<string, NamakaranBankAkshara> = {
${entries}
};
`;
  writeFileSync(OUT_TS, content);
}

function writePhp(bank, hash, aksharaOrder) {
  const phpString = (value) => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const lines = [];
  for (const ak of aksharaOrder) {
    if (!bank[ak]) continue;
    const node = bank[ak];
    const side = (g, s) =>
      `[${node[g][s].map(x => `[${phpString(x.n)}, ${phpString(x.t)}, ${phpString(x.h)}, ${phpString(x.m)}]`).join(', ')}]`;
    lines.push(
      `    ${phpString(ak)} => ['M' => ['south' => ${side('M', 'south')}, 'north' => ${side('M', 'north')}], ` +
      `'F' => ['south' => ${side('F', 'south')}, 'north' => ${side('F', 'north')}]],`
    );
  }
  const content = `<?php
/**
 * AUTO-GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Source of truth : data/namakaran_name_bank.psv
 * Generator       : scripts/build_namakaran_bank.mjs
 * Content hash    : ${hash}
 *
 * Kept byte-for-byte in step with src/lib/astrology/namakaranNameBank.ts so the
 * live preview and the official report always print the same names.
 * Each entry is [roman, tamil, hindi, meaning]; 'south' and 'north' are the two
 * columns of page 2 of the Vedic Namakaran report.
 */

return [
    'hash' => ${phpString(hash)},
    'maxPerSide' => ${MAX_PER_SIDE},
    'bank' => [
${lines.join('\n')}
    ],
];
`;
  writeFileSync(OUT_PHP, content);
}

// ---------------------------------------------------------------------------
function main() {
  const checkOnly = process.argv.includes('--check');
  const padaTable = readPadaTable();
  const rows = readTsv();
  const problems = validate(rows, padaTable);

  const usable = rows.filter(r => !r.error && ['M', 'F'].includes(r.gender) && ['S', 'N'].includes(r.style));
  const byAkshara = new Map();
  for (const row of usable) {
    const entry = byAkshara.get(row.akshara) || { M: { S: 0, N: 0 }, F: { S: 0, N: 0 } };
    entry[row.gender][row.style] += 1;
    byAkshara.set(row.akshara, entry);
  }

  const summary = [...byAkshara.entries()].map(([ak, c]) => ({
    akshara: ak,
    boysSouth: c.M.S,
    boysNorth: c.M.N,
    girlsSouth: c.F.S,
    girlsNorth: c.F.N
  }));

  if (problems.length) {
    console.error(`✖ ${problems.length} problem(s) found in data/namakaran_name_bank.psv:`);
    for (const problem of problems.slice(0, 80)) console.error(`   - ${problem}`);
    if (problems.length > 80) console.error(`   ... ${problems.length - 80} more`);
  }

  const totalNames = usable.length;
  console.log(`Namakaran bank: ${totalNames} names across ${summary.length} aksharas ` +
    `(${padaTable.length} padas covered by the report).`);
  if (problems.length) {
    console.error('Fix the data file, then re-run this generator.');
    process.exitCode = 1;
    return;
  }

  const canonical = usable
    .map(r => [r.akshara, r.gender, r.style, r.name, r.tamil, r.hindi, r.meaning].join('|'))
    .join('\n');
  const hash = createHash('sha256').update(canonical).digest('hex').slice(0, 16);

  if (checkOnly) {
    const tsCurrent = readFileSync(OUT_TS, 'utf8');
    const phpCurrent = readFileSync(OUT_PHP, 'utf8');
    const inSync = tsCurrent.includes(`NAMAKARAN_BANK_HASH = '${hash}'`) &&
      phpCurrent.includes(`'hash' => '${hash}'`);
    if (!inSync) {
      console.error('✖ Generated bank files are stale — run: node scripts/build_namakaran_bank.mjs');
      process.exitCode = 1;
    } else {
      console.log(`✓ Generated bank files are in sync (hash ${hash}).`);
    }
    return;
  }

  const bank = buildBank(usable);
  const aksharaOrder = padaTable.map(p => p.letterTa).filter((ak, i, arr) => arr.indexOf(ak) === i);
  writeTs(bank, hash, aksharaOrder);
  writePhp(bank, hash, aksharaOrder);
  console.log(`✓ Wrote src/lib/astrology/namakaranNameBank.ts and api/astrology/namakaran_name_bank.php (hash ${hash}).`);
}

main();
