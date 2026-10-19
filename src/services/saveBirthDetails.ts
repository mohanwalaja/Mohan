import type { LocationData } from '../data/worldwideLocations';
import type { CustomerBirthProfile, FamilyMember, FamilyRelation } from '../types';
import {
  isVerifiedBirthLocation,
  normalizePersonName,
  type SavedPerson
} from '../utils/birthDetails';

interface SaveBirthDetailsDependencies {
  saveFamilyMember: (member: Partial<FamilyMember> & { name: string }) => Promise<{ success: boolean }>;
  updateBirthProfile: (profile: Partial<CustomerBirthProfile>) => Promise<{ success: boolean }>;
}

interface SaveBirthDetailsInput extends SaveBirthDetailsDependencies {
  selectedPerson?: SavedPerson | null;
  relation?: FamilyRelation;
  name: string;
  dob: string;
  tob: string;
  location: LocationData | null | undefined;
  timezoneOffsetHours?: number | null;
  gender: 'M' | 'F';
}

/**
 * Save a service form's birth particulars only after the customer opts in.
 * An explicitly picked self updates the account profile; a picked family
 * member is updated in place; otherwise the details become a new family
 * member. Failures never interrupt an order.
 */
export async function saveBirthDetailsForNextTime({
  saveFamilyMember,
  updateBirthProfile,
  selectedPerson = null,
  relation = 'OTHER',
  name,
  dob,
  tob,
  location,
  timezoneOffsetHours,
  gender
}: SaveBirthDetailsInput): Promise<boolean> {
  const normalizedName = normalizePersonName(name);
  if (!normalizedName || !dob || !tob || !isVerifiedBirthLocation(location)) return false;

  const details = {
    name: normalizedName,
    dob,
    tob,
    birthPlace: location.placeName,
    country: location.country || '',
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
    timezoneOffsetHours: Number(timezoneOffsetHours ?? location.timezoneOffsetHours),
    gender
  };

  try {
    if (selectedPerson?.source === 'self') {
      return (await updateBirthProfile(details)).success;
    }

    const familyDetails: Partial<FamilyMember> & { name: string } = {
      ...details,
      timeZoneId: location.timeZoneId,
      ...(selectedPerson?.source === 'family'
        ? { id: selectedPerson.id, relation: selectedPerson.relation as FamilyRelation }
        : { relation })
    };
    return (await saveFamilyMember(familyDetails)).success;
  } catch {
    // Saving is a convenience; a save error must never block report checkout.
    return false;
  }
}
