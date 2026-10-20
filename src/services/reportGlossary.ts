/**
 * PLAIN-LANGUAGE GLOSSARY — one source of truth for every report.
 *
 * WHY THIS EXISTS (owner request, Oct 2026): "no glossary anywhere — 30 terms
 * used, none explained". The reports are accurate but they assume the reader
 * already knows Jyotisha vocabulary. This module turns the wording in
 * `api/astrology/report_glossary.json` into:
 *
 *   1. `reportGlossaryEntries(kind, lang)` — the terms a given report actually
 *      uses, with a ONE-LINE meaning in English, Tamil or Hindi;
 *   2. `reportGlossaryHtml(kind, lang)` — the "Report guide & glossary" block a
 *      report appends as its last page;
 *   3. `inlineGloss(key, lang)` — the same meaning in a compact parenthesis, for
 *      the first use of a term inside running prose.
 *
 * The PHP renderer (admin preview, customer preview, emailed PDF) reads the same
 * JSON through `astro_report_glossary()`, so the printed PDF and the browser
 * preview can never explain a term differently.
 *
 * RULES FOR EDITING THE JSON
 *   • one line per meaning, ideally <= 90 characters of English;
 *   • no term without all three languages;
 *   • a meaning explains the word in everyday language — never another jargon
 *     word ("the lord of the bhava" is not an explanation).
 */
import glossaryData from '../../api/astrology/report_glossary.json';
import type { AppLanguage } from '../lib/astrology/types';

export type ReportKind = 'BIRTH_JATHAGAM' | 'MARRIAGE_COMPATIBILITY' | 'BABY_NAMING' | 'MUHURTHAM';

export interface GlossaryEntry {
  /** Stable key in report_glossary.json — never shown to a customer. */
  key: string;
  /** The word as it appears in the report, with its plain alias. */
  label: string;
  /** ONE line that explains the word in everyday language. */
  meaning: string;
}

const DATA = glossaryData as unknown as {
  terms: Record<string, Record<AppLanguage, { label?: string; meaning?: string }>>;
  reportTerms: Record<ReportKind, string[]>;
  quickTerms?: Record<ReportKind, string[]>;
};

/** Every term in the glossary (used by the web glossary page and tests). */
export const GLOSSARY_TERM_KEYS: string[] = Object.keys(DATA.terms || {});

/** Which terms each report uses, in reading order. */
export const REPORT_GLOSSARY_KEYS: Record<ReportKind, string[]> = DATA.reportTerms;

export function glossaryEntry(key: string, lang: AppLanguage): GlossaryEntry | null {
  const row = (DATA.terms || {})[key];
  const copy = row ? row[lang] || row.en : null;
  if (!copy || !copy.label || !copy.meaning) return null;
  return { key, label: copy.label, meaning: copy.meaning };
}

/** The entries for one report, in the order the JSON lists them. */
export function reportGlossaryEntries(kind: ReportKind, lang: AppLanguage): GlossaryEntry[] {
  const keys = REPORT_GLOSSARY_KEYS[kind] || [];
  const entries: GlossaryEntry[] = [];
  for (const key of keys) {
    const entry = glossaryEntry(key, lang);
    if (entry) entries.push(entry);
  }
  return entries;
}

/**
 * The five words a reader meets first, for the "5 words you'll meet" box.
 * They are a subset of REPORT_GLOSSARY_KEYS — same wording, so the box and the
 * full page can never disagree — and they are chosen for the terms that stop a
 * first-time reader fastest (Lagna, Rasi, Nakshatra, Bhava, Neecha for the
 * Jathagam; Porutham, Rajju, Gana, Kuja dosha, Yoni for marriage; …).
 */
export function reportGlossaryQuickEntries(kind: ReportKind, lang: AppLanguage): GlossaryEntry[] {
  const keys = (DATA.quickTerms || {})[kind] || [];
  const entries: GlossaryEntry[] = [];
  for (const key of keys) {
    const entry = glossaryEntry(key, lang);
    if (entry) entries.push(entry);
  }
  return entries;
}

/**
 * The compact box printed where the reader first meets the words — page 1 of
 * the Birth Jathagam, and the top of every Report Guide sheet. Each row is the
 * term plus its one-line meaning, so the box is a self-contained answer and not
 * just a table of contents.
 */
