import { LocationData } from '../data/worldwideLocations';
import { formatUtcOffset, getCurrentTimezoneOffset, getTimeZoneIdForCoordinates } from '../lib/timezone';

/**
 * The "Offset +05:30" line shown next to a picked location.
 *
 * Shared by the location picker and the (lazily loaded) map modal so the two
 * display paths cannot drift apart. It lives in its own module rather than in
 * GooglePlacesPicker because the map modal is loaded as a separate chunk and a
 * module that both are part of would drag Leaflet's importers back in.
 */
export const displayCurrentOffset = (location: LocationData): string => {
  const timeZoneId =
    location.timeZoneId ||
    getTimeZoneIdForCoordinates(location.latitude, location.longitude);
  const currentOffset = timeZoneId ? getCurrentTimezoneOffset(timeZoneId) : null;
  return formatUtcOffset(currentOffset ?? location.timezoneOffsetHours);
};
