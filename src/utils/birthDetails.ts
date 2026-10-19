/** Shared, conservative validation for the personal details used in astrology forms. */
import {
  estimateTimezoneOffset,
  type LocationData
} from '../data/worldwideLocations';
import {
  getCurrentTimezoneOffset,
  getTimeZoneIdForCoordinates
} from '../lib/timezone';
import {
  isValidBirthDate,
  parseFlexibleDob,
  parseFlexibleTob,
  splitIsoDate,
  toIsoDate,
  type TobPeriod
} from './dateTimeInput';

/**
 * Keep names readable without restricting scripts or cultural punctuation.
 * Accents, initials, apostrophes, hyphens, and non-Latin names are preserved.
 */
export const normalizePersonName = (value: string): string =>
  String(value ?? '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/\s+/gu, ' ')
    .trim();

/** Returns a canonical YYYY-MM-DD value or an empty string for invalid dates. */
export const normalizeBirthDate = (value: string): string => parseFlexibleDob(value, true);

/**
 * Birth profiles created by older versions may contain either 24-hour time or
 * a 12-hour value with AM/PM. Prefer an unambiguous 24-hour value when present.
 */
export const normalizeBirthTime = (value: string, fallbackPeriod: TobPeriod = 'AM'): string => {
  const trimmed = String(value ?? '').trim();
  if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) return trimmed;
  return parseFlexibleTob(trimmed, fallbackPeriod, { allowHourOnly: true })?.tob24 || '';
};

export const isValidIsoBirthDate = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return isValidBirthDate(year, month, day) && toIsoDate(year, month, day) === value;
};

export const isValidBirthTime = (value: string): boolean =>
  /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || '');

/** A location must be selected and include finite, in-range coordinates/offset. */
export const isVerifiedBirthLocation = (
  location?: LocationData | null
): location is LocationData => Boolean(
  location &&
  typeof location.placeName === 'string' && location.placeName.trim() &&
  Number.isFinite(location.latitude) && Math.abs(location.latitude) <= 90 &&
  Number.isFinite(location.longitude) && Math.abs(location.longitude) <= 180 &&
  Number.isFinite(location.timezoneOffsetHours) && Math.abs(location.timezoneOffsetHours) <= 14
);

export const locationFromBirthProfile = (profile?: {
  birthPlace?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezoneOffsetHours?: number | null;
  timeZoneId?: string | null;
} | null): LocationData | null => {
  if (!profile?.birthPlace?.trim()) return null;
  const lat = profile.latitude == null ? Number.NaN : Number(profile.latitude);
  const lng = profile.longitude == null ? Number.NaN : Number(profile.longitude);
  let tzOffset = profile.timezoneOffsetHours == null ? Number.NaN : Number(profile.timezoneOffsetHours);
  let tzId = profile.timeZoneId || undefined;

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    if (!tzId) {
      tzId = getTimeZoneIdForCoordinates(lat, lng) || undefined;
    }
    if (!Number.isFinite(tzOffset)) {
      if (tzId) {
        const cur = getCurrentTimezoneOffset(tzId);
        if (cur !== null && Number.isFinite(cur)) tzOffset = cur;
      }
      if (!Number.isFinite(tzOffset)) {
        tzOffset = estimateTimezoneOffset(lat, lng, profile.country || '');
      }
    }
  }

  const location: LocationData = {
    placeName: profile.birthPlace.trim(),
    country: profile.country || '',
    latitude: lat,
    longitude: lng,
    timezoneOffsetHours: tzOffset,
    timeZoneId: tzId
  };
  return isVerifiedBirthLocation(location) ? location : null;
};

/* ------------------------------------------------------------------------ */
/* Saved people: the account holder + saved family members.                  */
/*                                                                           */
/* Order forms start BLANK. A saved person is only ever filled into a form   */
/* when the customer explicitly picks them (SavedPersonPicker), so an order  */
/* for a child can never silently reuse — or overwrite — the holder's own    */
/* birth details.                                                            */
/* ------------------------------------------------------------------------ */

export type SavedPersonSource = 'self' | 'family';

export interface SavedPerson {
  /** Stable picker key: 'self' or the family member id. */
  key: string;
  source: SavedPersonSource;
  /** Family member id (empty for the account holder). */
  id: string;
  name: string;
  /** Relation value for family members ('SPOUSE', …); 'SELF' for the holder. */
  relation: string;
  /** Relation label for family members ('Spouse', 'Son', …); 'Myself' for self. */
  relationLabel: string;
  dob: string;
  tob: string;
  birthPlace: string;
  country: string;
  latitude: number;
  longitude: number;
  timezoneOffsetHours: number;
  timeZoneId?: string;
  gender: 'M' | 'F';
}

