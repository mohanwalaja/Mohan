import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Crosshair, MapPin, Search, Check, X, Loader2 } from 'lucide-react';
import L from 'leaflet';
// Leaflet's stylesheet ships with Leaflet and is needed only while the map is
// on screen. Importing it here (instead of from src/index.css) keeps its ~15 KB
// out of the global stylesheet that every page loads — Vite emits it as a CSS
// file next to this chunk and fetches it together with the map.
import 'leaflet/dist/leaflet.css';
import {
  estimateTimezoneOffset,
  findNearestWorldwideLocation,
  LocationData,
  parseCoordinatesFromInput,
  searchWorldwideLocations
} from '../../data/worldwideLocations';
import { getTimeZoneIdForCoordinates } from '../../lib/timezone';
import { displayCurrentOffset } from '../../utils/locationDisplay';
import { api } from '../../services/api';

/**
 * The interactive "pinpoint the exact birth village" map.
 *
 * WHY THIS IS ITS OWN LAZY MODULE (audit PERF-1): it is the only consumer of
 * Leaflet. While it lived inside GooglePlacesPicker — a component the app
 * shell renders on every page — Leaflet's ~150 KB of JavaScript and its CSS
 * were part of the initial download for visitors who never opened a map.
 * GooglePlacesPicker now renders this component only when the visitor asks for
 * the map, so the library arrives with the feature (see the lazy() wrapper
 * there).
 */
export interface LeafletMapPickerModalProps {
  /** Location the map opens on (the visitor's current, or Chennai). */
  initialLocation: LocationData;
  /** Text already typed into the location search box, if any. */
  initialQuery?: string;
  /** Called with the pinned location when the visitor confirms. */
  onConfirm: (location: LocationData) => void;
  /** Called when the visitor cancels or closes the modal. */
  onClose: () => void;
}

