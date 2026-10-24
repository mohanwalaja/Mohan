#!/usr/bin/env node
/**
 * Generate knowledge/ai-astrologer/SOURCES.md from sources.json.
 *
 * The registry is the only source of truth for IDs, titles, attribution,
 * publication details, verification and citation status. Run with --check in
 * tests, or without arguments to rewrite the Markdown bibliography.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const registryPath = path.join(projectRoot, 'knowledge/ai-astrologer/sources.json');
const outputPath = path.join(projectRoot, 'knowledge/ai-astrologer/SOURCES.md');

const statusOf = (source) => source.citationStatus ?? 'active';
const clean = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
const text = (value, fallback = 'Not established') => clean(value) || fallback;

function row(source, scopeOverride = null) {
  const native = clean(source.titleNative);
  const english = clean(source.titleEn || source.title);
  const title = native && native !== english ? `${native}<br>*${english}*` : `*${english || native}*`;
  const people = [
    source.author ? clean(source.author) : '',
    source.translator ? `Translation: ${clean(source.translator)}` : '',
    source.editor ? `Editor: ${clean(source.editor)}` : '',
  ].filter(Boolean).join('; ') || 'Not established';
  const publication = [
    source.year ? String(source.year) : 'Year not established',
    source.edition ? clean(source.edition) : '',
    source.publisher ? clean(source.publisher) : '',
  ].filter(Boolean).join(' — ');
  const scope = scopeOverride || (source.usefulFor ?? []).map(clean).filter(Boolean).slice(0, 2).join('; ')
    || clean(source.usageRestriction)
    || 'See registry verification note';
  return `| \`${clean(source.id)}\` | ${title} | ${people} | ${publication} | \`${clean(source.verification)}\` | ${scope} |`;
}

function section(lines, title, description, sources, scopeOverride = null) {
  if (!sources.length) return;
  lines.push(`## ${title}`, '', description, '',
    '| ID | Title | Author / editor | Publication evidence | Verification | Scoped use |',
    '|---|---|---|---|---|---|',
    ...sources.map((source) => row(source, scopeOverride)), '');
}

export function generateSourcesMarkdown(registry) {
  const sources = registry.sources ?? [];
  const count = (predicate) => sources.filter(predicate).length;
  const levels = Object.fromEntries(
    ['content-read', 'metadata-verified', 'catalogue-verified']
      .map((level) => [level, count((s) => s.verification === level)]),
  );
  const active = sources.filter((s) => statusOf(s) === 'active');
  const suppression = sources.filter((s) => statusOf(s) === 'suppression-only');
  const background = sources.filter((s) => statusOf(s) === 'background-only');
  const activeTamil = active.filter((s) => s.language === 'ta').length;
  const activeEnglish = active.filter((s) => s.language === 'en').length;
  const activeSanskrit = active.filter((s) => s.language === 'sa').length;

  const lines = [
    '# AI Astrologer — Verified Source Bibliography',
    '',
    '<!-- GENERATED FROM sources.json BY scripts/generate-ai-astrologer-sources.mjs; DO NOT HAND-EDIT. -->',
    '',
    `Registry totals: **${sources.length} records** — **${active.length} active references** `
      + `(${activeTamil} Tamil + ${activeEnglish} English + ${activeSanskrit} Sanskrit), **${suppression.length} suppression-only**, `
      + `and **${background.length} background-only**. Verification: **${levels['content-read']} content-read**, `
      + `**${levels['metadata-verified']} metadata-verified**, **${levels['catalogue-verified']} catalogue-verified**. `
      + `Language totals across all records: **${count((s) => s.language === 'ta')} Tamil**, `
      + `**${count((s) => s.language === 'en')} English**, **${count((s) => s.language === 'sa')} Sanskrit**.`,
    '',
    'The current expansion adds published Tamil and Sanskrit books only. New editions were admitted after '
      + 'publication evidence and targeted actual-content review. Existing non-book records remain separated '
      + 'below; they are not presented as new book additions. Content-read means that identified full-text '
      + 'passages were opened and read directly, not that every page of every book was reviewed.',
    '',
    'Customer-facing citations use active Tamil records only. Background-only records are not cited by '
      + 'rules or replies. TA-10 is a non-astrology Siddha medical book retained solely as a suppression '
      + 'boundary. Passage-level citation remains restricted by `_meta.citationPolicy` in `sources.json`.',
    '',
  ];

  section(lines, 'Active Tamil published books',
    'Published Tamil works with active, scoped citations. Bibliographic details and reviewed anchors are recorded in `sources.json`.',
    active.filter((s) => s.language === 'ta' && !['reference', 'navagraha-sthalam'].includes(s.group)));
  section(lines, 'Active English structural works',
    'Foundational English works used for internal structure and calculation cross-checks; they are not emitted as Tamil customer citations.',
    active.filter((s) => s.language === 'en' && s.group !== 'reference'));
  section(lines, 'Active Sanskrit published books',
    'Published Sanskrit and bilingual Sanskrit-English editions used for internal structural cross-checks; they are not emitted as Tamil customer citations.',
    active.filter((s) => s.language === 'sa'));
  section(lines, 'Existing Navagraha Sthalam records',
    'Pre-existing Tamil temple records. These are not new published-book additions and were not re-reviewed in this book batch.',
    active.filter((s) => s.group === 'navagraha-sthalam'),
    'Pre-existing non-book record; outside this published-book content review.');
  section(lines, 'Existing reference and access records',
    'Pre-existing access, verification or secondary-reference records. They are not new published-book additions.',
    active.filter((s) => s.group === 'reference'));
  section(lines, 'Suppression-only boundary',
    'Retained to document material that must not be used as astrology evidence or customer guidance.',
    suppression);
  section(lines, 'Background-only records',
    'Retained for audit history but excluded from rule citations and customer-facing source lines.',
    background);

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

const invokedAsScript = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const generated = generateSourcesMarkdown(registry);
  if (process.argv.includes('--check')) {
    const current = fs.readFileSync(outputPath, 'utf8');
    if (current !== generated) {
      console.error('SOURCES.md is stale. Run node scripts/generate-ai-astrologer-sources.mjs');
      process.exitCode = 1;
    } else {
      console.log('SOURCES.md matches sources.json');
    }
  } else {
    fs.writeFileSync(outputPath, generated);
    console.log(`Wrote ${path.relative(projectRoot, outputPath)} from ${registry.sources.length} registry records`);
  }
}