export function reportGlossaryQuickHtml(kind: ReportKind, lang: AppLanguage): string {
  const entries = reportGlossaryQuickEntries(kind, lang);
  const text = QUICK_BOX_TEXT[lang];
  if (!entries.length) return '';
  const rows = entries.map(entry => `
        <div class="glossary-quick-row">
          <span class="glossary-quick-term">${escapeHtml(entry.label)}</span>
          <span class="glossary-quick-meaning">${escapeHtml(entry.meaning)}</span>
        </div>`).join('');
  return `
    <div class="glossary-quick">
      <div class="glossary-quick-title">${escapeHtml(text.title)}</div>${rows}
      <div class="glossary-quick-more">${escapeHtml(text.more)}</div>
    </div>`;
}

/**
 * `inlineGloss('neecha', 'en')` -> "debilitated — a planet in its weakest sign…"
 * Used where a term appears in running prose for the first time.
 */
export function inlineGloss(key: string, lang: AppLanguage): string {
  const entry = glossaryEntry(key, lang);
  return entry ? `${entry.label} — ${entry.meaning}` : '';
}

/** Wording of the compact box; the meanings themselves come from the JSON. */
export const QUICK_BOX_TEXT: Record<AppLanguage, { title: string; more: string }> = {
  en: {
    title: '5 words you will meet in this report',
    more: 'All the other words are explained in one line on the last page (Report Guide & Glossary).'
  },
  ta: {
    title: 'இந்த அறிக்கையில் சந்திக்கும் 5 சொற்கள்',
    more: 'மற்ற அனைத்துச் சொற்களும் கடைசிப் பக்கத்தில் ஒரு வரியில் விளக்கப்பட்டுள்ளன (அறிக்கை வழிகாட்டி & சொல் விளக்கம்).'
  },
  hi: {
    title: 'इस रिपोर्ट में मिलने वाले 5 शब्द',
    more: 'बाकी सभी शब्द अंतिम पृष्ठ पर एक पंक्ति में समझाए गए हैं (रिपोर्ट मार्गदर्शिका एवं शब्दार्थ)।'
  }
};

export const GLOSSARY_PAGE_TEXT: Record<AppLanguage, {
  /** Page title and its one-line invitation to read it. */
  title: string;
  intro: string;
  /** Closing reassurance, so the page never reads as homework. */
  note: string;
  /** The pointer printed on page 1 of the report. */
  pointer: string;
}> = {
  en: {
    title: 'Report Guide & Glossary',
    intro: 'Every technical word used in this report, explained in one line. Read this page once and the whole report becomes clear.',
    note: 'Nothing here is a prediction of doom. These words describe tendencies and timings; the reports always state a caution together with what to do about it.',
    pointer: 'New to these words? Every term is explained in one line on the last page (Report Guide & Glossary).'
  },
  ta: {
    title: 'அறிக்கை வழிகாட்டி & சொல் விளக்கம்',
    intro: 'இந்த அறிக்கையில் பயன்படுத்தப்பட்ட ஒவ்வொரு தொழில்நுட்பச் சொல்லும் ஒரு வரியில் விளக்கப்பட்டுள்ளது. இந்தப் பக்கத்தை ஒருமுறை படித்தால் முழு அறிக்கையும் தெளிவாகும்.',
    note: 'இங்கு எதுவும் தீங்கான முன்னறிவிப்பு அல்ல. இவை போக்குகளையும் காலங்களையும் குறிக்கும்; ஒவ்வொரு கவனத்திற்கும் என்ன செய்ய வேண்டும் என்பதும் அறிக்கையில் தரப்படுகிறது.',
    pointer: 'இந்தச் சொற்கள் புதியதா? ஒவ்வொரு சொல்லும் கடைசிப் பக்கத்தில் ஒரு வரியில் விளக்கப்பட்டுள்ளது (அறிக்கை வழிகாட்டி & சொல் விளக்கம்).'
  },
  hi: {
    title: 'रिपोर्ट मार्गदर्शिका एवं शब्दार्थ',
    intro: 'इस रिपोर्ट में प्रयुक्त हर तकनीकी शब्द एक पंक्ति में समझाया गया है। यह पृष्ठ एक बार पढ़ लें, पूरी रिपोर्ट स्पष्ट हो जाएगी।',
    note: 'यहाँ कुछ भी अशुभ भविष्यवाणी नहीं है। ये शब्द प्रवृत्तियाँ और समय बताते हैं; हर सावधानी के साथ यह भी बताया जाता है कि क्या करना है।',
    pointer: 'ये शब्द नए हैं? हर शब्द अंतिम पृष्ठ पर एक पंक्ति में समझाया गया है (रिपोर्ट मार्गदर्शिका एवं शब्दार्थ)।'
  }
};

