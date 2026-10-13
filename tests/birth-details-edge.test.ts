import { hasValidBirthDetails } from '../src/lib/astrology/birthDetails';

let failures = 0;
const assert = (message: string, condition: boolean) => {
  if (condition) {
    console.log(`[PASS] ${message}`);
  } else {
    console.error(`[FAIL] ${message}`);
    failures++;
  }
};

const basePerson = {
  tob: '12:00',
  birthPlace: 'Chennai',
  latitude: 13.0827,
  longitude: 80.2707,
  timezoneOffsetHours: 5.5
};

console.log('\nBirth details edge cases (leap day / future date)');
assert('leap-day 2000-02-29 is accepted as a valid past birth date',
  hasValidBirthDetails({ ...basePerson, dob: '2000-02-29' }));

const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
const pad = (n: number) => String(n).padStart(2, '0');
const futureIso = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
assert('a future birth date is rejected',
  !hasValidBirthDetails({ ...basePerson, dob: futureIso }));

if (failures > 0) process.exit(1);
