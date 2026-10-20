import { AppLanguage, PoruthamStatus } from '../lib/astrology/types';

/**
 * The three marriage verdict tiers, in words a customer already uses.
 *
 * The report used to print "Utthamam", "Madhyamam" and "Incompatible" in one
 * column (and the score badge said "Utthamam (Highly Auspicious)"): one Sanskrit
 * word, one Sanskrit word and one English word, side by side. A reader who does
 * not know the Sanskrit cannot rank them, and the third row looked like it came
 * from a different table. Every tier is now a plain grading word in the order's
 * own language:
 *
 *   UTTHAMAM    -> Very Good / மிக நன்று / बहुत अच्छा
 *   MADHYAMAM   -> Good      / நன்று     / अच्छा
 *   PORUNDHADHU -> Incompatible / பொருந்தாது / मेल नहीं
 *
 * The Sanskrit names are not lost: they are explained once on the report's
 * glossary page ("Porutham", "Gana", ...), which is where the technical words
 * belong. The engine and the database keep the enum values untouched, so saved
 * orders, matching rules and the chat astrologer are unaffected.
 */
export type VerdictTier = 'UTTHAMAM' | 'MADHYAMAM' | 'PORUNDHADHU';

type TierCopy = Record<AppLanguage, string>;

/** The bare grading word — used in the porutham table's Status column. */
export const VERDICT_TIER_LABEL: Record<VerdictTier, TierCopy> = {
  UTTHAMAM: { en: 'Very Good', ta: 'மிக நன்று', hi: 'बहुत अच्छा' },
  MADHYAMAM: { en: 'Good', ta: 'நன்று', hi: 'अच्छा' },
  PORUNDHADHU: { en: 'Incompatible', ta: 'பொருந்தாது', hi: 'मेल नहीं' }
};

/**
 * The same word with its one-glance hint — used where the verdict is stated on
 * its own (the score badge and the recommendation banner), so the colour is not
 * the only thing telling the reader how good it is.
 */
export const VERDICT_TIER_HINT: Record<VerdictTier, TierCopy> = {
  UTTHAMAM: { en: 'Very Good (highly favourable)', ta: 'மிக நன்று (மிகச் சாதகம்)', hi: 'बहुत अच्छा (अत्यंत अनुकूल)' },
  MADHYAMAM: { en: 'Good (remedies may help)', ta: 'நன்று (பரிகாரங்கள் உதவும்)', hi: 'अच्छा (उपाय सहायक)' },
  PORUNDHADHU: { en: 'Incompatible', ta: 'பொருந்தாது', hi: 'मेल नहीं' }
};

/** True when the value is one of the three known tiers. */
export function isVerdictTier(value: unknown): value is VerdictTier {
  return value === 'UTTHAMAM' || value === 'MADHYAMAM' || value === 'PORUNDHADHU';
}

/** `verdictTierLabel('MADHYAMAM', 'ta')` -> "நன்று". */
export function verdictTierLabel(tier: unknown, lang: AppLanguage): string {
  return isVerdictTier(tier) ? VERDICT_TIER_LABEL[tier][lang] : 'N/A';
}

/** `verdictTierHint('UTTHAMAM', 'en')` -> "Very Good (highly favourable)". */
export function verdictTierHint(tier: unknown, lang: AppLanguage): string {
  return isVerdictTier(tier) ? VERDICT_TIER_HINT[tier][lang] : 'N/A';
}

/**
 * Reads a tier out of anything an older saved order may carry: the enum itself,
 * the legacy engine labels ("Uthama (Excellent)", "Madhyama (Good)",
 * "Porundhadhu (Not Compatible)") or the already-plain wording.
 */
export function verdictTierFrom(value: unknown): VerdictTier | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (isVerdictTier(raw.toUpperCase())) return raw.toUpperCase() as VerdictTier;
  const lower = raw.toLowerCase();
  if (/very good|utthama|uthama|uttama|excellent|highly/.test(lower)) return 'UTTHAMAM';
  if (/^good\b|madhyam|mathimam|moderate|acceptable|partial/.test(lower)) return 'MADHYAMAM';
  if (/incompatible|porundh|not compatible|not recommended|adhamam/.test(lower)) return 'PORUNDHADHU';
  return null;
}

/** Convenience: the report's tier constant, kept next to its labels. */
export const TIER_FROM_STATUS: Record<PoruthamStatus, VerdictTier> = {
  [PoruthamStatus.UTTHAMAM]: 'UTTHAMAM',
  [PoruthamStatus.MADHYAMAM]: 'MADHYAMAM',
  [PoruthamStatus.PORUNDHADHU]: 'PORUNDHADHU'
};
