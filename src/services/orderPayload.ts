/**
 * ASTRO SIVAM — order payload normalisation & staleness rules.
 *
 * WHY THIS IS NOT IN jathagamPdfExporter.ts (audit PERF-1): the exporter is the
 * module that pulls in jspdf + html2canvas (~950 KB). The live-preview modal
 * needs the pure rules below while it is RENDERING (merge the saved payload
 * into the result, decide whether it is stale, build the canonical
 * recalculation payload) — not only when the visitor downloads. Keeping them
 * in the exporter meant any preview, including the public sample reports,
 * fetched the whole PDF engine; here they are a few kilobytes that arrive with
 * the preview chunk, and the exporter imports them back (it re-exports them,
 * so every existing importer of the exporter keeps working unchanged).
 */
import { Order } from '../types';
// Imported from its own module: `scanner.ts` drags in the astronomy engine,
// and a staleness check must not cost the visitor an ephemeris download.
import { MUHURTHAM_ALGORITHM_VERSION } from '../lib/muhurtham/algorithmVersion';
import { formatBirthPlace } from './formatUtils';
import { getTimeZoneIdForCoordinates, resolveLocalDateTimeInTimeZone } from '../lib/timezone';

/**
 * Mirrors the live-preview modal: a persisted result is merged with the
 * original input payload so names / dates / places always come from what the
 * customer actually typed (the calculation layer stores placeholders such as
 * "Native" for legacy rows).
 */
