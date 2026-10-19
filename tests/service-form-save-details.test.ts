/** Optional birth-detail saving on each public service form. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveBirthDetailsForNextTime } from '../src/services/saveBirthDetails';
import type { SavedPerson } from '../src/utils/birthDetails';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

const picker = read('src/components/common/SavedPersonPicker.tsx');
assert.match(picker, /if \(!user \|\| people\.length === 0\) return null/);
assert.doesNotMatch(picker, /No saved birth details yet|Who is Person 1\?/);

for (const page of ['BirthJathagamPage', 'MarriageCompatibilityPage', 'BabyNamingPage', 'MuhurthamPage']) {
  const source = read(`src/pages/${page}.tsx`);
  assert.match(source, /<SaveBirthDetailsOption/, `${page} must offer an optional save checkbox at the form bottom`);
  assert.match(source, /saveBirthDetailsForNextTime/, `${page} must persist the details when the checkbox is selected`);
  assert.match(source, /saveAsProfile, setSaveAsProfile/);
}

async function main() {
  const location = {
    placeName: 'Chennai, Tamil Nadu, India',
    country: 'India',
    latitude: 13.0827,
    longitude: 80.2707,
    timezoneOffsetHours: 5.5,
    timeZoneId: 'Asia/Kolkata'
  };
  const profileCalls: any[] = [];
  const familyCalls: any[] = [];
  const dependencies = {
    updateBirthProfile: async (profile: any) => {
      profileCalls.push(profile);
      return { success: true };
    },
    saveFamilyMember: async (member: any) => {
      familyCalls.push(member);
      return { success: true };
    }
  };
  const personDetails = {
    name: '  Ramesh   Chand ',
    dob: '1990-08-15',
    tob: '09:30',
    location,
    timezoneOffsetHours: 12,
    gender: 'M' as const
  };

  const self = { source: 'self', key: 'self', gender: 'M' } as SavedPerson;
  assert.equal(await saveBirthDetailsForNextTime({
    ...dependencies,
    ...personDetails,
    selectedPerson: self
  }), true);
  assert.equal(profileCalls.length, 1, 'picking Myself updates the account birth profile');
  assert.equal(familyCalls.length, 0, 'picking Myself does not create a family record');
  assert.equal(profileCalls[0].name, 'Ramesh Chand', 'saved names are normalized');

  const family = { source: 'family', key: 'fm_1', id: 'fm_1', relation: 'SPOUSE' } as SavedPerson;
  assert.equal(await saveBirthDetailsForNextTime({
    ...dependencies,
    ...personDetails,
    selectedPerson: family
  }), true);
  assert.equal(familyCalls.length, 1);
  assert.equal(familyCalls[0].id, 'fm_1', 'a picked family member is updated in place');
  assert.equal(familyCalls[0].relation, 'SPOUSE', 'the existing relationship is preserved');
  assert.equal(familyCalls[0].timeZoneId, 'Asia/Kolkata');

  assert.equal(await saveBirthDetailsForNextTime({
    ...dependencies,
    ...personDetails,
    relation: 'CHILD',
    selectedPerson: null
  }), true);
  assert.equal(familyCalls.length, 2);
  assert.equal(familyCalls[1].relation, 'CHILD', 'new details are saved with the selected relationship');
  assert.equal(familyCalls[1].id, undefined, 'new details create a new family member');

  assert.equal(await saveBirthDetailsForNextTime({
    ...dependencies,
    ...personDetails,
    location: null,
    selectedPerson: null
  }), false, 'incomplete details are never saved');
  assert.equal(familyCalls.length, 2);

  console.log('  [PASS] each service form offers opt-in saving, and self/family/new records are saved to the correct place.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