const escapeHtml = (value: string): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

/**
 * The glossary block itself: heading, two-column list of term + one-line
 * meaning, and the closing note. Callers drop this inside their own page shell
 * (header + footer), so each report keeps its own branding and page numbering.
 */
export function reportGlossaryHtml(
  kind: ReportKind,
  lang: AppLanguage,
  options: { includeQuick?: boolean } = {}
): string {
  const entries = reportGlossaryEntries(kind, lang);
  const text = GLOSSARY_PAGE_TEXT[lang];
  if (!entries.length) return '';
  // The Birth Jathagam prints the quick box on page 1, so its guide sheet skips
  // it; every other report opens its guide with it.
  const quick = options.includeQuick === false ? '' : reportGlossaryQuickHtml(kind, lang);
  const items = entries.map(entry => `
      <div class="glossary-item">
        <div class="glossary-term">${escapeHtml(entry.label)}</div>
        <div class="glossary-meaning">${escapeHtml(entry.meaning)}</div>
      </div>`).join('');
  return `
    <div class="glossary-head">
      <h2 class="glossary-title">${escapeHtml(text.title)}</h2>
      <p class="glossary-intro">${escapeHtml(text.intro)}</p>
    </div>
    ${quick}
    <div class="glossary-grid">${items}
    </div>
    <p class="glossary-note">${escapeHtml(text.note)}</p>`;
}

/**
 * Print CSS shared by every report that appends the glossary page. Two columns
 * keep ~25 terms inside one A4 sheet; `break-inside: avoid` stops a term being
 * split across the two columns (or across the page break after it).
 */
export const REPORT_GLOSSARY_CSS = `
  .glossary-head { margin-bottom: 3mm; }
  .glossary-title {
    font-size: 13px;
    font-weight: 800;
    color: var(--maroon, #881337);
    margin: 0 0 1mm;
    letter-spacing: 0.2px;
  }
  .glossary-intro {
    font-size: 10px;
    line-height: 1.35;
    color: var(--ink-light, #334155);
    margin: 0;
  }
  .glossary-grid {
    column-count: 2;
    column-gap: 7mm;
    column-rule: 1px dotted var(--gold, #b45309);
  }
  .glossary-item {
    break-inside: avoid;
    page-break-inside: avoid;
    margin: 0 0 2.4mm;
  }
  .glossary-term {
    font-size: 10.5px;
    font-weight: 800;
    color: var(--maroon, #881337);
    line-height: 1.25;
  }
  .glossary-meaning {
    font-size: 9.5px;
    line-height: 1.35;
    color: var(--ink, #0f172a);
  }
  .glossary-note {
    font-size: 9.5px;
    line-height: 1.35;
    color: var(--ink-muted, #64748b);
    border-top: 1px dotted var(--gold, #b45309);
    padding-top: 1.6mm;
    margin: 2mm 0 0;
  }
  /* "5 words you'll meet" — a self-contained answer box, not a teaser. */
  .glossary-quick {
    border: 1px solid var(--slate-border, #e2e8f0);
    border-left: 3px solid var(--gold, #b45309);
    background: #fffdf7;
    border-radius: 4px;
    padding: 1.6mm 2.6mm 1.4mm;
    margin: 1.6mm 0 2mm;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .glossary-quick-title {
    font-size: 10px;
    font-weight: 800;
    color: var(--maroon, #881337);
    margin-bottom: 1mm;
    letter-spacing: 0.2px;
  }
  .glossary-quick-row {
    font-size: 9.5px;
    line-height: 1.32;
    color: var(--ink, #0f172a);
    margin: 0 0 0.7mm;
  }
  .glossary-quick-term {
    font-weight: 800;
    color: var(--maroon, #881337);
  }
  .glossary-quick-meaning { color: var(--ink-light, #334155); }
  .glossary-quick-more {
    font-size: 8.5px;
    line-height: 1.3;
    color: var(--ink-muted, #64748b);
    border-top: 1px dotted var(--gold, #b45309);
    padding-top: 0.8mm;
    margin-top: 0.6mm;
  }
  .glossary-pointer {
    font-size: 9px;
    line-height: 1.3;
    color: var(--ink-muted, #64748b);
    margin: 1.4mm 0 0;
  }
`;
