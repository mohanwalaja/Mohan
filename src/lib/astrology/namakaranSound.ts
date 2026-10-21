import { transliterateToTamil } from '../../services/indicTransliteration';

const PULLI = '\u0BCD';

/** First written Tamil syllable, including its vowel sign (not just a prefix). */
export function firstTamilSound(text: string): string {
  return text.normalize('NFC').trim().match(/^[\u0B85-\u0BB9][\u0BBE-\u0BCD\u0BD7]?/u)?.[0] || '';
}

/**
 * The Tamil pada letter a written name opens with.
 *
 * A name is normally classified by its first letter plus that letter's vowel
 * sign (சு = Su, சே = Se). Tamil opens a consonant cluster with a pulli
 * (ப்ரீதி = Preethi), and that cluster belongs to the letter that carries the
 * pulli with the next letter's vowel (பீ), which is how every Tamil naming
 * table files Preethi, Priya and Prem. This function therefore returns the
 * letter + vowel a report prints for the name's first sound, so a curated name
 * can be proven to belong to its pada letter without guessing from Roman text.
 */
export function tamilPadaCore(text: string): string {
  const value = String(text || '').normalize('NFC').trim();
  const head = /^([\u0B85-\u0BB9])([\u0BBE-\u0BCD\u0BD7]?)/u.exec(value);
  if (!head) return '';
  const letter = head[1];
  const sign = head[2] || '';
  if (sign !== PULLI) return letter + sign;

  // The letter carries a pulli, so it opens a cluster: take the next consonant
  // and its vowel (ப்ரீ -> பீ). A stack of pullis keeps only the last vowel.
  let rest = value.slice(head[0].length);
  let core = letter;
  for (let guard = 0; guard < 4; guard += 1) {
    const next = /^([\u0B95-\u0BB9])([\u0BBE-\u0BCD\u0BD7]?)/u.exec(rest);
    if (!next) return core;
    if ((next[2] || '') !== PULLI) return letter + (next[2] || '');
    rest = rest.slice(next[0].length);
  }
  return core;
}

/** True when a Tamil spelling opens with the exact pada letter printed on page 1. */
export function matchesPadaCore(tamilName: string, soundTa: string): boolean {
  const core = tamilPadaCore(tamilName);
  if (!core) return false;
  return String(soundTa || '').split('/').some(sound => tamilPadaCore(sound) === core);
}

export function nameMatchesPada(name: string, soundTa: string): boolean {
  const first = firstTamilSound(transliterateToTamil(name));
  return Boolean(first && soundTa.split('/').some(sound => first === firstTamilSound(sound)));
}

export function nameFingerprint(name: string): string {
  return transliterateToTamil(name).normalize('NFC').trim().toLowerCase();
}

export function firstNameSound(name: string): string {
  return /[\u0B80-\u0BFF]/u.test(name) ? firstTamilSound(name) : (name.trim().match(/^[^aeiou]*[aeiou]/i)?.[0] || name.trim().slice(0, 1));
}
