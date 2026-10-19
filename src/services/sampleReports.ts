/**
 * ASTRO SIVAM — SAMPLE REPORTS (one fixed sample per service)
 * ===========================================================
 *
 * WHY THIS EXISTS
 * ---------------
 * Visitors want to see what a report actually looks like before paying for it.
 * This click-time module calculates the four public sample reports
 * (Birth Jathagam, Marriage Compatibility, Baby Naming, Subha Muhurtham).
 *
 * THE RULES
 * ---------
 * 1. The sample birth details are FIXED — there is no user choice anywhere:
 *        01 January 2000, 2:00 AM, Chennai (India), IST (+5:30).
 *    The same date/time/place is used by every sample report so all four
 *    samples describe the same example person.
 * 2. The Marriage Matching sample also needs a second person. The groom uses
 *    the fixed details above; the bride is a second hard-coded sample person
 *    (15 June 1998, 6:30 AM, Chennai) so the porutham table shows a realistic
 *    spread of results. She is also fixed — never a user choice.
 * 3. Birth, marriage and baby-naming samples use the same server-backed
 *    calculation API as paid previews. Muhurtham's six-month scan is already
 *    produced by the canonical client scanner used by its service form, so its
 *    public sample renders that scan locally instead of depending on a remote
 *    preview endpoint to validate it. All four use the same report builders as
 *    the PDF pipeline, so the sample cannot drift from the real report format.
 * 4. Every sample page carries a light "SAMPLE" watermark so a sample PDF can
 *    never be mistaken for a paid report.
 *
 * Changing the fixed date/time/place (for example, a different city) means
 * editing ONLY the constants in sampleReportInfo.ts (re-exported here).
 */
import { api } from './api';
import {
  describePersonForMuhurtham,
  MUHURTHAM_ALGORITHM_VERSION,
  scanMonthMuhurtham,
  type MuhurthamPersonDetails,
  type PersonInput
} from '../lib/muhurtham/scanner';

export * from './sampleReportInfo';
import {
  SAMPLE_BIRTH, SAMPLE_BRIDE, SAMPLE_BRIDE_NAME, SAMPLE_GROOM_NAME,
  SAMPLE_BABY_NAME, SAMPLE_DEVOTEE_NAME, SAMPLE_MUHURTHAM_EVENT_KEY,
  sampleMuhurthamMonth, type SampleServiceType
} from './sampleReportInfo';

/**
 * The exact payload each service's report is calculated from.
 * Birth Jathagam / Baby Naming / Marriage Matching are pure data payloads the
 * server can compute; the Muhurtham payload carries the six-month panchangam
 * scan (built with the tested client scanner, exactly like the live page).
 */
export function buildSamplePayload(serviceType: SampleServiceType): Record<string, any> {
  switch (serviceType) {
    case 'MARRIAGE_COMPATIBILITY':
      return {
        bride: { name: SAMPLE_BRIDE_NAME, gender: 'F', ...SAMPLE_BRIDE },
        groom: { name: SAMPLE_GROOM_NAME, gender: 'M', ...SAMPLE_BIRTH }
      };
    case 'BABY_NAMING':
      return {
        babyName: SAMPLE_BABY_NAME,
        gender: 'M',
        ...SAMPLE_BIRTH
      };
    case 'MUHURTHAM':
      return buildSampleMuhurthamPayload();
    case 'BIRTH_JATHAGAM':
    default:
      return {
        name: SAMPLE_DEVOTEE_NAME,
        gender: 'M',
        ...SAMPLE_BIRTH
      };
  }
}

