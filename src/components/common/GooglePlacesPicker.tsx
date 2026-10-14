import React, { Suspense, lazy, useState, useEffect, useRef, useId } from 'react';
import {
  MapPin,
  Search,
  Crosshair,
  Check,
  Globe,
  Map as MapIcon,
  X,
  Loader2,
  Sparkles,
  ArrowRight,
  Compass,
  Navigation
} from 'lucide-react';
import {
  estimateTimezoneOffset,
  LocationData
} from '../../data/worldwideLocations';
import { getTimeZoneIdForCoordinates } from '../../lib/timezone';
import { isVerifiedBirthLocation } from '../../utils/birthDetails';
import { displayCurrentOffset } from '../../utils/locationDisplay';

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-md">
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

export const GooglePlacesPicker: React.FC<GooglePlacesPickerProps> = ({
  value,
  onChange,
  label = 'Birth Place (Global Location)',
  required = false
}) => {
  const inputId = `location-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [query, setQuery] = useState(value?.placeName || '');
  const previousSelectedPlace = useRef(value?.placeName || '');
  const [isOpen, setIsOpen] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [onlineResults, setOnlineResults] = useState<LocationData[]>([]);

  // Map Modal — only mounted (and only then downloaded) while it is open.
  const [mapRequest, setMapRequest] = useState<{ location: LocationData; query: string } | null>(null);

  const dropdownRef = useRef<HTMLDivElement | null>(null);

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
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Worldwide Multi-Engine Geocoding Search
  useEffect(() => {
    if (!query || query.trim().length < 2 || value?.placeName === query) {
      setOnlineResults([]);
      setIsSearchingOnline(false);
      return;
    }

    let isCurrentSearch = true;
    const timer = setTimeout(async () => {
      setIsSearchingOnline(true);
      const cleanQ = query.trim();

      try {
        // 1. First search in Photon Komoot
        const photonRes = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(cleanQ)}&limit=8`
        );
        
        let results: LocationData[] = [];

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

        // 2. Fallback to OpenStreetMap Nominatim
        if (results.length === 0) {
          const nomRes = await fetch(
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
        }

        if (isCurrentSearch) setOnlineResults(results);
      } catch (err) {
        if (isCurrentSearch) console.warn('Geocoding search warning:', err);
      } finally {
        if (isCurrentSearch) setIsSearchingOnline(false);
      }
    }, 250);

    return () => {
      isCurrentSearch = false;
      clearTimeout(timer);
    };
  }, [query, isOpen, value?.placeName]);

  const handleSelectResult = (loc: LocationData) => {
    setQuery(loc.placeName);
    onChange(loc);
    setIsOpen(false);
  };

  // GPS Auto-Detect
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lng = Number(pos.coords.longitude.toFixed(4));
        let detectedPlaceName = `GPS Location (${lat}, ${lng})`;
        let detectedCountry = 'Detected Location';
        let detectedState = '';
        let detectedCity = '';

        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
          );
          if (res.ok) {
            const data = await res.json();
            const addr = data.address || {};
            detectedCity =
              addr.village || addr.suburb || addr.town || addr.city || addr.county || '';
            detectedState = addr.state || '';
            detectedCountry = addr.country || 'Detected Location';
            if (detectedCity || detectedState) {
              detectedPlaceName = [detectedCity, detectedState, detectedCountry].filter(Boolean).join(', ');
            }
          }
        } catch (e) {
          console.warn('Reverse geocode error:', e);
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

        setQuery(detectedLocation.placeName);
        onChange(detectedLocation);
        setIsLocating(false);
        setIsOpen(false);
      },
      err => {
        console.warn('Geolocation error:', err);
        setIsLocating(false);
        alert('Could not automatically determine GPS location. Please type your location in the search box or select on Map.');
      }
    );
  };

  // Open Interactive Map Modal — the Leaflet modal itself is a lazy chunk, so
  // this only records what the map should open on. Nothing about the map is
  // downloaded until the visitor clicks one of these buttons.
  const openMapPicker = () => {
    setMapRequest({
      location:
        value && value.latitude !== undefined && value.placeName ? value : DEFAULT_MAP_LOCATION,
      query: query.trim()
    });
    setIsOpen(false);
  };

  const handleMapConfirmed = (location: LocationData) => {
    onChange(location);
    setQuery(location.placeName);
    setMapRequest(null);
  };


  const isLocationVerified = isVerifiedBirthLocation(value);

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* Top Header Bar with Actions */}
      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1.5">
        <label htmlFor={inputId} className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span>{label}</span> {required && <span className="text-rose-500">*</span>}
        </label>

        <div className="flex items-center gap-1.5">
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
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="words"
            spellCheck="false"
            value={query}
            onChange={e => {
              const nextQuery = e.target.value;
              setQuery(nextQuery);
              if (value?.placeName && nextQuery !== value.placeName) onChange(null);
              setIsOpen(true);
            }}
            onFocus={() => {
              if (query.length >= 2 || onlineResults.length > 0) {
                setIsOpen(true);
              }
            }}
            placeholder="Search birth city, town, village, or district worldwide..."
            className="w-full py-3.5 pr-20 bg-transparent text-slate-900 dark:text-white text-base sm:text-sm font-semibold placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none touch-manipulation"
          />

          {/* Right Status / Quick Actions */}
          <div className="absolute right-3 flex items-center gap-1.5">
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setOnlineResults([]);
                  setIsOpen(false);
                  if (value) onChange(null);
                }}
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

      {/* Modern Verified Location Coordinates Card */}
      {isLocationVerified && (
        <div className="mt-2.5 p-3.5 bg-gradient-to-r from-amber-50/70 via-slate-50 to-white dark:from-slate-800/80 dark:via-slate-900/90 dark:to-slate-900 border border-amber-500/30 dark:border-amber-500/20 rounded-2xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                <span>{value.placeName}</span>
                {value.country && (
                  <span className="px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-400 font-medium">
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

      {/* Worldwide Live Results Dropdown Panel */}
      {isOpen && (query.length >= 2 || onlineResults.length > 0) && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 animate-in fade-in slide-in-from-top-1 duration-150 max-h-[340px] overflow-y-auto">
          <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950/70 flex items-center justify-between text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" />
              <span>Worldwide Matching Places ({onlineResults.length})</span>
            </span>
            {isSearchingOnline && (
              <span className="text-[10.5px] text-slate-400 lowercase font-normal flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin text-amber-500" /> searching...
              </span>
            )}
          </div>

          {onlineResults.length > 0 ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {onlineResults.map((loc, idx) => (
                <button
                  key={`res-${idx}`}
                  type="button"
                  onClick={() => handleSelectResult(loc)}
                  className="w-full text-left px-4 py-3 hover:bg-amber-500/10 dark:hover:bg-amber-500/15 flex items-center justify-between transition-colors group cursor-pointer"
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
              ))}
            </div>
          ) : !isSearchingOnline ? (
            <div className="text-center py-6 px-4 space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                No matching place found for &ldquo;{query}&rdquo;.
              </p>
              <button
                type="button"
                onClick={openMapPicker}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-md transition-all cursor-pointer active:scale-95"
              >
                <MapIcon className="w-3.5 h-3.5" />
                <span>Pinpoint Exact Village on Map</span>
              </button>
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
