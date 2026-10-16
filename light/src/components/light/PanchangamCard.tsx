import React, { useEffect, useMemo, useState } from 'react';
import { Sunrise, Sunset, Moon, Clock3, RefreshCw } from 'lucide-react';
import { PREVIEW_PLACES, panchangamFor, type PanchangamResult } from '../../lib/previewEngine';

/**
 * Live panchangam — the real engine, today, right now.
 *
 * Every number in this card comes from `calculatePrecisionPanchangam()` (the
 * same module the delivered reports use), computed in the browser for the
 * selected city. It is the honest proof that the site's astronomy is real, so
 * it earns a place on the homepage instead of a decorative graphic.
 */
export const PanchangamCard: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const [placeIndex, setPlaceIndex] = useState(0);
  const [reading, setReading] = useState<PanchangamResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const place = PREVIEW_PLACES[placeIndex];

  useEffect(() => {
    try {
      setReading(panchangamFor(place));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The panchangam could not be calculated.');
    }
  }, [place, tick]);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 15 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const rows = useMemo(() => {
    if (!reading) return [];
    return [
      { label: 'Tithi', value: reading.tithiNameEn, tone: 'brand' as const },
      { label: 'Nakshatra', value: `${reading.nakshatraNameEn} · pada ${reading.nakshatraPada}` },
      { label: 'Yoga', value: reading.yogaNameEn },
      { label: 'Karana', value: reading.karanaNameEn },
      { label: 'Vara', value: reading.varaNameEn },
      {
        label: 'Abhijit muhurtham',
        value: `${reading.abhijitMuhurtham.start} – ${reading.abhijitMuhurtham.end}`
      },
      { label: 'Rahu Kalam', value: `${reading.rahuKalam.start} – ${reading.rahuKalam.end}` },
      { label: 'Yamagandam', value: `${reading.yamaGandam.start} – ${reading.yamaGandam.end}` }
    ];
  }, [reading]);

  return (
    <div className="c-card relative overflow-hidden">
      <div className="c-glow pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" />
      <div className="relative p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="c-eyebrow">
              <span className="relative flex h-2 w-2">
                <span className="absolute inset-0 rounded-full bg-leaf" />
                <span className="c-blink absolute inset-0 rounded-full bg-leaf/60" />
              </span>
              Live panchangam
            </p>
            <p className="c-display mt-2 text-[1.35rem] leading-tight text-ink">
              {reading ? reading.date : 'Calculating…'}
            </p>
            <p className="mt-0.5 text-[0.78rem] text-muted">
              {place.placeName}, {place.country}
              {reading ? ` · ${reading.time}` : ''}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => setTick((value) => value + 1)}
              className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-muted transition-colors hover:border-brand hover:text-brand-ink"
              aria-label="Recalculate panchangam"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <select
              value={placeIndex}
              onChange={(event) => setPlaceIndex(Number(event.target.value))}
              className="c-input !min-h-9 max-w-[9.5rem] !rounded-full !px-3 !py-1 text-[0.75rem] font-semibold"
              aria-label="Panchangam city"
            >
              {PREVIEW_PLACES.map((entry, index) => (
                <option key={entry.placeName} value={index}>
                  {entry.placeName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error ? (
          <p className="mt-5 rounded-2xl border border-rose/25 bg-rose-soft px-3.5 py-3 text-[0.8rem] text-rose">
            {error}
          </p>
        ) : null}

        {rows.length > 0 && (
          <>
            <dl className={`mt-5 grid gap-2.5 grid-cols-2 ${compact ? '' : 'sm:grid-cols-2'}`}>
              {rows.map((row) => (
                <div
                  key={row.label}
                  className="rounded-2xl border border-line bg-surface-2 px-3 py-2.5"
                >
                  <dt className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-faint">
                    {row.label}
                  </dt>
                  <dd
                    className={`mt-1 text-[0.82rem] font-bold leading-snug ${
                      row.tone === 'brand' ? 'text-brand-ink' : 'text-ink'
                    }`}
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4 text-[0.76rem] font-semibold text-ink-soft">
              <span className="flex items-center gap-1.5">
                <Sunrise className="h-4 w-4 text-brand" />
                Sunrise {reading?.sunriseTime}
              </span>
              <span className="flex items-center gap-1.5">
                <Sunset className="h-4 w-4 text-brand" />
                Sunset {reading?.sunsetTime}
              </span>
              {reading?.moonriseTime ? (
                <span className="flex items-center gap-1.5">
                  <Moon className="h-4 w-4 text-accent" />
                  Moonrise {reading.moonriseTime}
                </span>
              ) : null}
              <span className="flex items-center gap-1.5 text-faint">
                <Clock3 className="h-4 w-4" />
                Nalla neram shown per ceremony
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
