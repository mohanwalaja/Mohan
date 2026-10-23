import React, { Suspense, lazy, useState, useEffect, useMemo, useRef, useId } from 'react';
import {
  MapPin,
  Search,
  Crosshair,
  Check,
  Globe,
  Map as MapIcon,
  X,
  Loader2,
  ArrowRight,
  Compass,
  Clock,
  ChevronDown
} from 'lucide-react';
import {
  WORLDWIDE_LOCATIONS,
  POPULAR_QUICK_PLACES,
  estimateTimezoneOffset,
  findNearestWorldwideLocation,
  parseCoordinatesFromInput,
  readRecentPlaces,
  rememberRecentPlace,
  searchWorldwideLocations,
  LocationData
} from '../../data/worldwideLocations';
import { getTimeZoneIdForCoordinates } from '../../lib/timezone';
import { isVerifiedBirthLocation } from '../../utils/birthDetails';
import { displayCurrentOffset } from '../../utils/locationDisplay';
import { api } from '../../services/api';

export type { LocationData };

/**
 * The interactive map is a DEFERRED feature (audit PERF-1): Leaflet's JS and
 * CSS are ~165 KB and this component is rendered inside the app shell (the
 * checkout and every report form import it), so a static import here made the
 * map library part of the initial download for visitors who never opened a
 * map. The modal carries the Leaflet import and is fetched the first time a
 * visitor asks for the map; the spinner below is what they see while it does.
 */
const LeafletMapPickerModal = lazy(() =>
  import('./LeafletMapPickerModal').then((m) => ({ default: m.LeafletMapPickerModal }))
);

/** Overlay shown for the moment the map chunk is being fetched. */
function MapPickerLoadingFallback() {
  return (
    <div className="fixed inset-0 z-[9995] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-md">
      <div
        role="status"
        aria-label="Loading map"
        className="flex flex-col items-center gap-3 rounded-3xl border border-slate-700 bg-slate-900 px-8 py-6 shadow-2xl"
      >
        <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
        <p className="text-xs font-bold text-slate-200">Loading interactive map…</p>
      </div>
    </div>
  );
}

interface GooglePlacesPickerProps {
  value?: LocationData | null;
  onChange: (location: LocationData | null) => void;
  label?: string;
  required?: boolean;
  placeholder?: string;
}

/** Default map starting point when nothing has been picked yet. */
const DEFAULT_MAP_LOCATION: LocationData = {
  placeName: 'Chennai, Tamil Nadu, India',
  country: 'India',
  latitude: 13.0827,
  longitude: 80.2707,
  timezoneOffsetHours: 5.5,
  timeZoneId: 'Asia/Kolkata'
};

function mergeLocationCandidates(localList: LocationData[], onlineList: LocationData[]): LocationData[] {
  const merged: LocationData[] = [];
  const addUnique = (candidate: LocationData) => {
    if (!candidate?.placeName?.trim()) return;
    const lower = candidate.placeName.trim().toLowerCase();
    const duplicate = merged.some(existing => {
      if (existing.placeName.trim().toLowerCase() === lower) return true;
      const dLat = Math.abs(existing.latitude - candidate.latitude);
      const dLng = Math.abs(existing.longitude - candidate.longitude);
      return dLat < 0.015 && dLng < 0.015 && existing.placeName.split(',')[0].trim().toLowerCase() === candidate.placeName.split(',')[0].trim().toLowerCase();
    });
    if (!duplicate) merged.push(candidate);
  };

  // Interleave top instant atlas hits with exact street/village geocoder hits
  for (const item of localList.slice(0, 4)) addUnique(item);
  for (const item of onlineList) addUnique(item);
  for (const item of localList.slice(4)) addUnique(item);
  return merged.slice(0, 12);
}

