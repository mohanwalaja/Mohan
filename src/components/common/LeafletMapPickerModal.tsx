import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Search, Check, X, Loader2 } from 'lucide-react';
import L from 'leaflet';
// Leaflet's stylesheet ships with Leaflet and is needed only while the map is
// on screen. Importing it here (instead of from src/index.css) keeps its ~15 KB
// out of the global stylesheet that every page loads — Vite emits it as a CSS
// file next to this chunk and fetches it together with the map.
import 'leaflet/dist/leaflet.css';
import {
  estimateTimezoneOffset,
  LocationData
} from '../../data/worldwideLocations';
import { getTimeZoneIdForCoordinates } from '../../lib/timezone';
import { displayCurrentOffset } from '../../utils/locationDisplay';

/**
 * The interactive "pinpoint the exact birth village" map.
 *
 * WHY THIS IS ITS OWN LAZY MODULE (audit PERF-1): it is the only consumer of
 * Leaflet. While it lived inside GooglePlacesPicker — a component the app
 * shell renders on every page — Leaflet's ~150 KB of JavaScript and its CSS
 * were part of the initial download for visitors who never opened a map.
 * GooglePlacesPicker now renders this component only when the visitor asks for
 * the map, so the library arrives with the feature (see the lazy() wrapper
 * there). Nothing about the interaction changed: same tiles, same draggable
 * amber marker, same reverse geocoding, same Confirm/Cancel semantics.
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
  const [mapSearchQuery, setMapSearchQuery] = useState(initialQuery);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerInstanceRef = useRef<L.Marker | null>(null);

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

    const reverseGeocode = async (lat: number, lng: number) => {
      const formattedLat = Number(lat.toFixed(4));
      const formattedLng = Number(lng.toFixed(4));
      setIsReverseGeocoding(true);

      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${formattedLat}&lon=${formattedLng}&format=json`
        );
        let place = `Location (${formattedLat}, ${formattedLng})`;
        let country = 'Global';
        let state = '';
        let city = '';

        if (res.ok) {
          const data = await res.json();
          const addr = data.address || {};
          city =
            addr.village || addr.suburb || addr.town || addr.city || addr.county || '';
          state = addr.state || '';
          country = addr.country || 'Global';
          if (city || state) {
            place = [city, state, country].filter(Boolean).join(', ');
          } else if (data.display_name) {
            place = data.display_name.split(',').slice(0, 3).join(', ');
          }
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
      } catch (err) {
        console.warn('Reverse geocoding error:', err);
      } finally {
        setIsReverseGeocoding(false);
      }
    };

    map.on('click', (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng);
      reverseGeocode(e.latlng.lat, e.latlng.lng);
    });

    marker.on('dragend', (e: any) => {
      const { lat, lng } = e.target.getLatLng();
      reverseGeocode(lat, lng);
    });

    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerInstanceRef.current = null;
    };
    // The map is created once per opened modal: the starting point is fixed for
    // the lifetime of the modal (it is re-mounted by GooglePlacesPicker each
    // time the visitor opens it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search within Map Modal
  const handleMapSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mapSearchQuery.trim() || !mapInstanceRef.current || !markerInstanceRef.current) return;

    try {
      const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(mapSearchQuery)}&limit=1`);
      if (res.ok) {
        const data = await res.json();
        if (data.features && data.features.length > 0) {
          const [lng, lat] = data.features[0].geometry.coordinates;
          const props = data.features[0].properties || {};
          const country = props.country || 'Global';
          const place = [props.name, props.city, props.state, country].filter(Boolean).join(', ');
          const tz = estimateTimezoneOffset(lat, lng, country);

          mapInstanceRef.current.setView([lat, lng], 13);
          markerInstanceRef.current.setLatLng([lat, lng]);

          setTempLocation({
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
    } catch (err) {
      console.warn('Map search error:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl overflow-hidden flex flex-col h-[560px] animate-in zoom-in-95 duration-200">
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
                Click anywhere on map or drag the amber marker to lock coordinates
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Map Search Form */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <form onSubmit={handleMapSearch} className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={mapSearchQuery}
                onChange={e => setMapSearchQuery(e.target.value)}
                placeholder="Search village, taluk, town, temple, or city..."
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-500 font-semibold"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            </div>
            <button
              type="submit"
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black transition-colors cursor-pointer shadow-md shadow-amber-500/20"
            >
              Find
            </button>
          </form>
        </div>

        {/* Leaflet Map Canvas */}
        <div className="relative flex-1 bg-slate-100 dark:bg-slate-950">
          <div ref={mapContainerRef} className="w-full h-full" />
          {isReverseGeocoding && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-slate-900/90 text-white px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 shadow-xl border border-slate-700">
              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
              <span>Detecting exact area & coordinates...</span>
            </div>
          )}
        </div>

        {/* Modal Footer with Selected Coordinates and Confirm */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>{tempLocation.placeName}</span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
              Lat: <strong>{tempLocation.latitude}°</strong> • Long: <strong>{tempLocation.longitude}°</strong> • Offset {displayCurrentOffset(tempLocation)}
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
  );
};