export const FAMILY_RELATION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'SPOUSE', label: 'Spouse' },
  { value: 'SON', label: 'Son' },
  { value: 'DAUGHTER', label: 'Daughter' },
  { value: 'FATHER', label: 'Father' },
  { value: 'MOTHER', label: 'Mother' },
  { value: 'BROTHER', label: 'Brother' },
  { value: 'SISTER', label: 'Sister' },
  { value: 'CHILD', label: 'Child' },
  { value: 'RELATIVE', label: 'Relative' },
  { value: 'FRIEND', label: 'Friend' },
  { value: 'OTHER', label: 'Other' }
];

export const familyRelationLabel = (relation?: string | null): string =>
  FAMILY_RELATION_OPTIONS.find(option => option.value === String(relation || '').toUpperCase())?.label || 'Family';

interface SavedPersonLike {
  name?: string | null;
  dob?: string | null;
  tob?: string | null;
  birthPlace?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezoneOffsetHours?: number | null;
  timeZoneId?: string | null;
  gender?: string | null;
}

const toSavedPerson = (
  key: string,
  source: SavedPersonSource,
  id: string,
  relation: string,
  relationLabel: string,
  person: SavedPersonLike
): SavedPerson => ({
  key,
  source,
  id,
  relation,
  name: normalizePersonName(String(person.name ?? '')),
  relationLabel,
  dob: normalizeBirthDate(String(person.dob ?? '')),
  tob: normalizeBirthTime(String(person.tob ?? '')),
  birthPlace: String(person.birthPlace ?? '').trim(),
  country: String(person.country ?? ''),
  latitude: Number(person.latitude),
  longitude: Number(person.longitude),
  timezoneOffsetHours: Number(person.timezoneOffsetHours),
  timeZoneId: person.timeZoneId || undefined,
  gender: person.gender === 'F' ? 'F' : 'M'
});

/** The account holder as a pickable saved person, or null when unsaved. */
export const selfAsSavedPerson = (profile?: SavedPersonLike | null): SavedPerson | null =>
  profile && String(profile.birthPlace ?? '').trim()
    ? toSavedPerson('self', 'self', '', 'SELF', 'Myself', profile)
    : null;

/** A saved family member as a pickable saved person. */
export const familyMemberAsSavedPerson = (member: SavedPersonLike & { id: string; relation?: string | null }): SavedPerson =>
  toSavedPerson(
    member.id,
    'family',
    member.id,
    String(member.relation || 'OTHER').toUpperCase(),
    familyRelationLabel(member.relation),
    member
  );

/** Everyone an order form may offer: the holder first, then family members. */
export const buildSavedPeople = (
  profile: SavedPersonLike | null | undefined,
  members: Array<SavedPersonLike & { id: string; relation?: string | null }>
): SavedPerson[] => {
  const people: SavedPerson[] = [];
  const self = selfAsSavedPerson(profile);
  if (self) people.push(self);
  for (const member of members || []) people.push(familyMemberAsSavedPerson(member));
  return people;
};

/** LocationData for a picked saved person (verified the same way as profiles). */
export const locationFromSavedPerson = (person?: SavedPerson | null): LocationData | null =>
  person ? locationFromBirthProfile(person) : null;

/* Dashboard → order page hand-off: "Order for <name>" in the dashboard is an
 * explicit customer choice, so the destination form may start with that one
 * person picked. A plain visit (no hand-off) always starts blank. */
const ORDER_FOR_STORAGE_KEY = 'astrosivam.orderFor';

export const setPendingOrderFor = (personKey: string): void => {
  try {
    sessionStorage.setItem(ORDER_FOR_STORAGE_KEY, personKey);
  } catch {
    /* private mode: the form simply starts blank */
  }
};

export const consumePendingOrderFor = (): string => {
  try {
    const key = sessionStorage.getItem(ORDER_FOR_STORAGE_KEY) || '';
    sessionStorage.removeItem(ORDER_FOR_STORAGE_KEY);
    return key;
  } catch {
    return '';
  }
};

/** Normalize a YYYY-MM-DD profile value without letting malformed input through. */
export const normalizeIsoBirthDate = (value: string): string => {
  const normalized = normalizeBirthDate(value);
  if (!normalized) return '';
  const { year, month, day } = splitIsoDate(normalized);
  return isValidBirthDate(Number(year), Number(month), Number(day)) ? normalized : '';
};
