/**
 * ASTRO SIVAM — light UI: report-preview engine.
 *
 * The laboratory runs the SAME verified astrology modules the paid reports use
 * (@shared/lib/astrology/*, @shared/lib/muhurtham/scanner) directly in the
 * browser. Nothing is faked, invented or rounded for display: the panchangam
 * values, the Lagna, the dasha lord, the porutham scores and the muhurtham
 * grades on screen are the engine's own output. Reusing that engine is the
 * whole point — a preview that disagreed with the delivered PDF would be worse
 * than no preview at all.
 *
 * All of it is client-side, so the preview works with no account, no order and
 * no network round-trip.
 */
import {
  calculatePrecisionHoroscope,
  calculatePrecisionPanchangam,
} from '@shared/lib/astrology/astronomy';
import { calculateWeddingCompatibility } from '@shared/lib/astrology/matchmaking';
import { calculateBabyNamingDetails } from '@shared/lib/astrology/babynames';
import { scanMonthMuhurtham } from '@shared/lib/muhurtham/scanner';
import type { MuhurthamEventKey } from '@shared/lib/muhurtham/scanner';
import type {
  BabyNamingResult,
  HoroscopeResult,
  PanchangamResult,
  WeddingMatchResult,
} from '@shared/lib/astrology/types';
import { getCurrentTimezoneOffset, getTimeZoneIdForCoordinates } from '@shared/lib/timezone';

export interface PreviewPlace {
  placeName: string;
  country: string;
  latitude: number;
  longitude: number;
}

/** The places the preview offers, with verified coordinates. */
export const PREVIEW_PLACES: PreviewPlace[] = [
  { placeName: 'Chennai', country: 'India', latitude: 13.0827, longitude: 80.2707 },
  { placeName: 'Madurai', country: 'India', latitude: 9.9252, longitude: 78.1198 },
  { placeName: 'Coimbatore', country: 'India', latitude: 11.0168, longitude: 76.9558 },
  { placeName: 'Colombo', country: 'Sri Lanka', latitude: 6.9271, longitude: 79.8612 },
  { placeName: 'Singapore', country: 'Singapore', latitude: 1.3521, longitude: 103.8198 },
  { placeName: 'Kuala Lumpur', country: 'Malaysia', latitude: 3.139, longitude: 101.6869 },
  { placeName: 'Dubai', country: 'United Arab Emirates', latitude: 25.2048, longitude: 55.2708 },
  { placeName: 'Sydney', country: 'Australia', latitude: -33.8688, longitude: 151.2093 },
  { placeName: 'London', country: 'United Kingdom', latitude: 51.5074, longitude: -0.1278 },
  { placeName: 'New York', country: 'United States', latitude: 40.7128, longitude: -74.006 }
];

/**
 * Today's offset in the zone that owns these coordinates — the same resolver
 * the order form uses, so the preview and a real order agree about the clock.
 */
export function offsetForPlace(place: PreviewPlace): number {
  const zoneId = getTimeZoneIdForCoordinates(place.latitude, place.longitude);
  const offset = zoneId ? getCurrentTimezoneOffset(zoneId) : null;
  return offset ?? Math.round((-place.longitude / 15) * 2) / 2;
}

export function panchangamFor(place: PreviewPlace, when: Date = new Date()): PanchangamResult {
  return calculatePrecisionPanchangam(when, place.latitude, place.longitude, place.placeName, place.country);
}

export interface ChartRequest {
  name: string;
  dob: string;
  tob: string;
  place: PreviewPlace;
  gender?: 'M' | 'F';
}

export function chartFor(request: ChartRequest): HoroscopeResult {
  const { name, dob, tob, place, gender = 'M' } = request;
  return calculatePrecisionHoroscope(
    name,
    dob,
    tob,
    place.placeName,
    place.latitude,
    place.longitude,
    offsetForPlace(place),
    place.country,
    gender,
  );
}

export function poruthamFor(bride: ChartRequest, groom: ChartRequest): WeddingMatchResult {
  return calculateWeddingCompatibility({
    bride: {
      name: bride.name,
      dob: bride.dob,
      tob: bride.tob,
      birthPlace: bride.place.placeName,
      country: bride.place.country,
      latitude: bride.place.latitude,
      longitude: bride.place.longitude,
      timezoneOffsetHours: offsetForPlace(bride.place),
      gender: 'F'
    },
    groom: {
      name: groom.name,
      dob: groom.dob,
      tob: groom.tob,
      birthPlace: groom.place.placeName,
      country: groom.place.country,
      latitude: groom.place.latitude,
      longitude: groom.place.longitude,
      timezoneOffsetHours: offsetForPlace(groom.place),
      gender: 'M'
    }
  });
}