function buildSampleMuhurthamPayload(): Record<string, any> {
  const selectedMonth = sampleMuhurthamMonth();
  const [targetYear, targetMonth] = selectedMonth.split('-').map(Number);
  const targetDate = new Date(targetYear, targetMonth - 1, 1);

  // A v5 Muhurtham scan is accepted only when it is stamped with every input
  // that produced it. This is required by the TypeScript and PHP calculators:
  // without the stamp cPanel's PHP API correctly rejects the scan as stale,
  // which made only this public sample appear temporarily unavailable.
  const inputContext = {
    dob: SAMPLE_BIRTH.dob,
    tob: SAMPLE_BIRTH.tob,
    birthPlace: SAMPLE_BIRTH.birthPlace,
    country: SAMPLE_BIRTH.country,
    latitude: SAMPLE_BIRTH.latitude,
    longitude: SAMPLE_BIRTH.longitude,
    timezoneOffsetHours: SAMPLE_BIRTH.timezoneOffsetHours,
    timeZoneId: SAMPLE_BIRTH.timeZoneId,
    muhurthamPlace: SAMPLE_BIRTH.birthPlace,
    muhurthamCountry: SAMPLE_BIRTH.country,
    muhurthamLatitude: SAMPLE_BIRTH.latitude,
    muhurthamLongitude: SAMPLE_BIRTH.longitude,
    muhurthamTimezoneOffsetHours: SAMPLE_BIRTH.timezoneOffsetHours,
    muhurthamTimeZoneId: SAMPLE_BIRTH.timeZoneId,
    // Second person — part of the scan stamp, so a change to either chart
    // invalidates the cached scan in the TypeScript and PHP calculators.
    brideName: SAMPLE_BRIDE_NAME,
    brideDob: SAMPLE_BRIDE.dob,
    brideTob: SAMPLE_BRIDE.tob,
    brideBirthPlace: SAMPLE_BRIDE.birthPlace,
    brideCountry: SAMPLE_BRIDE.country,
    brideLatitude: SAMPLE_BRIDE.latitude,
    brideLongitude: SAMPLE_BRIDE.longitude,
    brideTimezoneOffsetHours: SAMPLE_BRIDE.timezoneOffsetHours,
    brideTimeZoneId: SAMPLE_BRIDE.timeZoneId,
    eventKey: SAMPLE_MUHURTHAM_EVENT_KEY,
    selectedMonth
  };

  // The wedding sample carries BOTH fixed people (the same groom + bride the
  // Marriage Matching sample uses), so every recommended date is checked
  // against both charts exactly like a real two-person wedding order.
  const groomPerson = describePersonForMuhurtham('groom', SAMPLE_GROOM_NAME, { ...SAMPLE_BIRTH });
  const bridePerson = describePersonForMuhurtham('bride', SAMPLE_BRIDE_NAME, { ...SAMPLE_BRIDE });
  const personDetails: MuhurthamPersonDetails[] = [groomPerson, bridePerson].filter(
    (person): person is MuhurthamPersonDetails => Boolean(person)
  );
  const scanPersons: PersonInput[] = personDetails.map(person => ({
    role: person.role,
    nakshatraIndex: person.nakshatraIndex,
    rasiNumber: person.rasiNumber
  }));

  // Sunrise, panchangam and every displayed window use the sample's own city.
  const scanLocation = {
    placeName: SAMPLE_BIRTH.birthPlace,
    latitude: SAMPLE_BIRTH.latitude,
    longitude: SAMPLE_BIRTH.longitude,
    timezoneOffsetHours: SAMPLE_BIRTH.timezoneOffsetHours,
    timeZoneId: SAMPLE_BIRTH.timeZoneId
  };

  const months = Array.from({ length: 6 }, (_, index) => {
    const monthDate = new Date(targetDate.getFullYear(), targetDate.getMonth() + index - 2, 1);
    return scanMonthMuhurtham(
      monthDate.getFullYear(),
      monthDate.getMonth() + 1,
      scanLocation,
      SAMPLE_MUHURTHAM_EVENT_KEY,
      { persons: scanPersons, birthDate: SAMPLE_BIRTH.dob, skipPastDates: true }
    );
  });

  return {
    name: SAMPLE_DEVOTEE_NAME,
    devoteeName: `${SAMPLE_GROOM_NAME} & ${SAMPLE_BRIDE_NAME}`,
    ...SAMPLE_BIRTH,
    // Explicit second person, mirroring the live order payload. The Node and
    // PHP calculators read these (not the display name) to build both charts.
    bride: { name: SAMPLE_BRIDE_NAME, ...SAMPLE_BRIDE },
    muhurthamPlace: SAMPLE_BIRTH.birthPlace,
    muhurthamCountry: SAMPLE_BIRTH.country,
    muhurthamLatitude: SAMPLE_BIRTH.latitude,
    muhurthamLongitude: SAMPLE_BIRTH.longitude,
    muhurthamTimezoneOffsetHours: SAMPLE_BIRTH.timezoneOffsetHours,
    muhurthamTimeZoneId: SAMPLE_BIRTH.timeZoneId,
    eventKey: SAMPLE_MUHURTHAM_EVENT_KEY,
    selectedMonth,
    muhurthamScan: {
      muhurthamAlgorithmVersion: MUHURTHAM_ALGORITHM_VERSION,
      selectedMonth,
      eventKey: SAMPLE_MUHURTHAM_EVENT_KEY,
      inputContext,
      months,
      persons: personDetails
    }
  };
}

