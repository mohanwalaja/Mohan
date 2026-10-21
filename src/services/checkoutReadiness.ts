/**
 * Is there enough in the order payload to actually calculate the report?
 *
 * The checkout modal and the order API both need complete birth particulars.
 * The API already rejects an incomplete order (api/services/index.php), but the
 * customer should never see a payment screen for an order that cannot be
 * fulfilled — which is exactly what happened when a brand-new Google user
 * signed in from the "Quick Sign In" banner: the checkout opened with an empty
 * form and only failed after they had paid.
 *
 * This mirrors the server rules:
 *   BIRTH_JATHAGAM / BABY_NAMING  one valid birth record
 *   MARRIAGE_COMPATIBILITY        a valid bride AND a valid groom record
 *   MUHURTHAM                     a valid birth record plus a valid ceremony place
 *
 * Name is deliberately optional (a baby may not be named yet). Dates, times,
 * place labels, coordinates and the time zone are not.
 */
import { hasValidBirthDetails, isValidBirthDate, isValidBirthTime } from '../lib/astrology/birthDetails';
import type { ServiceType } from '../types';

type AnyRecord = Record<string, any>;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

function hasCoordinates(latitude: unknown, longitude: unknown, offset: unknown): boolean {
  if ([latitude, longitude, offset].some(value => value === null || value === undefined || value === '')) {
    return false;
  }
  const lat = Number(latitude);
  const lon = Number(longitude);
  const tz = Number(offset);
  return Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    Number.isFinite(lon) && lon >= -180 && lon <= 180 &&
    Number.isFinite(tz) && tz >= -14 && tz <= 14;
}

/**
 * The first missing or unusable birth input, worded for a customer.
 * Returns '' when the record is complete enough to calculate a report.
 */
export function birthRecordProblem(person: unknown): string {
  if (!person || typeof person !== 'object' || Array.isArray(person)) return 'missing';
  const record = person as AnyRecord;
  if (!text(record.dob)) return 'missing date of birth';
  if (!isValidBirthDate(record.dob)) return 'a valid date of birth that is not in the future';
  if (!text(record.tob)) return 'missing time of birth';
  if (!isValidBirthTime(record.tob)) return 'a valid time of birth (24-hour HH:MM)';
  if (!text(record.birthPlace)) return 'missing birth place';
  if (!hasCoordinates(record.latitude, record.longitude, record.timezoneOffsetHours)) {
    return 'a birth place with valid coordinates and time zone';
  }
  return hasValidBirthDetails(record) ? '' : 'a valid birth date and time that is not in the future';
}

function personMessage(who: string, problem: string): string {
  if (problem === 'missing') {
    return `${who}: please fill in the date of birth, time of birth and birth place before checkout.`;
  }
  return `${who}: please enter ${problem} before checkout.`;
}

/**
 * A customer-facing reason the checkout cannot open yet, or '' when the
 * payload is complete. Safe to call with a half-filled form.
 */
export function checkoutPayloadProblem(serviceType: ServiceType | string, payload: unknown): string {
  const data = (payload && typeof payload === 'object' ? payload : {}) as AnyRecord;
  const type = String(serviceType || '').toUpperCase();

  if (type === 'MARRIAGE_COMPATIBILITY') {
    const bride = birthRecordProblem(data.bride);
    const groom = birthRecordProblem(data.groom);
    if (!bride && !groom) return '';
    const problems = [bride ? personMessage('Bride', bride) : '', groom ? personMessage('Groom', groom) : '']
      .filter(Boolean);
    return `Both partners need complete birth details. ${problems.join(' ')}`;
  }

  if (type === 'MUHURTHAM') {
    const birth = birthRecordProblem(data);
    if (birth) {
      return `${personMessage('Birth details', birth)} The ceremony place is needed as well.`;
    }
    if (!text(data.muhurthamPlace)) {
      return 'Muhurtham: please choose the ceremony place before checkout.';
    }
    if (!hasCoordinates(
      data.muhurthamLatitude,
      data.muhurthamLongitude,
      data.muhurthamTimezoneOffsetHours
    )) {
      return 'Muhurtham: please re-select the ceremony place so it has valid coordinates and a time zone.';
    }
    return '';
  }

  const birth = birthRecordProblem(data);
  return birth ? personMessage('Birth details', birth) : '';
}

/** True when the order can be calculated — the checkout may open. */
export function isCheckoutPayloadReady(serviceType: ServiceType | string, payload: unknown): boolean {
  return checkoutPayloadProblem(serviceType, payload) === '';
}
