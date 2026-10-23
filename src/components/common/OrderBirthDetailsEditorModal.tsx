import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Check, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import type { Order } from '../../types';
import { orderChartServiceType } from '../../services/multiPersonOrder';
import { PersonNameField } from './PersonNameField';
import { BirthDateField, BirthTimeField, BirthTimeZoneNotice, MonthField } from './BirthDateTimeFields';
import { GooglePlacesPicker, type LocationData } from './GooglePlacesPicker';
import { resolveLocationTimezone } from '../../lib/timezone';
import {
  isValidBirthTime,
  isValidIsoBirthDate,
  isVerifiedBirthLocation,
  normalizeBirthDate,
  normalizeBirthTime,
  normalizePersonName
} from '../../utils/birthDetails';
import { api } from '../../services/api';

interface OrderBirthDetailsEditorModalProps {
  order: Order;
  isAdmin: boolean;
  itemId?: number;
  onClose: () => void;
  onSaved: (updated: {
    order?: Order;
    inputPayload: Record<string, any>;
    calculatedResult: any;
  }) => void;
}

function toInitialLocation(source: any, prefix = ''): LocationData | null {
  if (!source || typeof source !== 'object') return null;
  const placeName = String(
    prefix ? source[`${prefix}Place`] || '' : source.birthPlace || source.place || ''
  ).trim();
  const lat = Number(prefix ? source[`${prefix}Latitude`] : source.latitude);
  const lng = Number(prefix ? source[`${prefix}Longitude`] : source.longitude);
  const tz = Number(
    prefix ? source[`${prefix}TimezoneOffsetHours`] : source.timezoneOffsetHours
  );
  const tzId = String(
    prefix ? source[`${prefix}TimeZoneId`] || '' : source.timeZoneId || ''
  ).trim();
  const country = String(
    prefix ? source[`${prefix}Country`] || source.country || '' : source.country || ''
  ).trim();

  if (!placeName || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    placeName,
    country,
    latitude: lat,
    longitude: lng,
    timezoneOffsetHours: Number.isFinite(tz) ? tz : 0,
    timeZoneId: tzId || undefined
  };
}