export const GooglePlacesPicker: React.FC<GooglePlacesPickerProps> = ({
  value,
  onChange,
  label = 'Birth Place (Global Location)',
  required = false,
  placeholder = 'Search city, village, area, country, or paste coordinates / map link...'
}) => {
  const inputId = `location-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const listboxId = `${inputId}-listbox`;
  const [query, setQuery] = useState(value?.placeName || '');
  const previousSelectedPlace = useRef(value?.placeName || '');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [isLocating, setIsLocating] = useState(false);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [onlineResults, setOnlineResults] = useState<LocationData[]>([]);
  const [gpsError, setGpsError] = useState<string>('');
  const [recentPlaces, setRecentPlaces] = useState<LocationData[]>(() => readRecentPlaces());

  // Secondary helper drawers: 'browse' (Country → State → City → Area) or 'coords' (Manual Lat/Lng)
  const [helperDrawer, setHelperDrawer] = useState<'none' | 'browse' | 'coords'>('none');
  const [selectedCountryIdx, setSelectedCountryIdx] = useState<number>(0);
  const [selectedStateIdx, setSelectedStateIdx] = useState<number>(0);
  const [selectedCityIdx, setSelectedCityIdx] = useState<number>(-1);
  const [selectedArea, setSelectedArea] = useState<string>('');

  const [manualName, setManualName] = useState<string>('');
  const [manualCountry, setManualCountry] = useState<string>('');
  const [manualLat, setManualLat] = useState<string>('');
  const [manualLng, setManualLng] = useState<string>('');
  const [manualError, setManualError] = useState<string>('');

  // Map Modal — only mounted (and only then downloaded) while it is open.
  const [mapRequest, setMapRequest] = useState<{ location: LocationData; query: string } | null>(null);

  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Instant (<1ms) offline atlas + coordinate/URL search
  const localResults = useMemo(() => {
    const clean = query.trim();
    if (!clean || value?.placeName === query) return [];
    return searchWorldwideLocations(clean, 10);
  }, [query, value?.placeName]);

  const combinedResults = useMemo(
    () => mergeLocationCandidates(localResults, onlineResults),
    [localResults, onlineResults]
  );

  // Sync saved/selected values while keeping an in-progress search editable.
  useEffect(() => {
    const selectedPlace = value?.placeName || '';
    if (selectedPlace && selectedPlace !== query) {
      setQuery(selectedPlace);
    } else if (!selectedPlace && previousSelectedPlace.current && query === previousSelectedPlace.current) {
      setQuery('');
    }
    previousSelectedPlace.current = selectedPlace;
  }, [value?.placeName, query]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Worldwide Multi-Engine Geocoding Search (Server Cache Proxy -> Photon -> Nominatim)
  useEffect(() => {
    const cleanQ = query.trim();
    if (cleanQ.length < 2 || value?.placeName === query || parseCoordinatesFromInput(cleanQ)) {
      setOnlineResults([]);
      setIsSearchingOnline(false);
      return;
    }

    const abortController = new AbortController();
    let isCurrentSearch = true;

    const timer = setTimeout(async () => {
      setIsSearchingOnline(true);

      const fetchWithTimeout = async (url: string, ms = 3200): Promise<Response> => {
        const inner = new AbortController();
        const onAbort = () => inner.abort();
        abortController.signal.addEventListener('abort', onAbort, { once: true });
        const timeoutId = setTimeout(() => inner.abort(), ms);
        try {
          return await fetch(url, { signal: inner.signal });
        } finally {
          clearTimeout(timeoutId);
          abortController.signal.removeEventListener('abort', onAbort);
        }
      };

      try {
        let results: LocationData[] = [];

        // 1. Server-assisted cached geocoder (avoids browser User-Agent blocks & caches common towns)
        const serverRes = await api.searchLocations(cleanQ, abortController.signal);
        if (serverRes.success && Array.isArray(serverRes.results) && serverRes.results.length > 0) {
          results = serverRes.results.map((item: any) => ({
            placeName: String(item.placeName || cleanQ),
            country: String(item.country || 'Global'),
            latitude: Number(Number(item.latitude).toFixed(4)),
            longitude: Number(Number(item.longitude).toFixed(4)),
            timezoneOffsetHours: Number.isFinite(Number(item.timezoneOffsetHours))
              ? Number(item.timezoneOffsetHours)
              : estimateTimezoneOffset(Number(item.latitude), Number(item.longitude), String(item.country || '')),
            timeZoneId: item.timeZoneId || getTimeZoneIdForCoordinates(Number(item.latitude), Number(item.longitude)) || undefined,
            state: item.state || undefined,
            city: item.city || undefined
          }));
        }

        // 2. Direct client fallback: Photon Komoot
        if (results.length === 0 && !abortController.signal.aborted) {
          try {
            const photonRes = await fetchWithTimeout(
              `https://photon.komoot.io/api/?q=${encodeURIComponent(cleanQ)}&limit=8`
            );
            if (photonRes.ok) {
              const pData = await photonRes.json();
              if (pData.features && pData.features.length > 0) {
                results = pData.features.map((feat: any) => {
                  const props = feat.properties || {};
                  const coords = feat.geometry.coordinates;
                  const lng = Number(coords[0].toFixed(4));
                  const lat = Number(coords[1].toFixed(4));
                  const name = props.name || '';
                  const city = props.city || props.town || props.village || props.district || '';
                  const state = props.state || '';
                  const country = props.country || 'Global';

                  const parts: string[] = [];
                  if (name) parts.push(name);
                  if (city && city !== name) parts.push(city);
                  if (state && state !== name && state !== city) parts.push(state);
                  if (country && country !== 'Global' && !parts.includes(country)) parts.push(country);

                  const placeName = parts.length > 0 ? parts.join(', ') : props.name || cleanQ;
                  const tz = estimateTimezoneOffset(lat, lng, country);

                  return {
                    placeName,
                    country,
                    latitude: lat,
                    longitude: lng,
                    timezoneOffsetHours: tz,
                    timeZoneId: getTimeZoneIdForCoordinates(lat, lng) ?? undefined,
                    state: state || undefined,
                    city: city || name || undefined
                  };
                });
              }
            }
          } catch {
            /* fall through cleanly to Nominatim */
          }
        }

        // 3. Secondary client fallback: OpenStreetMap Nominatim
        if (results.length === 0 && !abortController.signal.aborted) {
          try {
            const nomRes = await fetchWithTimeout(
              `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
                cleanQ
              )}&format=json&addressdetails=1&limit=6`
            );
            if (nomRes.ok) {
              const nData = await nomRes.json();
              results = nData.map((item: any) => {
                const lat = Number(parseFloat(item.lat).toFixed(4));
                const lng = Number(parseFloat(item.lon).toFixed(4));
                const addr = item.address || {};
                const locality =
                  addr.village ||
                  addr.suburb ||
                  addr.neighbourhood ||
                  addr.town ||
                  addr.city ||
                  addr.county ||
                  item.name;
                const state = addr.state || '';
                const country = addr.country || 'Global';
                const nameParts = [locality, state, country].filter(Boolean).join(', ');
                const tz = estimateTimezoneOffset(lat, lng, country);

                return {
                  placeName: nameParts || item.display_name.split(',').slice(0, 3).join(', '),
                  country,
                  latitude: lat,
                  longitude: lng,
                  timezoneOffsetHours: tz,
                  timeZoneId: getTimeZoneIdForCoordinates(lat, lng) ?? undefined,
                  state: state || undefined,
                  city: locality || undefined
                };
              });
            }
          } catch {
            /* instant local atlas results remain immediately selectable */
          }
        }

        if (isCurrentSearch && !abortController.signal.aborted) {
          setOnlineResults(results);
        }
      } finally {
        if (isCurrentSearch && !abortController.signal.aborted) {
          setIsSearchingOnline(false);
        }
      }
    }, 180);

    return () => {
      isCurrentSearch = false;
      clearTimeout(timer);
      abortController.abort();
    };
  }, [query, value?.placeName]);

  const handleSelectResult = (loc: LocationData) => {
    setQuery(loc.placeName);
    setGpsError('');
    setManualError('');
    rememberRecentPlace(loc);
    setRecentPlaces(readRecentPlaces());
    onChange(loc);
    setIsOpen(false);
    setActiveIndex(-1);
    setHelperDrawer('none');
  };

  // Keyboard navigation so ArrowDown / ArrowUp / Enter / Escape feel native & never submit incomplete forms
  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      if (!isOpen) setIsOpen(true);
      if (combinedResults.length > 0) {
        event.preventDefault();
        setActiveIndex(prev => (prev + 1) % combinedResults.length);
      }
      return;
    }
    if (event.key === 'ArrowUp') {
      if (combinedResults.length > 0) {
        event.preventDefault();
        setActiveIndex(prev => (prev <= 0 ? combinedResults.length - 1 : prev - 1));
      }
      return;
    }
    if (event.key === 'Enter' && !isVerifiedBirthLocation(value)) {
      if (combinedResults.length > 0) {
        event.preventDefault();
        const chosen = combinedResults[activeIndex >= 0 ? activeIndex : 0];
        if (chosen) handleSelectResult(chosen);
      }
      return;
    }
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  // GPS Auto-Detect
  const handleUseCurrentLocation = () => {
    setGpsError('');
    if (!navigator.geolocation) {
      setGpsError('Browser GPS is not available on this device. Search your town above, use Browse, or tap Map Pinpoint.');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lng = Number(pos.coords.longitude.toFixed(4));
        const nearest = findNearestWorldwideLocation(lat, lng);
        let detectedPlaceName = nearest ? nearest.placeName : `GPS Location (${lat}, ${lng})`;
        let detectedCountry = nearest?.country || 'Detected Location';
        let detectedState = nearest?.state || '';
        let detectedCity = nearest?.city || '';

        try {
          const rev = await api.reverseGeocode(lat, lng);
          if (rev.success && rev.location?.placeName) {
            detectedPlaceName = rev.location.placeName;
            detectedCountry = rev.location.country || detectedCountry;
            detectedState = rev.location.state || detectedState;
            detectedCity = rev.location.city || detectedCity;
          } else {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
            );
            if (res.ok) {
              const data = await res.json();
              const addr = data.address || {};
              detectedCity =
                addr.village || addr.suburb || addr.town || addr.city || addr.county || detectedCity;
              detectedState = addr.state || detectedState;
              detectedCountry = addr.country || detectedCountry;
              if (detectedCity || detectedState) {
                detectedPlaceName = [detectedCity, detectedState, detectedCountry].filter(Boolean).join(', ');
              }
            }
          }
        } catch {
          /* nearest offline atlas match already fills city/country cleanly */
        }

        const tzHours = estimateTimezoneOffset(lat, lng, detectedCountry);
        const detectedLocation: LocationData = {
          placeName: detectedPlaceName,
          country: detectedCountry,
          latitude: lat,
          longitude: lng,
          timezoneOffsetHours: tzHours,
          timeZoneId: getTimeZoneIdForCoordinates(lat, lng) ?? undefined,
          state: detectedState || undefined,
          city: detectedCity || undefined
        };

        handleSelectResult(detectedLocation);
        setIsLocating(false);
      },
      () => {
        setIsLocating(false);
        setGpsError('Location permission denied or unavailable. Type your birthplace above, use Browse, or tap Map Pinpoint.');
      }
    );
  };

  // Open Interactive Map Modal — the Leaflet modal itself is a lazy chunk
  const openMapPicker = () => {
    setMapRequest({
      location:
        value && value.latitude !== undefined && value.placeName
          ? value
          : combinedResults[0] || DEFAULT_MAP_LOCATION,
      query: query.trim()
    });
    setIsOpen(false);
  };

  const handleMapConfirmed = (location: LocationData) => {
    handleSelectResult(location);
    setMapRequest(null);
  };

  // Country -> State -> City -> Area Browser
  const activeCountry = WORLDWIDE_LOCATIONS[selectedCountryIdx] || WORLDWIDE_LOCATIONS[0];
  const activeState = activeCountry?.states[selectedStateIdx] || activeCountry?.states[0];
  const activeCity = selectedCityIdx >= 0 ? activeState?.cities[selectedCityIdx] : undefined;

  const confirmBrowsedLocation = (cityIndex: number, areaName = '') => {
    const cityObj = activeState?.cities[cityIndex];
    if (!activeCountry || !activeState || !cityObj) return;
    const lat = Number(cityObj.latitude.toFixed(4));
    const lng = Number(cityObj.longitude.toFixed(4));
    const tzId = getTimeZoneIdForCoordinates(lat, lng) ?? undefined;
    const tz = estimateTimezoneOffset(lat, lng, activeCountry.name);
    const fullName = areaName
      ? `${areaName}, ${cityObj.name}, ${activeState.name}, ${activeCountry.name}`
      : `${cityObj.name}, ${activeState.name}, ${activeCountry.name}`;

    handleSelectResult({
      placeName: fullName,
      country: activeCountry.name,
      latitude: lat,
      longitude: lng,
      timezoneOffsetHours: tz,
      timeZoneId: tzId,
      state: activeState.name,
      city: cityObj.name,
      area: areaName || undefined
    });
  };

  // Manual Coordinates Apply
  const handleApplyManualCoords = () => {
    const lat = Number(manualLat);
    const lng = Number(manualLng);
    if (!Number.isFinite(lat) || Math.abs(lat) > 90) {
      setManualError('Latitude must be a number between -90 and 90 (e.g. 13.0827).');
      return;
    }
    if (!Number.isFinite(lng) || Math.abs(lng) > 180) {
      setManualError('Longitude must be a number between -180 and 180 (e.g. 80.2707).');
      return;
    }
    const rLat = Number(lat.toFixed(4));
    const rLng = Number(lng.toFixed(4));
    const nearest = findNearestWorldwideLocation(rLat, rLng);
    const country = manualCountry.trim() || nearest?.country || 'Global';
    const placeName = manualName.trim()
      ? `${manualName.trim()}${manualCountry.trim() ? `, ${manualCountry.trim()}` : ''}`
      : nearest
        ? `${nearest.placeName} (${rLat}°, ${rLng}°)`
        : `Coordinates (${rLat}°, ${rLng}°)`;
    const tzId = getTimeZoneIdForCoordinates(rLat, rLng) ?? undefined;
    const tz = estimateTimezoneOffset(rLat, rLng, country);

    handleSelectResult({
      placeName,
      country,
      latitude: rLat,
      longitude: rLng,
      timezoneOffsetHours: tz,
      timeZoneId: tzId,
      state: nearest?.state,
      city: manualName.trim() || nearest?.city
    });
  };

  const isLocationVerified = isVerifiedBirthLocation(value);
  const showQuickDiscovery = isOpen && query.trim().length < 2 && combinedResults.length === 0;
  const topUnconfirmedCandidate = !isLocationVerified && query.trim().length >= 2 ? combinedResults[0] : null;

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* Top Header Bar with Multi-Mode Quick Actions */}
      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1.5">
        <label htmlFor={inputId} className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span>{label}</span> {required && <span className="text-rose-500">*</span>}
        </label>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              setHelperDrawer(cur => (cur === 'browse' ? 'none' : 'browse'));
            }}
            className={`text-[11px] font-bold flex items-center gap-1 px-2.5 py-1 rounded-xl border transition-all shadow-xs cursor-pointer active:scale-95 ${
              helperDrawer === 'browse'
                ? 'bg-amber-500 text-slate-950 border-amber-500 font-black'
                : 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border-emerald-200/80 dark:border-emerald-800/80'
            }`}
            title="Select Country → State → City step by step"
          >
            <Globe className="w-3 h-3" />
            <span>Browse</span>
            <ChevronDown className="w-2.5 h-2.5" />
          </button>

          <button
            type="button"
            onClick={openMapPicker}
            className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 px-2.5 py-1 rounded-xl border border-indigo-200/80 dark:border-indigo-800/80 transition-all shadow-xs cursor-pointer active:scale-95"
            title="Pick location directly on Interactive Map"
          >
            <MapIcon className="w-3 h-3 text-indigo-500" />
            <span>Map Pinpoint</span>
          </button>

          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isLocating}
            className="text-[11px] font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 px-2.5 py-1 rounded-xl border border-amber-200/80 dark:border-amber-800/80 transition-all shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
            title="Detect current device GPS"
          >
            <Crosshair className={`w-3 h-3 ${isLocating ? 'animate-spin text-amber-500' : 'text-amber-600 dark:text-amber-400'}`} />
            <span>{isLocating ? 'Locating...' : 'GPS Auto'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              if (value) {
                setManualName(value.city || value.placeName.split(',')[0] || '');
                setManualCountry(value.country || '');
                setManualLat(String(value.latitude));
                setManualLng(String(value.longitude));
              }
              setHelperDrawer(cur => (cur === 'coords' ? 'none' : 'coords'));
            }}
            className={`text-[11px] font-bold flex items-center gap-1 px-2 py-1 rounded-xl border transition-all shadow-xs cursor-pointer active:scale-95 ${
              helperDrawer === 'coords'
                ? 'bg-amber-500 text-slate-950 border-amber-500 font-black'
                : 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-800 border-slate-300/80 dark:border-slate-700'
            }`}
            title="Enter exact Latitude & Longitude manually"
          >
            <Compass className="w-3 h-3" />
            <span>Coords</span>
          </button>
        </div>
      </div>

      {/* Global Quick Search Input Box */}
      <div className="relative">
        <div className="relative flex items-center bg-white dark:bg-slate-900/90 border border-slate-300 dark:border-slate-700 hover:border-amber-500/60 dark:hover:border-amber-500/50 focus-within:border-amber-500 dark:focus-within:border-amber-400 focus-within:ring-4 focus-within:ring-amber-500/15 rounded-2xl shadow-xs transition-all duration-200 overflow-hidden">
          <div className="pl-3.5 pr-2 text-slate-400 pointer-events-none">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500" />
          </div>

          <input
            id={inputId}
            type="text"
            role="combobox"
            aria-expanded={isOpen}
            aria-controls={listboxId}
            aria-autocomplete="list"
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="words"
            spellCheck="false"
            value={query}
            onKeyDown={handleInputKeyDown}
            onChange={e => {
              const nextQuery = e.target.value;
              setQuery(nextQuery);
              setActiveIndex(0);
              setGpsError('');
              if (value?.placeName && nextQuery !== value.placeName) onChange(null);
              setIsOpen(true);
            }}
            onFocus={() => {
              setRecentPlaces(readRecentPlaces());
              setIsOpen(true);
            }}
            placeholder={placeholder}
            className="w-full py-3.5 pr-24 bg-transparent text-slate-900 dark:text-white text-base sm:text-sm font-semibold placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none touch-manipulation"
          />

          {/* Right Status / Quick Actions */}
          <div className="absolute right-3 flex items-center gap-1.5">
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setOnlineResults([]);
                  setActiveIndex(-1);
                  setIsOpen(true);
                  if (value) onChange(null);
                }}
                aria-label={`Clear ${label}`}
                className="w-6 h-6 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
                title="Clear input"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {isSearchingOnline ? (
              <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
            ) : isLocationVerified ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10.5px] font-black bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 shadow-xs">
                <Check className="w-3 h-3 stroke-[3]" /> Mapped
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Inline non-blocking GPS notice */}
      {gpsError && (
        <p className="mt-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300" role="status">
          ⚠ {gpsError}
        </p>
      )}

      {/* 1-Tap Unconfirmed Text Guard: catches visitors who typed a city and clicked outside without picking from the dropdown */}
      {!isOpen && topUnconfirmedCandidate && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/50 bg-amber-50/90 dark:bg-amber-950/40 px-3 py-2 text-xs">
          <span className="font-semibold text-amber-900 dark:text-amber-200">
            Did you mean <strong>{topUnconfirmedCandidate.placeName}</strong>?
          </span>
          <button
            type="button"
            onClick={() => handleSelectResult(topUnconfirmedCandidate)}
            className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[11px] cursor-pointer transition-all"
          >
            ✓ Confirm Location ({displayCurrentOffset(topUnconfirmedCandidate)})
          </button>
        </div>
      )}

      {/* Drawer A: Step-by-Step Country -> State -> City -> Area Browser */}
      {helperDrawer === 'browse' && (
        <div className="mt-2.5 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/95 dark:bg-slate-900/95 space-y-3 shadow-md animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Browse Worldwide Birthplaces (Offline Instant Directory)
            </span>
            <button
              type="button"
              onClick={() => setHelperDrawer('none')}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white cursor-pointer"
            >
              Close ✕
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select
              aria-label={`${label} country`}
              value={selectedCountryIdx}
              onChange={e => {
                setSelectedCountryIdx(Number(e.target.value));
                setSelectedStateIdx(0);
                setSelectedCityIdx(-1);
                setSelectedArea('');
              }}
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs font-semibold text-slate-900 dark:text-white cursor-pointer"
            >
              {WORLDWIDE_LOCATIONS.map((country, idx) => (
                <option key={country.code} value={idx}>
                  {country.name}
                </option>
              ))}
            </select>

            <select
              aria-label={`${label} state or region`}
              value={selectedStateIdx}
              onChange={e => {
                setSelectedStateIdx(Number(e.target.value));
                setSelectedCityIdx(-1);
                setSelectedArea('');
              }}
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs font-semibold text-slate-900 dark:text-white cursor-pointer"
            >
              {(activeCountry?.states || []).map((st, idx) => (
                <option key={st.name} value={idx}>
                  {st.name}
                </option>
              ))}
            </select>

            <select
              aria-label={`${label} city or district`}
              value={selectedCityIdx}
              onChange={e => {
                const idx = Number(e.target.value);
                setSelectedCityIdx(idx);
                setSelectedArea('');
                if (idx >= 0) confirmBrowsedLocation(idx, '');
              }}
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs font-semibold text-slate-900 dark:text-white cursor-pointer"
            >
              <option value={-1}>Select City / District…</option>
              {(activeState?.cities || []).map((city, idx) => (
                <option key={city.name} value={idx}>
                  {city.name}
                </option>
              ))}
            </select>
          </div>

          {activeCity && activeCity.popularAreas && activeCity.popularAreas.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                Optional sub-area / taluk / temple near {activeCity.name}:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activeCity.popularAreas.map(area => (
                  <button
                    key={area}
                    type="button"
                    onClick={() => {
                      setSelectedArea(area);
                      confirmBrowsedLocation(selectedCityIdx, area);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer transition-all ${
                      selectedArea === area
                        ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                        : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-amber-400'
                    }`}
                  >
                    {area}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Drawer B: Direct Coordinates Entry (Hospital record / Panchangam Lat-Lng) */}
      {helperDrawer === 'coords' && (
        <div className="mt-2.5 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/95 dark:bg-slate-900/95 space-y-2.5 shadow-md animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Enter Exact Coordinates (Auto Timezone Lookup)
            </span>
            <button
              type="button"
              onClick={() => setHelperDrawer('none')}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white cursor-pointer"
            >
              Close ✕
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              value={manualName}
              onChange={e => setManualName(e.target.value)}
              placeholder="Village / Hospital / Town label (optional)"
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white"
            />
            <input
              type="text"
              value={manualCountry}
              onChange={e => setManualCountry(e.target.value)}
              placeholder="Country (optional, auto-detected)"
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white"
            />
            <input
              type="text"
              inputMode="decimal"
              value={manualLat}
              onChange={e => setManualLat(e.target.value)}
              placeholder="Latitude (e.g. 13.0827 or -33.8688)"
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono font-semibold text-slate-900 dark:text-white"
            />
            <input
              type="text"
              inputMode="decimal"
              value={manualLng}
              onChange={e => setManualLng(e.target.value)}
              placeholder="Longitude (e.g. 80.2707 or -79.3832)"
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono font-semibold text-slate-900 dark:text-white"
            />
          </div>

          {manualError && (
            <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{manualError}</p>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleApplyManualCoords}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black cursor-pointer transition-all"
            >
              ✓ Use Coordinates &amp; Auto-Resolve Timezone
            </button>
          </div>
        </div>
      )}

      {/* Modern Verified Location Coordinates Card */}
      {isLocationVerified && (
        <div className="verified-location-card mt-2.5 p-3.5 bg-gradient-to-r from-amber-50/70 via-slate-50 to-white dark:from-slate-800/80 dark:via-slate-900/90 dark:to-slate-900 border border-amber-500/30 dark:border-amber-500/20 rounded-2xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-start gap-x-1.5 gap-y-1 text-xs font-bold text-slate-900 dark:text-white">
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{value.placeName}</span>
                {value.country && (
                  <span className="shrink-0 px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-400 font-medium">
                    {value.country}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5 flex-wrap font-mono">
                <span>Lat: <strong>{value.latitude}°</strong></span>
                <span>•</span>
                <span>Long: <strong>{value.longitude}°</strong></span>
                <span>•</span>
                <span className="text-amber-600 dark:text-amber-400 font-sans font-semibold">
                  Offset: {displayCurrentOffset(value)}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={openMapPicker}
            className="text-[11px] text-amber-700 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 font-bold shrink-0 self-start sm:self-center flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 rounded-xl border border-amber-500/20 transition-all cursor-pointer"
          >
            <span>Adjust on Map</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Quick Discovery Strip on Focus Before Typing (Recent + Popular Hubs) */}
      {showQuickDiscovery && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-1.5 bg-white/98 dark:bg-slate-900/98 backdrop-blur-xl border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-3.5 space-y-3 animate-in fade-in slide-in-from-top-1 duration-150 max-h-[340px] overflow-y-auto"
        >
          {recentPlaces.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10.5px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                <Clock className="w-3 h-3" />
                <span>Recently Selected in This Session (1-Tap Reuse)</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recentPlaces.map((loc, idx) => (
                  <button
                    key={`recent-${idx}`}
                    type="button"
                    onClick={() => handleSelectResult(loc)}
                    className="px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-900 dark:text-emerald-200 cursor-pointer transition-all"
                  >
                    📍 {loc.city || loc.placeName.split(',')[0]}
                    {loc.country ? ` (${loc.country})` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10.5px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
              <span>Quick Pick Major Cities — or Start Typing Any Village / Pincode</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white normal-case font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {POPULAR_QUICK_PLACES.map((loc, idx) => (
                <button
                  key={`pop-${idx}`}
                  type="button"
                  onClick={() => handleSelectResult(loc)}
                  className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800/90 hover:bg-amber-500 hover:text-slate-950 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-800 dark:text-slate-200 cursor-pointer transition-all"
                >
                  {loc.city?.split('(')[0].trim() || loc.placeName.split(',')[0]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Worldwide Instant + Online Results Dropdown Panel */}
      {isOpen && !showQuickDiscovery && (query.trim().length >= 1 || combinedResults.length > 0) && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-1.5 bg-white/98 dark:bg-slate-900/98 backdrop-blur-xl border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 animate-in fade-in slide-in-from-top-1 duration-150 max-h-[340px] overflow-y-auto"
        >
          <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950/70 flex items-center justify-between text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" />
              <span>Worldwide Matching Places ({combinedResults.length})</span>
            </span>
            {isSearchingOnline ? (
              <span className="text-[10.5px] text-slate-400 lowercase font-normal flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin text-amber-500" /> enriching villages...
              </span>
            ) : (
              <span className="hidden sm:inline text-[10px] font-medium normal-case text-slate-400">
                ↑↓ / Enter to select
              </span>
            )}
          </div>

          {combinedResults.length > 0 ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {combinedResults.map((loc, idx) => {
                const highlighted = idx === activeIndex;
                return (
                  <button
                    key={`res-${idx}-${loc.latitude}-${loc.longitude}`}
                    type="button"
                    role="option"
                    aria-selected={value?.placeName === loc.placeName || highlighted}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => handleSelectResult(loc)}
                    className={`w-full text-left px-4 py-3 flex items-center justify-between transition-colors group cursor-pointer ${
                      highlighted
                        ? 'bg-amber-500/15 dark:bg-amber-500/20'
                        : 'hover:bg-amber-500/10 dark:hover:bg-amber-500/15'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 truncate">
                          {loc.placeName}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {loc.country} • Lat: {loc.latitude}° • Lng: {loc.longitude}° • Offset {displayCurrentOffset(loc)}
                        </div>
                      </div>
                    </div>
                    {value?.placeName === loc.placeName && (
                      <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 ml-2 shadow-xs">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : !isSearchingOnline ? (
            <div className="text-center py-6 px-4 space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                No matching place found for &ldquo;{query}&rdquo;.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={openMapPicker}
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-md transition-all cursor-pointer active:scale-95"
                >
                  <MapIcon className="w-3.5 h-3.5" />
                  <span>Pinpoint Exact Village on Map</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setManualName(query.trim());
                    setIsOpen(false);
                    setHelperDrawer('coords');
                  }}
                  className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>Enter Coordinates</span>
                </button>
              </div>
            </div>
          ) : null}

          {/* Quick Footer */}
          <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950/70 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <button
              type="button"
              onClick={openMapPicker}
              className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-bold cursor-pointer"
            >
              <MapIcon className="w-3.5 h-3.5" /> Pick Exact Village on Map
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-semibold cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Fullscreen Interactive Leaflet Map Modal — a lazy chunk (see the
          lazy() wrapper above), mounted only while the visitor has it open. */}
      {mapRequest && (
        <Suspense fallback={<MapPickerLoadingFallback />}>
          <LeafletMapPickerModal
            initialLocation={mapRequest.location}
            initialQuery={mapRequest.query}
            onConfirm={handleMapConfirmed}
            onClose={() => setMapRequest(null)}
          />
        </Suspense>
      )}
    </div>
  );
};