export const LeafletMapPickerModal: React.FC<LeafletMapPickerModalProps> = ({
  initialLocation,
  initialQuery = '',
  onConfirm,
  onClose
}) => {
  const [tempLocation, setTempLocation] = useState<LocationData>(initialLocation);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [isLocatingGps, setIsLocatingGps] = useState(false);
  const [mapSearchQuery, setMapSearchQuery] = useState(initialQuery);
  const [latDraft, setLatDraft] = useState(() => String(initialLocation.latitude ?? 13.0827));
  const [lngDraft, setLngDraft] = useState(() => String(initialLocation.longitude ?? 80.2707));
  const [showSuggestions, setShowSuggestions] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerInstanceRef = useRef<L.Marker | null>(null);

  const localMapSuggestions = useMemo(
    () => (mapSearchQuery.trim().length >= 2 ? searchWorldwideLocations(mapSearchQuery, 6) : []),
    [mapSearchQuery]
  );

  useEffect(() => {
    setLatDraft(String(tempLocation.latitude));
    setLngDraft(String(tempLocation.longitude));
  }, [tempLocation.latitude, tempLocation.longitude]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const movePinAndResolve = async (lat: number, lng: number, zoom?: number) => {
    const formattedLat = Number(lat.toFixed(4));
    const formattedLng = Number(lng.toFixed(4));

    if (mapInstanceRef.current && markerInstanceRef.current) {
      markerInstanceRef.current.setLatLng([formattedLat, formattedLng]);
      mapInstanceRef.current.setView([formattedLat, formattedLng], zoom ?? mapInstanceRef.current.getZoom());
    }

    const nearest = findNearestWorldwideLocation(formattedLat, formattedLng);
    let place = nearest
      ? `${nearest.placeName} (${formattedLat}°, ${formattedLng}°)`
      : `Location (${formattedLat}, ${formattedLng})`;
    let country = nearest?.country || 'Global';
    let state = nearest?.state || '';
    let city = nearest?.city || '';

    setIsReverseGeocoding(true);
    try {
      const serverRev = await api.reverseGeocode(formattedLat, formattedLng);
      if (serverRev.success && serverRev.location?.placeName) {
        const loc = serverRev.location;
        place = loc.placeName;
        country = loc.country || country;
        state = loc.state || state;
        city = loc.city || city;
      } else {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${formattedLat}&lon=${formattedLng}&format=json`,
            { signal: controller.signal }
          );
          if (res.ok) {
            const data = await res.json();
            const addr = data.address || {};
            city = addr.village || addr.suburb || addr.town || addr.city || addr.county || city;
            state = addr.state || state;
            country = addr.country || country;
            if (city || state) {
              place = [city, state, country].filter(Boolean).join(', ');
            } else if (data.display_name) {
              place = data.display_name.split(',').slice(0, 3).join(', ');
            }
          }
        } finally {
          clearTimeout(timer);
        }
      }
    } catch {
      // Offline / network blocked: nearest worldwide atlas context above is already ready
    } finally {
      setIsReverseGeocoding(false);
    }

    const tz = estimateTimezoneOffset(formattedLat, formattedLng, country);
    setTempLocation({
      placeName: place,
      country,
      latitude: formattedLat,
      longitude: formattedLng,
      timezoneOffsetHours: tz,
      timeZoneId: getTimeZoneIdForCoordinates(formattedLat, formattedLng) ?? undefined,
      state: state || undefined,
      city: city || undefined
    });
  };

  // Leaflet Map logic inside modal
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const customIcon = L.divIcon({
      className: 'custom-map-pin',
      html: `
        <div style="background: linear-gradient(135deg, #d97706, #f59e0b); color: #020617; border: 2.5px solid #ffffff; border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 16px rgba(0,0,0,0.5); font-size: 17px; font-weight: bold;">
          📍
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 36],
    });

    const initialLat = initialLocation.latitude ?? 13.0827;
    const initialLng = initialLocation.longitude ?? 80.2707;

    const map = L.map(mapContainerRef.current).setView([initialLat, initialLng], 12);
    mapInstanceRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker([initialLat, initialLng], {
      draggable: true,
      icon: customIcon,
    }).addTo(map);
    markerInstanceRef.current = marker;

    map.on('click', (e: L.LeafletMouseEvent) => {
      void movePinAndResolve(e.latlng.lat, e.latlng.lng);
    });

    marker.on('dragend', (e: any) => {
      const { lat, lng } = e.target.getLatLng();
      void movePinAndResolve(lat, lng);
    });

    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    // If visitor typed a search query before clicking "Map Pinpoint", jump directly there!
    const cleanInitial = initialQuery.trim();
    if (cleanInitial.length >= 2 && cleanInitial.toLowerCase() !== initialLocation.placeName.toLowerCase()) {
      const instantHit = searchWorldwideLocations(cleanInitial, 1)[0];
      if (instantHit) {
        map.setView([instantHit.latitude, instantHit.longitude], 13);
        marker.setLatLng([instantHit.latitude, instantHit.longitude]);
        setTempLocation(instantHit);
      } else {
        void runQueryLookup(cleanInitial);
      }
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyKnownLocation = (loc: LocationData) => {
    if (mapInstanceRef.current && markerInstanceRef.current) {
      mapInstanceRef.current.setView([loc.latitude, loc.longitude], 13);
      markerInstanceRef.current.setLatLng([loc.latitude, loc.longitude]);
    }
    setTempLocation(loc);
    setMapSearchQuery(loc.placeName);
    setShowSuggestions(false);
  };

  const runQueryLookup = async (rawQ: string) => {
    const cleanQ = rawQ.trim();
    if (!cleanQ) return;

    const directCoords = parseCoordinatesFromInput(cleanQ);
    if (directCoords) {
      applyKnownLocation(directCoords);
      return;
    }

    const serverHit = await api.searchLocations(cleanQ);
    if (serverHit.success && Array.isArray(serverHit.results) && serverHit.results.length > 0) {
      applyKnownLocation(serverHit.results[0]);
      return;
    }

    const atlasHit = searchWorldwideLocations(cleanQ, 1)[0];
    if (atlasHit) {
      applyKnownLocation(atlasHit);
      return;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      try {
        const res = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(cleanQ)}&limit=1`,
          { signal: controller.signal }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.features && data.features.length > 0) {
            const [lng, lat] = data.features[0].geometry.coordinates;
            const props = data.features[0].properties || {};
            const country = props.country || 'Global';
            const place = [props.name, props.city, props.state, country].filter(Boolean).join(', ');
            const tz = estimateTimezoneOffset(lat, lng, country);
            applyKnownLocation({
              placeName: place,
              country,
              latitude: Number(lat.toFixed(4)),
              longitude: Number(lng.toFixed(4)),
              timezoneOffsetHours: tz,
              timeZoneId: getTimeZoneIdForCoordinates(lat, lng) ?? undefined,
              state: props.state || undefined,
              city: props.city || props.name || undefined
            });
          }
        }
      } finally {
        clearTimeout(timer);
      }
    } catch {
      /* ignore network timeout cleanly */
    }
  };

  const handleMapSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowSuggestions(false);
    await runQueryLookup(mapSearchQuery);
  };

  const handleMapGps = () => {
    if (!navigator.geolocation) return;
    setIsLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setIsLocatingGps(false);
        void movePinAndResolve(pos.coords.latitude, pos.coords.longitude, 15);
      },
      () => {
        setIsLocatingGps(false);
      }
    );
  };

  const handleManualCoordsApply = () => {
    const parsedLat = Number(latDraft);
    const parsedLng = Number(lngDraft);
    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return;
    if (Math.abs(parsedLat) > 90 || Math.abs(parsedLng) > 180) return;
    void movePinAndResolve(parsedLat, parsedLng, 14);
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9995] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Pinpoint Exact Birth Village or Area on Map"
    >
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh] h-[610px] animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 flex items-center justify-center font-bold shadow-md shadow-amber-500/20">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                Pinpoint Exact Birth Village or Area on Map
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Click anywhere on map, drag the amber pin, search a town, or enter exact coordinates
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close map modal"
            className="w-8 h-8 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Map Search Form + Instant Suggestions */}
        <div className="relative p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <form onSubmit={handleMapSearch} className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={mapSearchQuery}
                onFocus={() => setShowSuggestions(true)}
                onChange={e => {
                  setMapSearchQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                placeholder="Search village, taluk, town, temple, city, or paste coordinates..."
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-500 font-semibold"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            </div>
            <button
              type="button"
              onClick={handleMapGps}
              disabled={isLocatingGps}
              title="Center map on device GPS"
              className="px-3 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <Crosshair className={`w-3.5 h-3.5 ${isLocatingGps ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">GPS</span>
            </button>
            <button
              type="submit"
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black transition-colors cursor-pointer shadow-md shadow-amber-500/20"
            >
              Find
            </button>
          </form>

          {showSuggestions && localMapSuggestions.length > 0 && (
            <div className="absolute left-3 right-3 top-full mt-1 z-[1100] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {localMapSuggestions.map((loc, idx) => (
                <button
                  key={`map-sug-${idx}`}
                  type="button"
                  onClick={() => applyKnownLocation(loc)}
                  className="w-full px-3.5 py-2 text-left text-xs hover:bg-amber-500/15 flex items-center justify-between gap-2 cursor-pointer"
                >
                  <span className="font-bold text-slate-900 dark:text-white truncate">{loc.placeName}</span>
                  <span className="text-[10.5px] font-mono text-slate-400 shrink-0">
                    {loc.latitude}°, {loc.longitude}°
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Leaflet Map Canvas */}
        <div className="relative flex-1 bg-slate-100 dark:bg-slate-950">
          <div ref={mapContainerRef} className="w-full h-full" />
          {isReverseGeocoding && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-slate-900/90 text-white px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 shadow-xl border border-slate-700">
              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
              <span>Detecting exact area &amp; timezone...</span>
            </div>
          )}
        </div>

        {/* Modal Footer with Editable Coordinates and Confirm */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950/80 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <label className="flex items-center gap-1 font-bold text-slate-600 dark:text-slate-300">
              <span>Lat:</span>
              <input
                type="text"
                inputMode="decimal"
                value={latDraft}
                onChange={e => setLatDraft(e.target.value)}
                onBlur={handleManualCoordsApply}
                className="w-24 px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-slate-900 dark:text-white"
              />
            </label>
            <label className="flex items-center gap-1 font-bold text-slate-600 dark:text-slate-300">
              <span>Lng:</span>
              <input
                type="text"
                inputMode="decimal"
                value={lngDraft}
                onChange={e => setLngDraft(e.target.value)}
                onBlur={handleManualCoordsApply}
                className="w-24 px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-slate-900 dark:text-white"
              />
            </label>
            <span className="text-amber-700 dark:text-amber-400 font-semibold">
              Offset {displayCurrentOffset(tempLocation)}
              {tempLocation.timeZoneId ? ` (${tempLocation.timeZoneId})` : ''}
            </span>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="min-w-0">
              <div className="text-xs font-black text-slate-900 dark:text-white truncate">
                {tempLocation.placeName}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl font-bold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onConfirm(tempLocation)}
                disabled={isReverseGeocoding}
                className="px-5 py-2.5 bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-slate-950 text-xs font-black rounded-xl shadow-md shadow-amber-500/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:cursor-wait disabled:opacity-60"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Use This Location</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