export function namingFor(request: ChartRequest & { gender: 'M' | 'F' }): BabyNamingResult {
  return calculateBabyNamingDetails({
    babyName: request.name,
    dob: request.dob,
    tob: request.tob,
    birthPlace: request.place.placeName,
    country: request.place.country,
    latitude: request.place.latitude,
    longitude: request.place.longitude,
    timezoneOffsetHours: offsetForPlace(request.place),
    gender: request.gender
  }) as BabyNamingResult;
}

export function muhurthamMonthFor(
  monthKey: string,
  place: PreviewPlace,
  eventKey: MuhurthamEventKey,
) {
  const [yearText, monthText] = monthKey.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  return scanMonthMuhurtham(year, month, {
    placeName: place.placeName,
    latitude: place.latitude,
    longitude: place.longitude,
    timezoneOffsetHours: offsetForPlace(place),
    timeZoneId: getTimeZoneIdForCoordinates(place.latitude, place.longitude) ?? undefined
  }, eventKey, { skipPastDates: true });
}

/** `2031-07` for a Date, in the visitor's own clock. */
export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export interface MuhurthamLookahead {
  scan: ReturnType<typeof muhurthamMonthFor>;
  monthKey: string;
  /** Months between the requested one and the returned one, in order. */
  skippedMonths: string[];
}

/**
 * A month can be entirely unsuitable — Sukra asta (Venus combustion), an
 * Adhika Masa or a Pitru period rules out every wedding day in it. Showing an
 * empty month would look like a broken page, so when the requested month has no
 * usable day the scan walks forward until it finds one (up to `maxMonths`) and
 * reports which months it passed over, so the UI can say so plainly instead of
 * quietly changing the month.
 */
export function scanWithLookahead(
  monthKey: string,
  place: PreviewPlace,
  eventKey: MuhurthamEventKey,
  maxMonths = 6,
): MuhurthamLookahead {
  const skippedMonths: string[] = [];
  let key = monthKey;

  for (let attempt = 0; attempt < maxMonths; attempt += 1) {
    const scan = muhurthamMonthFor(key, place, eventKey);
    const usable = scan.bestCount + scan.goodCount + scan.fairCount;
    if (usable > 0 || attempt === maxMonths - 1) {
      return { scan, monthKey: key, skippedMonths };
    }
    skippedMonths.push(key);
    key = shiftMonthKey(key, 1);
  }

  // Unreachable (the loop always returns on its last attempt), kept for types.
  return { scan: muhurthamMonthFor(monthKey, place, eventKey), monthKey, skippedMonths };
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const [yearText, monthText] = monthKey.split('-');
  const base = new Date(Number(yearText), Number(monthText) - 1 + delta, 1);
  return monthKeyOf(base);
}

export function monthLabel(monthKey: string): string {
  const [yearText, monthText] = monthKey.split('-');
  return new Date(Number(yearText), Number(monthText) - 1, 1).toLocaleString('en-GB', {
    month: 'long',
    year: 'numeric'
  });
}

/** Guard for the native date input: never a future date, never before 1900. */
export function clampIsoDate(value: string): string {
  const today = new Date();
  const max = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`;
  if (!value) return '';
  if (value > max) return max;
  if (value < '1900-01-01') return '1900-01-01';
  return value;
}

export const MUHURTHAM_EVENTS: Array<{ key: MuhurthamEventKey; label: string }> = [
  { key: 'wedding', label: 'Wedding' },
  { key: 'engagement', label: 'Engagement' },
  { key: 'griha_pravesam', label: 'Griha Pravesam' },
  { key: 'house_purchase', label: 'House purchase' },
  { key: 'house_construction', label: 'House construction' },
  { key: 'land_purchase', label: 'Land purchase' },
  { key: 'business_start', label: 'Business start' },
  { key: 'new_job', label: 'New job' },
  { key: 'vehicle_purchase', label: 'Vehicle purchase' },
  { key: 'gold_purchase', label: 'Gold purchase' },
  { key: 'education_start', label: 'Education start' },
  { key: 'namakaranam', label: 'Namakaranam' },
  { key: 'annaprasanam', label: 'Annaprasanam' },
  { key: 'seemantham', label: 'Seemantham' },
  { key: 'upanayanam', label: 'Upanayanam' },
  { key: 'karnavedha', label: 'Karnavedha' },
  { key: 'mundan', label: 'Mundan' },
  { key: 'shifting_home', label: 'Shifting home' }
];

export type {
  BabyNamingResult,
  HoroscopeResult,
  PanchangamResult,
  WeddingMatchResult,
  MuhurthamEventKey
};
