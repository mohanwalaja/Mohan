/**
 * ASTRO SIVAM — Thirukanitha (Drik Ganita) panchangam end-time searches.
 *
 * Governing tradition (audit items #26/#27/#28 correction, 2026-10-12):
 * THIRUKANITHA (Drik Ganita), per the Yalppanam Sri Thirukanitha Karthikeya
 * Aiyar Panchangam (138th edition, Viswavasu 2025-26, calculated for Zurich).
 * See docs/THIRUKANITHA_AUDIT_RECORD.md.
 *
 * Rules implemented here (from the almanac's explanatory pages):
 *   - Tithi: 12° steps of (Moon − Sun) ecliptic longitude separation; the
 *     separation is independent of the ayanamsa convention, so tithi end
 *     instants are identical in tropical and sidereal frames.
 *   - Nakshatra: 13°20' spans of the Moon's NIRAYANA (sidereal, Lahiri)
 *     longitude; end instants use the same TRUE Lahiri ayanamsa (mean + Δψ,
 *     24°12'37" for Viswavasu 2025-26) as every other engine on this site.
 *   - Yoga: 13°20' spans of (Sun + Moon) nirayana longitudes.
 *   - Karana: 6° steps of (Moon − Sun) separation (half a tithi).
 *   - Sankranti: Sun's nirayana longitude crossing 30° multiples (rasi entry).
 *
 * All end instants are absolute moments (location-independent). Which tithi /
 * nakshatra "belongs" to a civil date depends on local sunrise at the place —
 * see thirukanithaDay(). The TypeScript and PHP engines implement the same
 * binary-search algorithm and constants so both produce identical output for
 * identical input.
 */
import * as Astronomy from 'astronomy-engine';
import { calculateLahiriAyanamsa } from './ayanamsa.js';

const J2000 = 2451545.0;
const normalizeDeg = (deg: number): number => ((deg % 360) + 360) % 360;

/** Julian Day (UT) for a JS Date. */
export const julianDayUtc = (utc: Date): number => utc.getTime() / 86400000 + 2440587.5;
/** JS Date (UTC) for a Julian Day (UT). */
export const dateFromJulianDay = (jd: number): Date => new Date(Math.round((jd - 2440587.5) * 86400000));

/** True (geometric) geocentric ecliptic longitudes, tropical, degrees. */
function tropicalLongitudes(jdUt: number): { sun: number; moon: number } {
  const time = Astronomy.MakeTime(jdUt - J2000);
  const sun = Astronomy.Ecliptic(Astronomy.GeoVector(Astronomy.Body.Sun, time, true)).elon;
  const moon = Astronomy.Ecliptic(Astronomy.GeoVector(Astronomy.Body.Moon, time, true)).elon;
  return { sun: normalizeDeg(sun), moon: normalizeDeg(moon) };
}

/** (Moon − Sun) separation in degrees [0, 360): drives tithi and karana. */
export function moonSunSeparation(jdUt: number): number {
  const { sun, moon } = tropicalLongitudes(jdUt);
  return normalizeDeg(moon - sun);
}

/** Moon's sidereal (Lahiri TRUE) longitude, degrees [0, 360). */
export function moonSiderealLongitude(jdUt: number): number {
  const { moon } = tropicalLongitudes(jdUt);
  return normalizeDeg(moon - calculateLahiriAyanamsa(jdUt));
}

/** Sun's sidereal (Lahiri TRUE) longitude, degrees [0, 360). */
export function sunSiderealLongitude(jdUt: number): number {
  const { sun } = tropicalLongitudes(jdUt);
  return normalizeDeg(sun - calculateLahiriAyanamsa(jdUt));
}

/** (Sun + Moon) sidereal sum in degrees [0, 360): drives yoga. */
export function yogaSumSidereal(jdUt: number): number {
  const { sun, moon } = tropicalLongitudes(jdUt);
  const ayanamsa = calculateLahiriAyanamsa(jdUt);
  return normalizeDeg(sun + moon - 2 * ayanamsa);
}

