import React from 'react';
import { CheckCircle2, Circle, Sparkles } from 'lucide-react';
import {
  describeBirthTimePeriod,
  formatBirthWeekday,
  formatReadableDob,
  formatReadableTob
} from '../../utils/dateTimeInput';
import {
  isValidBirthTime,
  isValidIsoBirthDate,
  isVerifiedBirthLocation,
  normalizePersonName
} from '../../utils/birthDetails';
import type { LocationData } from '../../data/worldwideLocations';
import { formatUtcOffset, type BirthTimeZoneResolution } from '../../lib/timezone';

export interface BirthDetailsSummaryCardProps {
  name?: string;
  nameOptional?: boolean;
  dob: string;
  tob: string;
  location?: LocationData | null;
  timezoneResolution?: BirthTimeZoneResolution | null;
  subjectLabel?: string;
  theme?: 'dark' | 'light';
  className?: string;
}

/**
 * Live astrological input readiness strip across all services.
 * Gives instant confirmation of Weekday (catches DD/MM vs MM/DD swaps),
 * AM/PM time-of-day (catches Midnight vs Noon swaps), and exact coordinates/UTC offset.
 */
export const BirthDetailsSummaryCard: React.FC<BirthDetailsSummaryCardProps> = ({
  name = '',
  nameOptional = false,
  dob,
  tob,
  location,
  timezoneResolution,
  subjectLabel = 'Birth Chart Readiness',
  theme = 'dark',
  className = ''
}) => {
  const cleanName = normalizePersonName(name);
  const nameReady = nameOptional || cleanName.length > 0;
  const dobReady = isValidIsoBirthDate(dob);
  const tobReady = isValidBirthTime(tob);
  const locReady = isVerifiedBirthLocation(location) && !timezoneResolution?.problem;

  const anyEntered = Boolean(cleanName || dob || tob || location?.placeName);
  if (!anyEntered) return null;

  const steps = [
    ...(nameOptional && !cleanName
      ? []
      : [{
          key: 'name',
          ready: nameReady,
          label: cleanName || 'Full Name'
        }]),
    {
      key: 'dob',
      ready: dobReady,
      label: dobReady ? `${formatReadableDob(dob)} (${formatBirthWeekday(dob)})` : 'Date of Birth'
    },
    {
      key: 'tob',
      ready: tobReady,
      label: tobReady ? `${formatReadableTob(tob)} · ${describeBirthTimePeriod(tob)}` : 'Birth Time'
    },
    {
      key: 'loc',
      ready: locReady,
      label: locReady && location
        ? `${location.city || location.placeName.split(',')[0]} (${formatUtcOffset(
            timezoneResolution?.timezoneOffsetHours ?? location.timezoneOffsetHours
          )})`
        : 'Birth Place'
    }
  ];

  const completedCount = steps.filter(step => step.ready).length;
  const allReady = completedCount === steps.length;
  const isDark = theme === 'dark';

  const containerClass = allReady
    ? isDark
      ? 'border-emerald-500/35 bg-emerald-950/35 text-emerald-100'
      : 'border-emerald-300 bg-emerald-50/80 text-emerald-950 dark:border-emerald-500/35 dark:bg-emerald-950/35 dark:text-emerald-100'
    : isDark
      ? 'border-slate-700/70 bg-slate-950/50 text-slate-200'
      : 'border-slate-200 bg-slate-50/90 text-slate-800 dark:border-slate-700/70 dark:bg-slate-950/50 dark:text-slate-200';

  return (
    <div
      className={`rounded-2xl border px-3.5 py-2.5 text-xs transition-all ${containerClass} ${className}`}
      data-birth-readiness={allReady ? 'ready' : 'incomplete'}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
        <span className="inline-flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10.5px]">
          <Sparkles className={`h-3 w-3 ${allReady ? 'text-emerald-400' : 'text-amber-400'}`} />
          <span>{subjectLabel}</span>
        </span>
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
            allReady
              ? 'bg-emerald-500 text-slate-950'
              : isDark
                ? 'bg-slate-800 text-amber-300 border border-slate-700'
                : 'bg-amber-100 text-amber-900 border border-amber-200 dark:bg-slate-800 dark:text-amber-300 dark:border-slate-700'
          }`}
        >
          {allReady ? '✓ Ready for Calculation' : `${completedCount}/${steps.length} Verified`}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {steps.map(step => (
          <span
            key={step.key}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold border ${
              step.ready
                ? isDark
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-emerald-200 bg-white text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
                : isDark
                  ? 'border-slate-700 bg-slate-900/70 text-slate-400'
                  : 'border-slate-200 bg-white/80 text-slate-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-400'
            }`}
          >
            {step.ready ? (
              <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
            ) : (
              <Circle className="h-2.5 w-2.5 shrink-0 opacity-60" />
            )}
            <span className="truncate max-w-[220px]">{step.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
};