export const OrderBirthDetailsEditorModal: React.FC<OrderBirthDetailsEditorModalProps> = ({
  order,
  isAdmin,
  itemId,
  onClose,
  onSaved
}) => {
  const serviceType = orderChartServiceType(order);
  const payload = (order.inputPayload || {}) as Record<string, any>;

  // Primary person (or Groom for Marriage Compatibility)
  const initialPrimary = serviceType === 'MARRIAGE_COMPATIBILITY' ? payload.groom || {} : payload;
  const [name, setName] = useState<string>(() => String(initialPrimary.name || ''));
  const [gender, setGender] = useState<'M' | 'F'>(() => (initialPrimary.gender === 'F' ? 'F' : 'M'));
  const [dob, setDob] = useState<string>(() => normalizeBirthDate(String(initialPrimary.dob || '')));
  const [tob, setTob] = useState<string>(() => normalizeBirthTime(String(initialPrimary.tob || '')));
  const [location, setLocation] = useState<LocationData | null>(() => toInitialLocation(initialPrimary));

  // Secondary person (Bride for Marriage Compatibility, or optional Partner for Muhurtham)
  const initialSecondary =
    serviceType === 'MARRIAGE_COMPATIBILITY' ? payload.bride || {} : payload.partner || {};
  const [secondName, setSecondName] = useState<string>(() => String(initialSecondary.name || ''));
  const [secondDob, setSecondDob] = useState<string>(() => normalizeBirthDate(String(initialSecondary.dob || '')));
  const [secondTob, setSecondTob] = useState<string>(() => normalizeBirthTime(String(initialSecondary.tob || '')));
  const [secondLocation, setSecondLocation] = useState<LocationData | null>(() =>
    toInitialLocation(initialSecondary)
  );

  // Muhurtham specific fields
  const [selectedMonth, setSelectedMonth] = useState<string>(() => String(payload.selectedMonth || ''));
  const [muhurthamLocation, setMuhurthamLocation] = useState<LocationData | null>(() =>
    toInitialLocation(payload, 'muhurtham')
  );

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const primaryTz = useMemo(
    () =>
      location
        ? resolveLocationTimezone(
            dob,
            tob,
            location.latitude,
            location.longitude,
            location.timezoneOffsetHours,
            location.timeZoneId
          )
        : null,
    [dob, tob, location]
  );

  const secondTz = useMemo(
    () =>
      secondLocation
        ? resolveLocationTimezone(
            secondDob,
            secondTob,
            secondLocation.latitude,
            secondLocation.longitude,
            secondLocation.timezoneOffsetHours,
            secondLocation.timeZoneId
          )
        : null,
    [secondDob, secondTob, secondLocation]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanName = normalizePersonName(name);
    if (serviceType !== 'BABY_NAMING' && !cleanName) {
      setErrorMsg('Please enter the full name.');
      return;
    }
    if (!isValidIsoBirthDate(dob)) {
      setErrorMsg('Please enter a valid date of birth.');
      return;
    }
    if (!isValidBirthTime(tob)) {
      setErrorMsg('Please enter a valid birth time.');
      return;
    }
    if (!isVerifiedBirthLocation(location)) {
      setErrorMsg('Please select a verified birth place with coordinates.');
      return;
    }
    if (primaryTz?.problem) {
      setErrorMsg(primaryTz.problem);
      return;
    }

    let nextPayload: Record<string, any>;

    if (serviceType === 'MARRIAGE_COMPATIBILITY') {
      const cleanBride = normalizePersonName(secondName);
      if (!cleanBride) {
        setErrorMsg('Please enter the bride full name.');
        return;
      }
      if (!isValidIsoBirthDate(secondDob) || !isValidBirthTime(secondTob)) {
        setErrorMsg('Please enter valid date and time of birth for the bride.');
        return;
      }
      if (!isVerifiedBirthLocation(secondLocation)) {
        setErrorMsg('Please select a verified birth place for the bride.');
        return;
      }
      if (secondTz?.problem) {
        setErrorMsg(secondTz.problem);
        return;
      }

      nextPayload = {
        ...payload,
        groom: {
          ...(payload.groom || {}),
          name: cleanName,
          dob,
          tob,
          gender: 'M',
          birthPlace: location.placeName,
          country: location.country || '',
          latitude: location.latitude,
          longitude: location.longitude,
          timezoneOffsetHours: primaryTz?.timezoneOffsetHours ?? location.timezoneOffsetHours,
          timeZoneId: primaryTz?.timeZoneId ?? location.timeZoneId
        },
        bride: {
          ...(payload.bride || {}),
          name: cleanBride,
          dob: secondDob,
          tob: secondTob,
          gender: 'F',
          birthPlace: secondLocation.placeName,
          country: secondLocation.country || '',
          latitude: secondLocation.latitude,
          longitude: secondLocation.longitude,
          timezoneOffsetHours: secondTz?.timezoneOffsetHours ?? secondLocation.timezoneOffsetHours,
          timeZoneId: secondTz?.timeZoneId ?? secondLocation.timeZoneId
        }
      };
    } else if (serviceType === 'MUHURTHAM') {
      if (!isVerifiedBirthLocation(muhurthamLocation)) {
        setErrorMsg('Please select the verified Muhurtham function location.');
        return;
      }
      const hasPartnerAny = Boolean(
        normalizePersonName(secondName) || secondDob || secondTob || secondLocation?.placeName
      );
      let partnerBlock: Record<string, any> | undefined;
      if (hasPartnerAny) {
        if (
          !normalizePersonName(secondName) ||
          !isValidIsoBirthDate(secondDob) ||
          !isValidBirthTime(secondTob) ||
          !isVerifiedBirthLocation(secondLocation)
        ) {
          setErrorMsg('Complete all bride birth details or clear them all.');
          return;
        }
        if (secondTz?.problem) {
          setErrorMsg(secondTz.problem);
          return;
        }
        partnerBlock = {
          name: normalizePersonName(secondName),
          dob: secondDob,
          tob: secondTob,
          gender: 'F',
          birthPlace: secondLocation.placeName,
          country: secondLocation.country || '',
          latitude: secondLocation.latitude,
          longitude: secondLocation.longitude,
          timezoneOffsetHours: secondTz?.timezoneOffsetHours ?? secondLocation.timezoneOffsetHours,
          timeZoneId: secondTz?.timeZoneId ?? secondLocation.timeZoneId
        };
      }

      nextPayload = {
        ...payload,
        name: cleanName,
        dob,
        tob,
        gender,
        birthPlace: location.placeName,
        country: location.country || '',
        latitude: location.latitude,
        longitude: location.longitude,
        timezoneOffsetHours: primaryTz?.timezoneOffsetHours ?? location.timezoneOffsetHours,
        timeZoneId: primaryTz?.timeZoneId ?? location.timeZoneId,
        selectedMonth: selectedMonth || payload.selectedMonth,
        muhurthamPlace: muhurthamLocation.placeName,
        muhurthamCountry: muhurthamLocation.country || '',
        muhurthamLatitude: muhurthamLocation.latitude,
        muhurthamLongitude: muhurthamLocation.longitude,
        muhurthamTimezoneOffsetHours: muhurthamLocation.timezoneOffsetHours,
        muhurthamTimeZoneId: muhurthamLocation.timeZoneId,
        partner: partnerBlock ?? null
      };
    } else {
      nextPayload = {
        ...payload,
        name: cleanName,
        dob,
        tob,
        gender,
        birthPlace: location.placeName,
        country: location.country || '',
        latitude: location.latitude,
        longitude: location.longitude,
        timezoneOffsetHours: primaryTz?.timezoneOffsetHours ?? location.timezoneOffsetHours,
        timeZoneId: primaryTz?.timeZoneId ?? location.timeZoneId
      };
    }

    setIsSaving(true);
    try {
      const response = isAdmin
        ? await api.adminUpdateOrderBirthDetails(order.id, nextPayload, itemId)
        : await api.updateMyOrderBirthDetails(order.id, nextPayload, itemId);

      if (!response.success) {
        setErrorMsg(response.message || 'Could not update birth details.');
        return;
      }

      onSaved({
        order: response.order,
        inputPayload: response.inputPayload || nextPayload,
        calculatedResult: response.calculatedResult
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Network error while saving updated birth details.');
    } finally {
      setIsSaving(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9980] flex items-center justify-center bg-slate-950/80 p-3 sm:p-6 backdrop-blur-md overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Edit Birth Details and Recalculate Report"
    >
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl border border-slate-700 bg-slate-900 text-white shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="h-9 w-9 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-black tracking-wide text-white">
                Edit Birth Details &amp; Recalculate Chart ({order.orderNumber})
              </h3>
              <p className="text-[11px] text-slate-400">
                Updates coordinates, historical timezone offset, planetary positions &amp; report preview immediately
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close editor"
            className="h-8 w-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto flex-1 space-y-5">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-700 text-rose-200 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Primary / Groom section */}
          <div className="space-y-3.5 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
            <div className="text-xs font-black uppercase tracking-wider text-amber-400">
              {serviceType === 'MARRIAGE_COMPATIBILITY'
                ? '1. Groom Birth Particulars'
                : serviceType === 'BABY_NAMING'
                  ? 'Baby Birth Particulars'
                  : 'Primary Birth Particulars'}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <PersonNameField
                value={name}
                onChange={setName}
                label={serviceType === 'MARRIAGE_COMPATIBILITY' ? 'Groom full name' : 'Full name'}
                required={serviceType !== 'BABY_NAMING'}
                theme="dark"
                size="sm"
              />

              {serviceType !== 'MARRIAGE_COMPATIBILITY' && (
                <div>
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                    Gender *
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setGender('M')}
                      className={`py-2.5 px-3 rounded-2xl text-xs font-bold border cursor-pointer ${
                        gender === 'M'
                          ? 'bg-amber-400 text-slate-950 border-amber-400 font-black'
                          : 'bg-slate-900 text-slate-300 border-slate-700'
                      }`}
                    >
                      👨 Male
                    </button>
                    <button
                      type="button"
                      onClick={() => setGender('F')}
                      className={`py-2.5 px-3 rounded-2xl text-xs font-bold border cursor-pointer ${
                        gender === 'F'
                          ? 'bg-pink-500 text-white border-pink-500 font-black'
                          : 'bg-slate-900 text-slate-300 border-slate-700'
                      }`}
                    >
                      👩 Female
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <BirthDateField label="Date of Birth" theme="dark" size="sm" value={dob} onChange={setDob} />
              <BirthTimeField label="Exact Birth Time" theme="dark" size="sm" value={tob} onChange={setTob} />
            </div>

            <GooglePlacesPicker
              value={location}
              onChange={setLocation}
              label="Birth Place"
              required
            />
            <BirthTimeZoneNotice resolution={primaryTz} date={dob} time={tob} theme="dark" />
          </div>

          {/* Marriage Bride OR Muhurtham Partner + Venue */}
          {serviceType === 'MARRIAGE_COMPATIBILITY' && (
            <div className="space-y-3.5 rounded-2xl border border-pink-500/30 bg-slate-950/50 p-4">
              <div className="text-xs font-black uppercase tracking-wider text-pink-300">
                2. Bride Birth Particulars
              </div>
              <PersonNameField
                value={secondName}
                onChange={setSecondName}
                label="Bride full name"
                theme="dark"
                size="sm"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <BirthDateField
                  label="Bride Date of Birth"
                  theme="dark"
                  size="sm"
                  value={secondDob}
                  onChange={setSecondDob}
                />
                <BirthTimeField
                  label="Bride Birth Time"
                  theme="dark"
                  size="sm"
                  value={secondTob}
                  onChange={setSecondTob}
                />
              </div>
              <GooglePlacesPicker
                value={secondLocation}
                onChange={setSecondLocation}
                label="Bride Birth Place"
                required
              />
              <BirthTimeZoneNotice resolution={secondTz} date={secondDob} time={secondTob} theme="dark" />
            </div>
          )}

          {serviceType === 'MUHURTHAM' && (
            <>
              <div className="space-y-3.5 rounded-2xl border border-amber-500/30 bg-slate-950/50 p-4">
                <div className="text-xs font-black uppercase tracking-wider text-amber-300">
                  Function Location &amp; Starting Month
                </div>
                <MonthField
                  label="Selected Starting Month"
                  theme="dark"
                  size="sm"
                  value={selectedMonth}
                  onChange={setSelectedMonth}
                />
                <GooglePlacesPicker
                  value={muhurthamLocation}
                  onChange={setMuhurthamLocation}
                  label="Muhurtham Function Location"
                  required
                />
              </div>

              <div className="space-y-3.5 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                <div className="text-xs font-black uppercase tracking-wider text-pink-300">
                  Bride Birth Particulars (Optional)
                </div>
                <PersonNameField
                  value={secondName}
                  onChange={setSecondName}
                  label="Bride full name"
                  required={false}
                  theme="dark"
                  size="sm"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <BirthDateField
                    label="Bride Date of Birth"
                    required={false}
                    theme="dark"
                    size="sm"
                    value={secondDob}
                    onChange={setSecondDob}
                  />
                  <BirthTimeField
                    label="Bride Birth Time"
                    required={false}
                    theme="dark"
                    size="sm"
                    value={secondTob}
                    onChange={setSecondTob}
                  />
                </div>
                <GooglePlacesPicker
                  value={secondLocation}
                  onChange={setSecondLocation}
                  label="Bride Birth Place"
                />
                <BirthTimeZoneNotice resolution={secondTz} date={secondDob} time={secondTob} theme="dark" />
              </div>
            </>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Recalculating Chart…</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5" />
                  <Check className="h-3.5 w-3.5 stroke-[3]" />
                  <span>Save &amp; Recalculate Report</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