/**
 * Binary-search the instant at which `angle(jd)` (continuous, strictly
 * increasing at `ratePerDay` deg/day near the search window) crosses `target`
 * degrees. Returns the Julian Day (UT) of crossing, within ~0.1 s.
 */
function searchCrossing(
  angle: (jd: number) => number,
  jdStart: number,
  target: number,
  ratePerDay: number
): number {
  const span = normalizeDeg(target - angle(jdStart));
  let lo = jdStart;
  let hi = jdStart + span / ratePerDay + 0.25; // small slack for varying speed
  // 40 bisection iterations on a ≤ ~30-day window ⇒ far below one second.
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    const travelled = normalizeDeg(angle(mid) - angle(jdStart));
    if (travelled >= span) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

export interface PanchangamEnd {
  /** Index ending (e.g. tithi 0-29, nakshatra 0-26, yoga 0-26, karana 0-59/60-sthira handled by caller). */
  index: number;
  /** Julian Day (UT) of the end instant. */
  jdUt: number;
  /** End instant as a JS Date in UTC. */
  utc: Date;
}

/** End instant of the tithi current at `fromUtc` (0 = Shukla Prathama … 29 = Amavasya). */
export function tithiEnd(fromUtc: Date): PanchangamEnd {
  const jd = julianDayUtc(fromUtc);
  const sep = moonSunSeparation(jd);
  const index = Math.floor(sep / 12);
  const target = (index + 1) * 12;
  const jdEnd = searchCrossing(moonSunSeparation, jd, target, 12.19);
  return { index, jdUt: jdEnd, utc: dateFromJulianDay(jdEnd) };
}

/** End instant of the karana current at `fromUtc` (each karana = 6°). */
export function karanaEnd(fromUtc: Date): PanchangamEnd {
  const jd = julianDayUtc(fromUtc);
  const sep = moonSunSeparation(jd);
  const halfIndex = Math.floor(sep / 6); // 0..59 over the 30-tithi cycle
  const target = (halfIndex + 1) * 6;
  const jdEnd = searchCrossing(moonSunSeparation, jd, target, 12.19);
  return { index: halfIndex, jdUt: jdEnd, utc: dateFromJulianDay(jdEnd) };
}

/** End instant of the nakshatra current at `fromUtc` (0 = Ashwini … 26 = Revati). */
export function nakshatraEnd(fromUtc: Date): PanchangamEnd {
  const jd = julianDayUtc(fromUtc);
  const lon = moonSiderealLongitude(jd);
  const span = 360 / 27;
  const index = Math.floor(lon / span);
  const target = normalizeDeg((index + 1) * span);
  const jdEnd = searchCrossing(moonSiderealLongitude, jd, target, 13.18);
  return { index, jdUt: jdEnd, utc: dateFromJulianDay(jdEnd) };
}

/** End instant of the yoga current at `fromUtc` (0 = Vishkambha … 26 = Vaidhriti). */
export function yogaEnd(fromUtc: Date): PanchangamEnd {
  const jd = julianDayUtc(fromUtc);
  const sum = yogaSumSidereal(jd);
  const span = 360 / 27;
  const index = Math.floor(sum / span);
  const target = normalizeDeg((index + 1) * span);
  const jdEnd = searchCrossing(yogaSumSidereal, jd, target, 14.49);
  return { index, jdUt: jdEnd, utc: dateFromJulianDay(jdEnd) };
}

export interface SankrantiEvent {
  /** Rasi entered: 0 = Mesham … 11 = Meenam. */
  rasiIndex: number;
  jdUt: number;
  utc: Date;
}

/** Next sankranti (Sun entering the next rasi) at or after `fromUtc`. */
export function nextSankranti(fromUtc: Date): SankrantiEvent {
  const jd = julianDayUtc(fromUtc);
  const lon = sunSiderealLongitude(jd);
  const rasiIndex = Math.floor(lon / 30);
  const target = normalizeDeg((rasiIndex + 1) * 30);
  const jdEnd = searchCrossing(sunSiderealLongitude, jd, target, 0.9856);
  return { rasiIndex: (rasiIndex + 1) % 12, jdUt: jdEnd, utc: dateFromJulianDay(jdEnd) };
}