/** Sample results are identical for every visitor — compute once per session. */
const sampleResultCache = new Map<string, any>();

function sampleCacheKey(serviceType: SampleServiceType, payload: Record<string, any>): string {
  return serviceType === 'MUHURTHAM' ? `${serviceType}:${payload.selectedMonth}` : serviceType;
}

/**
 * Calculates the fixed sample result for a service with the real astrology
 * service (Node or PHP — whichever the deployment is running).
 */
function hasCompleteMuhurthamSample(result: any, payload: Record<string, any>): boolean {
  return Boolean(
    result && typeof result === 'object' &&
    Number(result.muhurthamAlgorithmVersion) === MUHURTHAM_ALGORITHM_VERSION &&
    result.selectedMonth === payload.selectedMonth &&
    Array.isArray(result.months) && result.months.length === 6 &&
    result.months.every((month: any) => Array.isArray(month?.days)) &&
    Array.isArray(result.persons) && result.persons.length >= 1
  );
}

export async function calculateSampleResult(
  serviceType: SampleServiceType,
  options?: { force?: boolean }
): Promise<any> {
  const payload = buildSamplePayload(serviceType);
  const cacheKey = sampleCacheKey(serviceType, payload);
  if (!options?.force && sampleResultCache.has(cacheKey)) {
    return sampleResultCache.get(cacheKey);
  }

  // The Muhurtham sample already includes its complete, versioned six-month
  // scan from the shared client scanner. The PHP preview endpoint only
  // validates/normalizes that scan; requiring a live round-trip here meant a
  // server-version mismatch could hide an otherwise complete public sample.
  // Render this fixed sample directly from the exact scan used by the page.
  if (serviceType === 'MUHURTHAM') {
    const { calculateLocalAstrology } = await import('./localAstrology');
    const result = calculateLocalAstrology(serviceType, payload);
    if (!hasCompleteMuhurthamSample(result, payload)) {
      throw new Error('The Subha Muhurtham sample calendar could not be loaded. Please try again.');
    }
    sampleResultCache.set(cacheKey, result);
    return result;
  }

  try {
    const response = await api.calculatePreview(serviceType, payload);
    if (response?.success && response.result) {
      sampleResultCache.set(cacheKey, response.result);
      return response.result;
    }
  } catch (apiError) {
    console.warn('[ASTRO SIVAM] Remote sample calculation unavailable, falling back to client-side engine:', apiError);
  }

  // Resilient fallback: compute using the high-precision client-side astrology engine.
  const { calculateLocalAstrology } = await import('./localAstrology');
  const result = calculateLocalAstrology(serviceType, payload);
  if (!result) {
    throw new Error('The sample report could not be prepared. Please try again.');
  }
  sampleResultCache.set(cacheKey, result);
  return result;
}