function reportText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function reportNumber(value: unknown): number | null {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeBirthInput(input: any): any {
  const value = input || {};
  const timezoneOffsetHours = value.timezoneOffsetHours ?? value.tzOffsetHours ??
    (value.tzOffsetMinutes !== undefined ? Number(value.tzOffsetMinutes) / 60 : undefined);
  return {
    ...value,
    birthPlace: value.birthPlace ?? value.place ?? '',
    country: value.country ?? value.birthCountry ?? '',
    latitude: value.latitude ?? value.lat,
    longitude: value.longitude ?? value.lng,
    timezoneOffsetHours,
    timeZoneId: value.timeZoneId ?? value.timezoneId ?? ''
  };
}

/** Float/rounding slack for offset comparison (offsets are minute-precise in practice). */
const OFFSET_MATCH_TOLERANCE_HOURS = 1 / 3600;

/**
 * Compares the timezone fields as a BIRTH INSTANT, never as raw values.
 *
 * The TypeScript calculation module and the PHP engine
 * intentionally replace the submitted fixed offset with the IANA historical
 * offset in force at the moment of birth — DST included — so a chart computed
 * from these exact inputs may legitimately store an offset that differs from
 * what the customer typed (born in New York in July: submitted -5, stored -4;
 * a DST-observing location in January: submitted 12, stored 13). Requiring a byte-exact match made
 * every such chart "permanently stale": recalculation produced the same stored
 * offset, failed the same check again, and the member was skipped with "no
 * calculated astrology results available" on every retry.
 *
 * The chart matches when its stored offset equals one of the offsets the
 * engines would compute from these same inputs: the IANA zone mapped from the
 * saved coordinates (TypeScript calculation module), the IANA zone the payload itself carries
 * (PHP engine), or the submitted fixed offset (legacy rows).
 */
function birthTimeOffsetsMatch(chartOffset: number | null, input: any): boolean {
  if (chartOffset === null) return true; // rows predating stored offsets: nothing to disprove
  const candidates: Array<number | null> = [];
  const lat = reportNumber(input.latitude);
  const lon = reportNumber(input.longitude);
  // The engines normalise the submitted wall clock before resolving the zone,
  // so resolve the same canonical date/time ('6:30 PM' → '18:30') here too.
  const dob = canonicalBirthDate(input.dob);
  const tob = canonicalBirthTime(input.tob);
  if (lat !== null && lon !== null) {
    const zone = getTimeZoneIdForCoordinates(lat, lon);
    if (zone) {
      const resolved = resolveLocalDateTimeInTimeZone(dob, tob, zone);
      if (resolved) candidates.push(resolved.offsetHours);
    }
  }
  const inputZone = reportText(input.timeZoneId);
  if (inputZone) {
    const resolved = resolveLocalDateTimeInTimeZone(dob, tob, inputZone);
    if (resolved) candidates.push(resolved.offsetHours);
  }
  candidates.push(reportNumber(input.timezoneOffsetHours));
  return candidates.some(
    candidate => candidate !== null && Math.abs(candidate - chartOffset) <= OFFSET_MATCH_TOLERANCE_HOURS
  );
}

/**
 * Canonical 24-hour `HH:MM` for a saved or engine-stored birth time.
 *
 * The engines agree on this canonical form (`AstroEngine::normalizeBirthTime()`
 * and the TypeScript calculation module both store `06:30`), but order rows saved before the
 * birth-time input was canonicalised — and every order placed through the PHP
 * API, which accepts `6:30`, `06:30:00` and `6:30 PM` — keep what the customer
 * typed. Comparing the raw strings made those charts permanently stale: the
 * recalculation returned the canonical time again, failed the same check, and
 * the member was skipped on every retry.
 *
 * Unparseable values fall back to the trimmed text so a genuinely wrong time
 * still forces a recalculation.
 */
function canonicalBirthTime(value: unknown): string {
  const raw = reportText(value);
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(raw);
  if (!match) return raw;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] === undefined ? 0 : Number(match[3]);
  const period = (match[4] || '').toLowerCase();
  if (period === 'pm' && hour < 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59 || second > 59) return raw;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Canonical `YYYY-MM-DD` for a saved or engine-stored birth date. */
function canonicalBirthDate(value: unknown): string {
  const raw = reportText(value);
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (!match) return raw;
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/** Engine-canonical gender letter, or '' when the value is not a binary gender. */
function genderLetter(value: unknown): string {
  const text = reportText(value).toUpperCase();
  if (text === 'M' || text === 'MALE' || text === 'BOY') return 'M';
  if (text === 'F' || text === 'FEMALE' || text === 'GIRL') return 'F';
  return '';
}

/**
 * True only when both sides name a binary gender and disagree.
 *
 * The PHP engine collapses everything that is not `F` to `M` (so the family
 * checkout's "Other" choice is stored as `M`), and older rows hold `male` /
 * `female`. Comparing the letters — and staying silent when the saved value
 * does not pin a gender — stops those charts from being judged stale forever.
 */
function gendersDisagree(chartGender: unknown, inputGender: unknown): boolean {
  const chart = genderLetter(chartGender);
  const input = genderLetter(inputGender);
  return Boolean(chart && input && chart !== input);
}

/** A cached chart is reusable only when every calculation-driving birth input matches. */
function birthDetailsMatch(chart: any, rawInput: any, expectedGender?: string): boolean {
  if (!chart || !rawInput) return false;
  const input = normalizeBirthInput(rawInput);
  const details = chart.birthDetails || chart;
  const chartValue = (key: string) => details[key] ?? chart[key];
  const chartText = (key: string) => reportText(chartValue(key));
  const inputText = (key: string) => reportText(input[key]);
  const chartNumber = (key: string) => reportNumber(chartValue(key));
  const inputNumber = (key: string) => reportNumber(input[key]);
  const requiredText = ['dob', 'tob', 'birthPlace'];
  if (requiredText.some(key => !inputText(key))) return false;
  if (inputNumber('latitude') === null || inputNumber('longitude') === null || inputNumber('timezoneOffsetHours') === null) return false;
  // Birth date/time are compared as the same wall-clock moment the engines
  // consume, never as raw strings (see canonicalBirthTime).
  if (canonicalBirthDate(chartValue('dob')) !== canonicalBirthDate(input.dob)) return false;
  if (canonicalBirthTime(chartValue('tob')) !== canonicalBirthTime(input.tob)) return false;
  if (chartText('birthPlace') !== inputText('birthPlace')) return false;
  if (chartText('country') !== inputText('country')) return false;
  if (chartNumber('latitude') !== inputNumber('latitude') ||
      chartNumber('longitude') !== inputNumber('longitude')) return false;
  if (!birthTimeOffsetsMatch(chartNumber('timezoneOffsetHours'), input)) return false;
  if (expectedGender && chartValue('gender') !== undefined && gendersDisagree(chartValue('gender'), expectedGender)) return false;
  return true;
}

/** A rasi index as both engines store it (1 = Mesham … 12 = Meenam). */
function isRasiNumber(value: unknown): boolean {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 12;
}

/**
 * Is this a COMPLETE Birth Jathagam chart — the same contract both astrology
 * engines produce and the report renderer consumes?
 *
 * The old marker was `Boolean(result.bhavas)`, and only the TypeScript calculation module emits a
 * `bhavas` table: the production PHP engine (`AstroEngine::calculateHoroscope()`)
 * stores the twelve houses on every `planetPositions` entry instead. So on the
 * PHP deployment EVERY rescued member was rejected as "inconsistent with the
 * saved birth inputs" — even a chart recalculated from those very inputs — and
 * the family render skipped it on every retry.
 *
 * The report itself is built from the shared fields below (`lagnaRasi`,
 * `chandraRasi`, nine `planetPositions` with rasi/bhava, the janma nakshatra and
 * pada, and the Vimshottari timeline), so those are what a chart must carry to
 * render at full quality — no matter which engine produced it.
 */
function hasCompleteJathagamChart(result: any): boolean {
  if (!result || typeof result !== 'object') return false;
  if (!isRasiNumber(result.lagnaRasi) || !isRasiNumber(result.chandraRasi)) return false;
  const positions = Array.isArray(result.planetPositions) ? result.planetPositions : [];
  if (positions.length < 9) return false;
  if (!positions.every((position: any) =>
    isRasiNumber(position?.rasi) && isRasiNumber(position?.bhavaNumber ?? position?.house))) {
    return false;
  }
  const nakshatra = reportText(result.janmaNakshatraEn) ||
    reportText(result.janmaNakshatraTa) ||
    reportText(result.janmaNakshatraHi);
  if (!nakshatra) return false;
  const pada = Number(result.janmaPada);
  if (!Number.isInteger(pada) || pada < 1 || pada > 4) return false;
  const timeline = Array.isArray(result.dashaPeriods) ? result.dashaPeriods : [];
  if (timeline.length === 0 && !result.dasha && !result.currentDasha) return false;
  return true;
}

function normalizeWeddingPerson(payload: any, role: 'bride' | 'groom', source?: any, isLegacyFlat = false): any {
  const value = source || {};
  const isBride = role === 'bride';
  const secondRole = isBride ? 'girl' : 'boy';
  const numberedRole = isBride ? 'p1' : 'p2';
  const prefix = isBride ? 'bride' : 'groom';
  const altPrefix = secondRole;
  const birthDetails = value.birthDetails || {};
  const numbered = (key: string) => source ? undefined : payload[`${numberedRole}${key}`];
  return {
    ...value,
    name: value.name ?? value.devoteeName ?? value[`${prefix}Name`] ?? payload[`${prefix}Name`] ?? payload[`${altPrefix}Name`] ?? numbered('Name'),
    dob: value.dob ?? birthDetails.dob ?? value[`${prefix}Dob`] ?? payload[`${prefix}Dob`] ?? payload[`${altPrefix}Dob`] ?? numbered('Dob'),
    tob: value.tob ?? birthDetails.tob ?? value[`${prefix}Tob`] ?? payload[`${prefix}Tob`] ?? payload[`${altPrefix}Tob`] ?? numbered('Tob'),
    birthPlace: value.birthPlace ?? birthDetails.birthPlace ?? value.place ?? value[`${prefix}Place`] ??
      payload[`${prefix}BirthPlace`] ?? payload[`${prefix}Place`] ?? numbered('BirthPlace') ?? (isLegacyFlat ? payload.birthPlace : undefined),
    country: value.country ?? birthDetails.country ?? value.birthCountry ?? value[`${prefix}Country`] ??
      payload[`${prefix}Country`] ?? payload[`${altPrefix}Country`] ?? numbered('Country'),
    latitude: value.latitude ?? birthDetails.latitude ?? value.lat ?? payload[`${prefix}Latitude`] ?? numbered('Latitude') ?? (isLegacyFlat ? payload.latitude : undefined),
    longitude: value.longitude ?? birthDetails.longitude ?? value.lng ?? payload[`${prefix}Longitude`] ?? numbered('Longitude') ?? (isLegacyFlat ? payload.longitude : undefined),
    timezoneOffsetHours: value.timezoneOffsetHours ?? birthDetails.timezoneOffsetHours ?? value.tzOffsetHours ??
      payload[`${prefix}TimezoneOffsetHours`] ?? numbered('TimezoneOffsetHours') ?? (isLegacyFlat ? payload.timezoneOffsetHours : undefined),
    timeZoneId: value.timeZoneId ?? birthDetails.timeZoneId ?? payload[`${prefix}TimeZoneId`] ?? numbered('TimeZoneId') ?? (isLegacyFlat ? payload.timeZoneId : undefined)
  };
}

function normalizeWeddingInputs(payload: any): { bride: any; groom: any } {
  const p = payload || {};
  let bride = p.bride || p.girl || p.brideDetails || p.girlDetails;
  let groom = p.groom || p.boy || p.groomDetails || p.boyDetails;
  if (!bride && !groom && p.p1 && p.p2) {
    const p1IsBride = p.p1Role === 'bride' || String(p.p1.gender || '').toUpperCase() === 'F';
    bride = p1IsBride ? p.p1 : p.p2;
    groom = p1IsBride ? p.p2 : p.p1;
    return {
      bride: normalizeWeddingPerson(p, 'bride', bride),
      groom: normalizeWeddingPerson(p, 'groom', groom)
    };
  }
  if (bride || groom) {
    return {
      bride: normalizeWeddingPerson(p, 'bride', bride),
      groom: normalizeWeddingPerson(p, 'groom', groom)
    };
  }
  return {
    bride: normalizeWeddingPerson(p, 'bride', undefined, true),
    groom: normalizeWeddingPerson(p, 'groom', undefined, true)
  };
}

export function mergeOrderPayloadIntoResult(order: Order, result: any): any {
  if (!result || !order) return result;
  const p: any = order.inputPayload || {};
  const merged: any = { ...result };
  const recordedCountry = (value: unknown) => typeof value === 'string' ? value.trim() : '';
  const recordedPlace = (value: unknown) => typeof value === 'string' ? value.trim() : '';
  // The report prints the SAVED birth time; store it in the canonical 24-hour
  // form so a legacy '6:30 PM' row cannot be shown as '06:30 AM'.
  const recordedTime = (value: unknown) => canonicalBirthTime(value);

  if (order.serviceType === 'MARRIAGE_COMPATIBILITY') {
    const { bride, groom } = normalizeWeddingInputs(p);
    const brideName = reportText(bride.name);
    const groomName = reportText(groom.name);
    if (brideName) merged.brideName = brideName;
    else if (!merged.brideName || merged.brideName === 'Native' || merged.brideName === 'Bride') {
      merged.brideName = p.brideName || p.girlName || p.p1Name || merged.brideName;
    }
    if (groomName) merged.groomName = groomName;
    else if (!merged.groomName || merged.groomName === 'Native' || merged.groomName === 'Groom') {
      merged.groomName = p.groomName || p.boyName || p.p2Name || merged.groomName;
    }
    if (bride.dob) merged.brideDob = bride.dob;
    if (bride.tob) merged.brideTob = bride.tob;
    if (groom.dob) merged.groomDob = groom.dob;
    if (groom.tob) merged.groomTob = groom.tob;

    const brideBirthPlace = recordedPlace(bride.birthPlace);
    const brideCountry = recordedCountry(bride.country);
    const groomBirthPlace = recordedPlace(groom.birthPlace);
    const groomCountry = recordedCountry(groom.country);
    // Old calculated results may have appended the account/billing country.
    // Rebuild each label only from the saved bride/groom birth particulars.
    merged.bridePlace = formatBirthPlace(brideBirthPlace, brideCountry);
    merged.groomPlace = formatBirthPlace(groomBirthPlace, groomCountry);
    merged.bride = { ...(merged.bride || {}), birthPlace: brideBirthPlace, country: brideCountry };
    merged.groom = { ...(merged.groom || {}), birthPlace: groomBirthPlace, country: groomCountry };
  } else if (order.serviceType === 'BABY_NAMING') {
    const babyName = reportText(p.babyName ?? p.childName ?? p.name);
    if (babyName) merged.babyName = babyName;
    if (p.dob) merged.dob = p.dob;
    if (p.tob) merged.tob = recordedTime(p.tob);
    merged.birthPlace = recordedPlace(p.birthPlace ?? p.place);
    merged.country = recordedCountry(p.country);
    if (p.gender) merged.gender = p.gender;
  } else if (order.serviceType === 'MUHURTHAM') {
    if (p.name || p.devoteeName) merged.devoteeName = p.name || p.devoteeName;
    else if (!merged.devoteeName || merged.devoteeName === 'Native' || merged.devoteeName === 'Devotee' || merged.devoteeName === 'User') {
      merged.devoteeName = order.userName || merged.devoteeName;
    }
    if (p.dob) merged.dob = p.dob;
    if (p.tob) merged.tob = recordedTime(p.tob);
    merged.birthPlace = recordedPlace(p.birthPlace ?? p.place);
    merged.country = recordedCountry(p.country);
    merged.muhurthamPlace = recordedPlace(p.muhurthamPlace);
    merged.muhurthamCountry = recordedCountry(p.muhurthamCountry);
    merged.eventKey = recordedPlace(p.eventKey) || 'wedding';
    if (!merged.months && !merged.chosenMonth && p.muhurthamScan) {
      merged.months = p.muhurthamScan.months || merged.months;
      merged.prevMonth = p.muhurthamScan.prevMonth || merged.prevMonth;
      merged.chosenMonth = p.muhurthamScan.chosenMonth || merged.chosenMonth;
      merged.nextMonth = p.muhurthamScan.nextMonth || merged.nextMonth;
    }
  } else {
    if (p.name) merged.devoteeName = p.name;
    else if (!merged.devoteeName || merged.devoteeName === 'Native' || merged.devoteeName === 'Devotee' || merged.devoteeName === 'User') {
      merged.devoteeName = order.userName || merged.devoteeName;
    }
    if (p.dob) merged.dob = p.dob;
    if (p.tob) merged.tob = recordedTime(p.tob);
    // Billing/order country is not a substitute for missing birth particulars.
    merged.birthPlace = recordedPlace(p.birthPlace ?? p.place);
    merged.country = recordedCountry(p.country);
    if (p.gender || (order as any).gender) merged.gender = p.gender || (order as any).gender;
  }

  merged.inputPayload = p;
  return merged;
}

/**
 * Same staleness rule the live-preview modal uses: a stored result that predates
 * the current algorithm (e.g. Baby Naming v1 without the 108-pada mapping, or a
 * horoscope saved without bhavas) is recalculated instead of being rendered,
 * otherwise the customer would receive a visibly thinner report.
 */
export function resultNeedsRecalculation(order: Order, result: any): boolean {
  if (!result) return true;
  if (order.serviceType === 'BABY_NAMING') {
    const p: any = order.inputPayload || {};
    const birthInput = normalizeBirthInput(p);
    const chart = result.babyHoroscope || result;
    return (
      !result.nakshatraLetters ||
      !result.primaryPadaInfo ||
      Number(result.babyNamingAlgorithmVersion || 0) !== 2 ||
      !birthDetailsMatch(chart, birthInput) ||
      !genderLetter(result.gender) ||
      gendersDisagree(result.gender, p.gender || 'M')
    );
  }
  if (order.serviceType === 'BIRTH_JATHAGAM') {
    const p: any = order.inputPayload || {};
    return !hasCompleteJathagamChart(result) || !birthDetailsMatch(result, p, p.gender || 'M');
  }
  if (order.serviceType === 'MARRIAGE_COMPATIBILITY') {
    const p: any = order.inputPayload || {};
    const { bride, groom } = normalizeWeddingInputs(p);
    return !birthDetailsMatch(result.bride, bride, 'F') || !birthDetailsMatch(result.groom, groom, 'M');
  }
  if (order.serviceType === 'MUHURTHAM') {
    const p: any = order.inputPayload || {};
    const sameNumber = (left: unknown, right: unknown) =>
      Number.isFinite(Number(left)) && Number.isFinite(Number(right)) && Number(left) === Number(right);
    const months = Array.isArray(result.months) ? result.months : [];
    const hasSixMonths = months.length === 6 &&
      months.every(month => Array.isArray(month?.days)) &&
      months.some(month => month.days.length > 0);
    return Number(result.muhurthamAlgorithmVersion) !== MUHURTHAM_ALGORITHM_VERSION || !hasSixMonths ||
      !p.muhurthamPlace || result.muhurthamPlace !== p.muhurthamPlace ||
      String(result.muhurthamCountry || '') !== String(p.muhurthamCountry || '') ||
      !sameNumber(result.muhurthamLatitude, p.muhurthamLatitude) ||
      !sameNumber(result.muhurthamLongitude, p.muhurthamLongitude) ||
      !sameNumber(result.muhurthamTimezoneOffsetHours, p.muhurthamTimezoneOffsetHours) ||
      String(result.muhurthamTimeZoneId || '') !== String(p.muhurthamTimeZoneId || '') ||
      String(result.selectedMonth || '') !== String(p.selectedMonth || '') ||
      String(result.eventKey || '') !== String(p.eventKey || '') ||
      String(result.dob || '') !== String(p.dob || '') ||
      String(result.tob || '') !== String(p.tob || '') ||
      String(result.birthPlace || '') !== String(p.birthPlace || '') ||
      String(result.country || '') !== String(p.country || '') ||
      !sameNumber(result.latitude, p.latitude) ||
      !sameNumber(result.longitude, p.longitude) ||
      !sameNumber(result.timezoneOffsetHours, p.timezoneOffsetHours) ||
      String(result.timeZoneId || '') !== String(p.timeZoneId || '');
  }
  return false;
}

/** Display name of a family member, matching the admin card and the invoice. */
export function familyMemberDisplayName(order: Order): string {
  const p: any = order?.inputPayload || {};
  if (order?.serviceType === 'MARRIAGE_COMPATIBILITY') {
    const bride = p.bride?.name || p.brideName || '';
    const groom = p.groom?.name || p.groomName || '';
    if (bride && groom) return `${bride} & ${groom}`;
  }
  if (order?.serviceType === 'BABY_NAMING' && (p.babyName || p.childName)) {
    return p.babyName || p.childName;
  }
  return p.name || order?.userName || order?.orderNumber || 'User';
}

/** Birth-time / birth-date keys used by the flat and the nested payload shapes. */
const BIRTH_TIME_KEYS = ['tob', 'brideTob', 'girlTob', 'p1Tob', 'groomTob', 'boyTob', 'p2Tob'];
const BIRTH_DATE_KEYS = ['dob', 'brideDob', 'girlDob', 'p1Dob', 'groomDob', 'boyDob', 'p2Dob'];
const NESTED_BIRTH_PEOPLE = [
  'bride', 'groom', 'girl', 'boy', 'brideDetails', 'groomDetails',
  'p1', 'p2', 'partner', 'baby', 'child', 'native'
];

/**
 * The payload the astrology engines accept for a recalculation.
 *
 * The TypeScript and PHP engines consume a canonical `YYYY-MM-DD` / 24-hour `HH:MM` wall clock,
 * but saved rows may hold what the customer typed (`6:30`, `06:30:00`,
 * `6:30 PM` — the PHP API accepts and stores all three). Sending those bytes
 * unchanged made the recalculation itself fail with "the saved birth date,
 * time, place, coordinates, or time zone are incomplete", so the member could
 * never be rescued. Only the calculation-driving date/time fields are
 * rewritten; the stored order keeps exactly what the customer typed.
 */
export function canonicalCalculationPayload(payload: any): any {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const canonicalFields = (source: any): any => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) return source;
    const next = { ...source };
    for (const key of BIRTH_TIME_KEYS) {
      if (next[key] !== undefined) next[key] = canonicalBirthTime(next[key]) || next[key];
    }
    for (const key of BIRTH_DATE_KEYS) {
      if (next[key] !== undefined) next[key] = canonicalBirthDate(next[key]) || next[key];
    }
    return next;
  };
  const next = canonicalFields(payload);
  for (const key of NESTED_BIRTH_PEOPLE) {
    if (next[key] && typeof next[key] === 'object') next[key] = canonicalFields(next[key]);
  }
  return next;
}

export function getFamilyGroupId(orders: Order[], groupId?: string): string {
  return (
    groupId ||
    orders.find(o => (o as any).groupId)?.groupId ||
    orders[0]?.orderNumber ||
    'FAMILY'
  );
}
