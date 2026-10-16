import React from 'react';

/**
 * South Indian rasi chart, drawn for the light UI.
 *
 * Layout is the fixed 4×4 kutam every Tamil reader recognises (Mesham top-left
 * second column, going clockwise), each cell carrying the sign's rasi number and
 * the grahas that occupy it. Planet abbreviations are the standard Su/Mo/Ma/Me/
 * Ju/Ve/Sa/Ra/Ke.
 */
const GRID: Array<{ sign: number; col: number; row: number }> = [
  { sign: 12, col: 0, row: 0 },
  { sign: 1, col: 1, row: 0 },
  { sign: 2, col: 2, row: 0 },
  { sign: 3, col: 3, row: 0 },
  { sign: 11, col: 0, row: 1 },
  { sign: 4, col: 3, row: 1 },
  { sign: 10, col: 0, row: 2 },
  { sign: 5, col: 3, row: 2 },
  { sign: 9, col: 0, row: 3 },
  { sign: 8, col: 1, row: 3 },
  { sign: 7, col: 2, row: 3 },
  { sign: 6, col: 3, row: 3 }
];

const SIGN_SHORT: Record<number, string> = {
  1: 'Mesham',
  2: 'Rishabam',
  3: 'Mithunam',
  4: 'Kadagam',
  5: 'Simham',
  6: 'Kanni',
  7: 'Thulam',
  8: 'Viruchigam',
  9: 'Dhanusu',
  10: 'Magaram',
  11: 'Kumbam',
  12: 'Meenam'
};

const PLANET_SHORT: Record<string, string> = {
  sun: 'Su',
  moon: 'Mo',
  mars: 'Ma',
  mercury: 'Me',
  jupiter: 'Ju',
  venus: 'Ve',
  saturn: 'Sa',
  rahu: 'Ra',
  ketu: 'Ke'
};

export interface ChartGridPlanet {
  graha: string;
  rasi: number;
  isRetrograde?: boolean;
  degrees?: number;
}

export const ChartGrid: React.FC<{
  title?: string;
  lagnaRasiNumber?: number | null;
  planets: ChartGridPlanet[];
  /** Navamsa positions, when the D9 chart is shown instead of the D1. */
  size?: number;
}> = ({ title = 'Rasi chart (D1)', lagnaRasiNumber, planets, size = 340 }) => {
  const bySign = new Map<number, ChartGridPlanet[]>();
  for (const planet of planets) {
    const bucket = bySign.get(planet.rasi) ?? [];
    bucket.push(planet);
    bySign.set(planet.rasi, bucket);
  }

  const cell = `${100 / 4}%`;

  return (
    <figure className="w-full">
      <figcaption className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-faint">{title}</span>
        {lagnaRasiNumber ? (
          <span className="c-pill c-pill-brand !py-1 !text-[0.66rem]">
            Lagna · {SIGN_SHORT[lagnaRasiNumber] ?? lagnaRasiNumber}
          </span>
        ) : null}
      </figcaption>

      <div
        className="relative mx-auto grid overflow-hidden rounded-3xl border border-line bg-surface-2"
        style={{ width: '100%', maxWidth: size, aspectRatio: '1 / 1', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(4, 1fr)' }}
        role="img"
        aria-label={`${title}${lagnaRasiNumber ? `, ascendant in ${SIGN_SHORT[lagnaRasiNumber]}` : ''}`}
      >
        {GRID.map((slot) => {
          const occupants = bySign.get(slot.sign) ?? [];
          const isLagna = lagnaRasiNumber === slot.sign;
          return (
            <div
              key={slot.sign}
              style={{ width: cell, height: '100%' }}
              className={`relative flex flex-col gap-0.5 border border-line/80 p-1.5 ${
                isLagna ? 'bg-brand-soft' : ''
              }`}
            >
              <span
                className={`absolute right-1.5 top-1 text-[0.6rem] font-bold ${
                  isLagna ? 'text-brand-ink' : 'text-faint'
                }`}
              >
                {slot.sign}
              </span>
              {isLagna ? (
                <span className="c-display text-[0.62rem] font-semibold text-brand-ink">La</span>
              ) : null}
              <div className="mt-2.5 flex flex-wrap gap-x-1 gap-y-0.5">
                {occupants.map((planet) => (
                  <span
                    key={`${planet.graha}-${slot.sign}`}
                    title={`${planet.graha} ${planet.degrees ? `${planet.degrees.toFixed(1)}°` : ''}`}
                    className="text-[0.68rem] font-bold leading-tight text-ink"
                  >
                    {PLANET_SHORT[planet.graha] ?? planet.graha.slice(0, 2)}
                    {planet.isRetrograde ? <span className="text-rose">*</span> : null}
                    {typeof planet.degrees === 'number' ? (
                      <span className="ml-0.5 text-[0.55rem] font-semibold text-faint">
                        {Math.floor(planet.degrees)}
                      </span>
                    ) : null}
                  </span>
                ))}
              </div>
            </div>
          );
        })}

        {/* Centre panel of the kutam carries the caption, as on paper charts. */}
        <div className="pointer-events-none absolute inset-[25%] grid place-items-center rounded-xl border border-line bg-page-soft/80 px-2 text-center">
          <span className="text-[0.58rem] font-bold uppercase tracking-[0.08em] text-muted">
            {SIGN_SHORT[lagnaRasiNumber ?? 0] ? `${SIGN_SHORT[lagnaRasiNumber as number]} Lagna` : 'Rasi · D1'}
          </span>
        </div>
      </div>

      <p className="mt-2 text-center text-[0.68rem] text-faint">
        * retrograde · number beside a graha is its degree inside the rasi
      </p>
    </figure>
  );
};
