import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Baby,
  CalendarRange,
  CheckCircle2,
  Compass,
  Heart,
  Info,
  Loader2,
  MapPin,
  Moon,
  Play,
  Sparkles,
  Sun,
  Wand2
} from 'lucide-react';
import { SectionHeading, DataTile, ScoreBar } from '../components/ui/primitives';
import { ChartGrid } from '../components/light/ChartGrid';
import { useLightUi } from '../lightContext';
import {
  MUHURTHAM_EVENTS,
  PREVIEW_PLACES,
  chartFor,
  clampIsoDate,
  monthKeyOf,
  monthLabel,
  namingFor,
  offsetForPlace,
  panchangamFor,
  poruthamFor,
  scanWithLookahead,
  shiftMonthKey,
  type BabyNamingResult,
  type HoroscopeResult,
  type MuhurthamEventKey,
  type MuhurthamLookahead,
  type PanchangamResult,
  type WeddingMatchResult
} from '../lib/previewEngine';

interface LabPageProps {
  onNavigate: (route: string) => void;
}

type TabKey = 'panchangam' | 'chart' | 'porutham' | 'muhurtham' | 'naming';

const TABS: Array<{ key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'panchangam', label: 'Panchangam', icon: Sun },
  { key: 'chart', label: 'Your chart', icon: Compass },
  { key: 'porutham', label: 'Porutham match', icon: Heart },
  { key: 'muhurtham', label: 'Muhurtham month', icon: CalendarRange },
  { key: 'naming', label: 'Baby name letters', icon: Baby }
];

const GRADE_TONE: Record<string, string> = {
  BEST: 'c-pill c-pill-leaf',
  GOOD: 'c-pill c-pill-accent',
  FAIR: 'c-pill c-pill-brand',
  AVOID: 'c-pill c-pill-rose'
};

const todayIso = () => new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------------ inputs */

const FieldRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid gap-3 sm:grid-cols-2">{children}</div>
);

const PlaceField: React.FC<{
  value: number;
  onChange: (index: number) => void;
  label?: string;
}> = ({ value, onChange, label = 'Birth place' }) => (
  <label className="block">
    <span className="c-label">{label}</span>
    <select className="c-input" value={value} onChange={(event) => onChange(Number(event.target.value))}>
      {PREVIEW_PLACES.map((place, index) => (
        <option key={place.placeName} value={index}>
          {place.placeName}, {place.country}
        </option>
      ))}
    </select>
  </label>
);

const ErrorNote: React.FC<{ message: string }> = ({ message }) => (
  <p className="flex items-start gap-2 rounded-2xl border border-rose/25 bg-rose-soft px-4 py-3 text-[0.84rem] leading-6 text-rose">
    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
    <span>{message}</span>
  </p>
);

const LabNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="flex items-start gap-2 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-[0.78rem] leading-6 text-muted">
    <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
    <span>{children}</span>
  </p>
);

/* -------------------------------------------------------- panchangam panel */

const PanchangamPanel: React.FC = () => {
  const [placeIndex, setPlaceIndex] = useState(0);
  const [dateIso, setDateIso] = useState(todayIso());
  const [reading, setReading] = useState<PanchangamResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(() => {
    setBusy(true);
    try {
      const when = dateIso ? new Date(`${dateIso}T12:00:00`) : new Date();
      setReading(panchangamFor(PREVIEW_PLACES[placeIndex], when));
      setError(null);
    } catch (cause) {
      setReading(null);
      setError(cause instanceof Error ? cause.message : 'The panchangam could not be calculated.');
    } finally {
      setBusy(false);
    }
  }, [dateIso, placeIndex]);

  useEffect(() => {
    run();
  }, [run]);

  return (
    <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
      <div className="c-card space-y-4 p-5">
        <p className="c-eyebrow">Inputs</p>
        <FieldRow>
          <label className="block">
            <span className="c-label">City</span>
            <PlaceField value={placeIndex} onChange={setPlaceIndex} label="" />
          </label>
          <label className="block">
            <span className="c-label">Date</span>
            <input
              type="date"
              className="c-input"
              value={dateIso}
              max={todayIso()}
              onChange={(event) => setDateIso(clampIsoDate(event.target.value))}
            />
          </label>
        </FieldRow>
        <button type="button" onClick={run} className="c-btn c-btn-primary w-full" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 c-spin" /> : <Play className="h-4 w-4" />}
          Calculate panchangam
        </button>
        <LabNote>
          Computed locally with the repository’s sidereal engine — Lahiri ayanamsa, Drik panchangam,
          sunrise-based kalam windows. Open the browser console-free; nothing is sent anywhere.
        </LabNote>
      </div>

      <div className="space-y-4">
        {error ? <ErrorNote message={error} /> : null}
        {reading ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <DataTile label="Tithi" value={reading.tithiNameEn} tone="brand" hint={`${reading.tithiProgressPercent}% elapsed`} />
              <DataTile
                label="Nakshatra"
                value={reading.nakshatraNameEn}
                hint={`pada ${reading.nakshatraPada} · ${reading.nakshatraProgressPercent}% elapsed`}
              />
              <DataTile label="Yoga" value={reading.yogaNameEn} />
              <DataTile label="Karana" value={reading.karanaNameEn} />
              <DataTile label="Vara" value={reading.varaNameEn} />
              <DataTile label="Paksha" value={reading.tithiPaksha} tone="accent" />
            </div>

            <div className="c-card p-5">
              <p className="c-eyebrow mb-4">Day windows</p>
              <dl className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: 'Sunrise', value: reading.sunriseTime },
                  { label: 'Sunset', value: reading.sunsetTime },
                  { label: 'Abhijit muhurtham', value: `${reading.abhijitMuhurtham.start} – ${reading.abhijitMuhurtham.end}` },
                  { label: 'Rahu kalam', value: `${reading.rahuKalam.start} – ${reading.rahuKalam.end}`, bad: true },
                  { label: 'Yamagandam', value: `${reading.yamaGandam.start} – ${reading.yamaGandam.end}`, bad: true },
                  { label: 'Gulika kalam', value: `${reading.gulikaKalam.start} – ${reading.gulikaKalam.end}`, bad: true },
                  { label: 'Moonrise', value: reading.moonriseTime ?? '—' },
                  { label: 'Moonset', value: reading.moonsetTime ?? '—' }
                ].map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-3 border-b border-line pb-2 last:border-0">
                    <dt className="text-[0.8rem] font-semibold text-muted">{row.label}</dt>
                    <dd className={`text-[0.85rem] font-bold ${row.bad ? 'text-rose' : 'text-ink'}`}>
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <p className="text-[0.72rem] text-faint">
              {reading.cityName}, {reading.country} · {reading.latitude.toFixed(4)}, {reading.longitude.toFixed(4)} ·
              UTC{offsetForPlace(PREVIEW_PLACES[placeIndex]) >= 0 ? '+' : ''}
              {offsetForPlace(PREVIEW_PLACES[placeIndex])} at this date
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------- chart panel */

const ChartPanel: React.FC<{ onNavigate: (route: string) => void }> = ({ onNavigate }) => {
  const [name, setName] = useState('');
  const [dob, setDob] = useState('1994-08-12');
  const [tob, setTob] = useState('06:42');
  const [placeIndex, setPlaceIndex] = useState(0);
  const [gender, setGender] = useState<'M' | 'F'>('M');
  const [chart, setChart] = useState<HoroscopeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = (event?: React.FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    try {
      setChart(
        chartFor({
          name: name.trim() || 'Preview person',
          dob,
          tob,
          place: PREVIEW_PLACES[placeIndex],
          gender
        }),
      );
      setError(null);
    } catch (cause) {
      setChart(null);
      setError(cause instanceof Error ? cause.message : 'The chart could not be calculated.');
    } finally {
      setBusy(false);
    }
  };

  const doshas = chart?.doshas ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <form onSubmit={run} className="c-card space-y-4 p-5">
        <p className="c-eyebrow">Birth particulars</p>
        <label className="block">
          <span className="c-label">Name</span>
          <input
            className="c-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Optional in the lab"
          />
        </label>
        <FieldRow>
          <label className="block">
            <span className="c-label">Date of birth</span>
            <input
              type="date"
              className="c-input"
              value={dob}
              max={todayIso()}
              onChange={(event) => setDob(clampIsoDate(event.target.value))}
            />
          </label>
          <label className="block">
            <span className="c-label">Time of birth</span>
            <input
              type="time"
              className="c-input"
              value={tob}
              onChange={(event) => setTob(event.target.value)}
            />
          </label>
        </FieldRow>
        <PlaceField value={placeIndex} onChange={setPlaceIndex} />
        <div>
          <span className="c-label">Gender (used only by name suggestions)</span>
          <div className="flex gap-2">
            {(['M', 'F'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setGender(value)}
                className={`flex-1 rounded-2xl border px-3 py-2.5 text-[0.85rem] font-bold transition-all ${
                  gender === value
                    ? 'border-brand bg-brand-soft text-brand-ink'
                    : 'border-line bg-surface text-muted hover:border-line-strong'
                }`}
              >
                {value === 'M' ? 'Male' : 'Female'}
              </button>
            ))}
          </div>
        </div>
        <button type="submit" className="c-btn c-btn-primary w-full" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 c-spin" /> : <Sparkles className="h-4 w-4" />}
          Calculate my chart
        </button>
        <LabNote>
          This is the same function the ordered report runs (<code className="text-ink">calculatePrecisionHoroscope</code>).
          The paid PDF adds the priest review, the full dasha tables, the remedies and the invoice.
        </LabNote>
      </form>

      <div className="space-y-5">
        {error ? <ErrorNote message={error} /> : null}

        {!chart && !error ? (
          <div className="c-card grid place-items-center p-12 text-center">
            <Compass className="h-9 w-9 text-brand-tint" />
            <p className="c-display mt-4 text-[1.15rem] text-ink">Your chart appears here</p>
            <p className="mt-2 max-w-sm text-[0.85rem] leading-6 text-muted">
              Press “Calculate my chart”. The engine resolves the birth instant through the IANA time zone
              of the birth place, so DST and historical offsets are handled correctly.
            </p>
          </div>
        ) : null}

        {chart ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <DataTile label="Lagna" value={chart.lagnaRasiNameEn} tone="brand" hint={`${chart.lagnaDegrees.toFixed(2)}°`} />
              <DataTile label="Chandra rasi" value={chart.chandraRasiNameEn} />
              <DataTile
                label="Janma nakshatra"
                value={chart.janmaNakshatraEn}
                hint={`pada ${chart.janmaPada}`}
              />
              <DataTile
                label="Current dasha"
                value={chart.currentDasha ? chart.currentDasha.mahadashaLordEn : '—'}
                tone="accent"
                hint={
                  chart.currentDasha
                    ? `${chart.currentDasha.antardashaLordEn} antardasha`
                    : 'dasha timeline unavailable'
                }
              />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="c-card p-5">
                <ChartGrid
                  lagnaRasiNumber={chart.lagnaRasiNumber ?? chart.lagnaRasi}
                  planets={chart.planetPositions.map((planet) => ({
                    graha: planet.graha,
                    rasi: Number(planet.rasi),
                    isRetrograde: planet.isRetrograde,
                    degrees: planet.degrees
                  }))}
                />
              </div>

              <div className="c-card p-5">
                <p className="c-eyebrow mb-3">Navagraha positions</p>
                <div className="overflow-x-auto c-scroll">
                  <table className="w-full text-left text-[0.8rem]">
                    <thead>
                      <tr className="text-[0.66rem] uppercase tracking-[0.12em] text-faint">
                        <th className="pb-2 pr-2 font-bold">Graha</th>
                        <th className="pb-2 pr-2 font-bold">Rasi</th>
                        <th className="pb-2 pr-2 font-bold">Deg</th>
                        <th className="pb-2 font-bold">State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chart.planetPositions.map((planet) => (
                        <tr key={planet.graha} className="border-t border-line">
                          <td className="py-2 pr-2 font-semibold text-ink">{planet.nameEn}</td>
                          <td className="py-2 pr-2 text-ink-soft">{planet.rasiNameEn}</td>
                          <td className="py-2 pr-2 tabular-nums text-ink-soft">
                            {planet.degrees.toFixed(1)}°
                          </td>
                          <td className="py-2">
                            <span className="flex flex-wrap gap-1">
                              {planet.isRetrograde ? <span className="c-pill c-pill-rose !py-0.5 !text-[0.62rem]">Retro</span> : null}
                              {planet.isCombust ? <span className="c-pill c-pill-brand !py-0.5 !text-[0.62rem]">Combust</span> : null}
                              {planet.dignity?.isExalted ? (
                                <span className="c-pill c-pill-leaf !py-0.5 !text-[0.62rem]">Exalted</span>
                              ) : null}
                              {planet.dignity?.isDebilitated ? (
                                <span className="c-pill c-pill-rose !py-0.5 !text-[0.62rem]">Debilitated</span>
                              ) : null}
                              {!planet.isRetrograde && !planet.isCombust && !planet.dignity?.isExalted && !planet.dignity?.isDebilitated ? (
                                <span className="text-faint">—</span>
                              ) : null}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="c-card p-5">
                <p className="c-eyebrow mb-3">Vimshottari dasha</p>
                {chart.currentDasha ? (
                  <>
                    <p className="c-display text-[1.15rem] text-ink">
                      {chart.currentDasha.mahadashaLordEn} mahadasha
                    </p>
                    <p className="mt-1 text-[0.8rem] text-muted">
                      {chart.currentDasha.mahadashaStart} → {chart.currentDasha.mahadashaEnd}
                    </p>
                    <p className="mt-3 rounded-2xl border border-line bg-surface-2 px-3.5 py-3 text-[0.82rem] text-ink-soft">
                      Antardasha: <strong className="text-ink">{chart.currentDasha.antardashaLordEn}</strong>{' '}
                      ({chart.currentDasha.antardashaStart} → {chart.currentDasha.antardashaEnd})
                    </p>
                    <ul className="mt-3 space-y-1.5">
                      {chart.dashaPeriods.slice(0, 5).map((period) => (
                        <li
                          key={`${period.lordNameEn}-${period.startDate}`}
                          className="flex items-center justify-between gap-3 border-b border-line pb-1.5 text-[0.78rem] last:border-0"
                        >
                          <span className="font-semibold text-ink-soft">{period.lordNameEn}</span>
                          <span className="tabular-nums text-faint">
                            {period.startDate} → {period.endDate}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-[0.85rem] text-muted">Dasha timeline unavailable for this chart.</p>
                )}
              </div>

              <div className="c-card p-5">
                <p className="c-eyebrow mb-3">Dosha findings</p>
                <ul className="space-y-3">
                  {doshas.slice(0, 6).map((dosha) => {
                    const present = dosha.isPresent === true;
                    const unknown = dosha.isPresent === null;
                    return (
                      <li key={dosha.nameEn} className="rounded-2xl border border-line bg-surface-2 px-3.5 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[0.85rem] font-bold text-ink">{dosha.nameEn}</span>
                          <span
                            className={`c-pill !py-0.5 !text-[0.62rem] ${
                              unknown ? '' : present ? 'c-pill-rose' : 'c-pill-leaf'
                            }`}
                          >
                            {unknown ? 'Not assessed' : present ? 'Present' : 'Absent'}
                          </span>
                        </div>
                        <p className="mt-1.5 text-[0.76rem] leading-6 text-muted">{dosha.descriptionEn}</p>
                      </li>
                    );
                  })}
                  {!doshas.length ? (
                    <li className="text-[0.85rem] text-muted">No dosha findings were returned.</li>
                  ) : null}
                </ul>
              </div>
            </div>

            <div className="c-card flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
              <div>
                <p className="c-display text-[1.1rem] text-ink">
                  Want the full {chart.devoteeName} report?
                </p>
                <p className="mt-1 text-[0.82rem] text-muted">
                  Twenty-plus pages of dasha tables, bhava readings, life aspects, remedies and your charts.
                </p>
              </div>
              <button type="button" onClick={() => onNavigate('jathagam')} className="c-btn c-btn-primary">
                See the Birth Jathagam report
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

/* ---------------------------------------------------------- porutham panel */

const PoruthamPanel: React.FC<{ onNavigate: (route: string) => void }> = ({ onNavigate }) => {
  const [bride, setBride] = useState({ name: 'Bride', dob: '1996-03-14', tob: '10:05', place: 0 });
  const [groom, setGroom] = useState({ name: 'Groom', dob: '1993-11-02', tob: '21:20', place: 0 });
  const [result, setResult] = useState<WeddingMatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = (event?: React.FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    try {
      setResult(
        poruthamFor(
          {
            name: bride.name || 'Bride',
            dob: bride.dob,
            tob: bride.tob,
            place: PREVIEW_PLACES[bride.place],
            gender: 'F'
          },
          {
            name: groom.name || 'Groom',
            dob: groom.dob,
            tob: groom.tob,
            place: PREVIEW_PLACES[groom.place],
            gender: 'M'
          },
        ),
      );
      setError(null);
    } catch (cause) {
      setResult(null);
      setError(cause instanceof Error ? cause.message : 'The porutham could not be calculated.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="grid gap-5 lg:grid-cols-2">
        {[
          { title: 'Bride', state: bride, setState: setBride },
          { title: 'Groom', state: groom, setState: setGroom }
        ].map((person) => (
          <div key={person.title} className="c-card space-y-4 p-5">
            <p className="c-eyebrow">{person.title}</p>
            <label className="block">
              <span className="c-label">Name</span>
              <input
                className="c-input"
                value={person.state.name}
                onChange={(event) => person.setState({ ...person.state, name: event.target.value })}
              />
            </label>
            <FieldRow>
              <label className="block">
                <span className="c-label">Date of birth</span>
                <input
                  type="date"
                  className="c-input"
                  value={person.state.dob}
                  max={todayIso()}
                  onChange={(event) =>
                    person.setState({ ...person.state, dob: clampIsoDate(event.target.value) })
                  }
                />
              </label>
              <label className="block">
                <span className="c-label">Time of birth</span>
                <input
                  type="time"
                  className="c-input"
                  value={person.state.tob}
                  onChange={(event) => person.setState({ ...person.state, tob: event.target.value })}
                />
              </label>
            </FieldRow>
            <PlaceField
              label="Birth place"
              value={person.state.place}
              onChange={(index) => person.setState({ ...person.state, place: index })}
            />
          </div>
        ))}

        <div className="lg:col-span-2">
          <button type="submit" className="c-btn c-btn-primary" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 c-spin" /> : <Heart className="h-4 w-4" />}
            Score the ten poruthams
          </button>
        </div>
      </form>

      {error ? <ErrorNote message={error} /> : null}

      {result ? (
        <div className="space-y-5">
          <div className="c-card grid gap-5 p-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="c-eyebrow">Overall verdict</p>
              <p className="c-display mt-2 text-[1.6rem] leading-tight text-ink">
                {result.totalScore} / {result.maxScore} points
              </p>
              <p className="mt-1 text-[0.85rem] font-semibold text-brand-ink">
                {result.totalPoruthamsMatched} of {result.poruthams.length} poruthams matched ·{' '}
                {result.verdictStatus.toLowerCase()}
              </p>
              <p className="mt-3 text-[0.88rem] leading-7 text-muted">{result.overallVerdictEn}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className={`c-pill ${result.rajjuMatch ? 'c-pill-leaf' : 'c-pill-rose'}`}>
                  Rajju {result.rajjuMatch ? 'compatible' : 'conflict'}
                </span>
                <span className={`c-pill ${result.vedhaMatch ? 'c-pill-rose' : 'c-pill-leaf'}`}>
                  Vedha {result.vedhaMatch ? 'present' : 'clear'}
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <DataTile label="Bride rasi" value={result.brideRasiNameEn} hint={`${result.brideNakshatraNameEn} · pada ${result.bridePada}`} />
              <DataTile label="Groom rasi" value={result.groomRasiNameEn} hint={`${result.groomNakshatraNameEn} · pada ${result.groomPada}`} />
              <DataTile
                label="Kuja dosha"
                value={result.sevvayDosham.doshaSamyamStatusEn}
                tone="rose"
                hint={result.sevvayDosham.recommendationEn}
              />
              <DataTile
                label="Bride / Groom Mars house"
                value={`${result.brideMarsHouse ?? '—'} / ${result.groomMarsHouse ?? '—'}`}
              />
            </div>
          </div>

          <div className="c-card overflow-hidden">
            <div className="border-b border-line px-5 py-4">
              <p className="c-eyebrow">Ten poruthams</p>
            </div>
            <ul>
              {result.poruthams.map((porutham) => {
                const tone = porutham.status === 'UTTHAMAM' ? 'leaf' : porutham.status === 'MADHYAMAM' ? 'brand' : 'rose';
                return (
                  <li key={porutham.id} className="border-b border-line px-5 py-4 last:border-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <span className="text-[0.9rem] font-bold text-ink">{porutham.nameEn}</span>
                        <span className="text-[0.75rem] text-faint">{porutham.nameTa}</span>
                        {porutham.isCrucial ? (
                          <span className="c-pill c-pill-brand !py-0.5 !text-[0.6rem]">Crucial</span>
                        ) : null}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="w-28">
                          <ScoreBar value={porutham.pointsEarned} max={porutham.maxPoints} tone={tone as 'leaf'} />
                        </span>
                        <span className="text-[0.78rem] font-bold tabular-nums text-ink">
                          {porutham.pointsEarned}/{porutham.maxPoints}
                        </span>
                      </span>
                    </div>
                    <p className="mt-1.5 text-[0.8rem] leading-6 text-muted">{porutham.explanationEn}</p>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="c-card flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
            <p className="max-w-xl text-[0.85rem] leading-6 text-muted">
              The paid Marriage Porutham report carries the full commentary, the dasa-sandhi comparison,
              the dosha remedies in your language and a shareable summary page.
            </p>
            <button type="button" onClick={() => onNavigate('porutham')} className="c-btn c-btn-primary">
              See the Marriage Porutham report
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

/* -------------------------------------------------------- muhurtham panel */

const MuhurthamPanel: React.FC<{ onNavigate: (route: string) => void }> = ({ onNavigate }) => {
  const [monthKey, setMonthKey] = useState(() => monthKeyOf(new Date()));
  const [placeIndex, setPlaceIndex] = useState(0);
  const [eventKey, setEventKey] = useState<MuhurthamEventKey>('wedding');
  const [lookahead, setLookahead] = useState<MuhurthamLookahead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [onlyRecommended, setOnlyRecommended] = useState(true);

  const run = useCallback(() => {
    setBusy(true);
    try {
      setLookahead(scanWithLookahead(monthKey, PREVIEW_PLACES[placeIndex], eventKey));
      setError(null);
    } catch (cause) {
      setLookahead(null);
      setError(cause instanceof Error ? cause.message : 'The month scan failed.');
    } finally {
      setBusy(false);
    }
  }, [monthKey, placeIndex, eventKey]);

  useEffect(() => {
    run();
  }, [run]);

  const scan = lookahead?.scan ?? null;

  const days = useMemo(() => {
    if (!scan) return [];
    const list = onlyRecommended ? scan.days.filter((day) => day.grade !== 'AVOID') : scan.days;
    return [...list].sort((a, b) => b.score - a.score).slice(0, 24);
  }, [scan, onlyRecommended]);

  return (
    <div className="space-y-6">
      <div className="c-card grid gap-4 p-5 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
        <label className="block">
          <span className="c-label">Month</span>
          <input
            type="month"
            className="c-input"
            value={monthKey}
            min={monthKeyOf(new Date())}
            onChange={(event) => setMonthKey(event.target.value || monthKey)}
          />
        </label>
        <PlaceField value={placeIndex} onChange={setPlaceIndex} label="Ceremony place" />
        <label className="block">
          <span className="c-label">Ceremony</span>
          <select
            className="c-input"
            value={eventKey}
            onChange={(event) => setEventKey(event.target.value as MuhurthamEventKey)}
          >
            {MUHURTHAM_EVENTS.map((event) => (
              <option key={event.key} value={event.key}>
                {event.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={run} className="c-btn c-btn-primary" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 c-spin" /> : <Moon className="h-4 w-4" />}
          Scan month
        </button>
      </div>

      {scan ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DataTile label="Best days" value={scan.bestCount} tone="leaf" />
            <DataTile label="Good days" value={scan.goodCount} tone="accent" />
            <DataTile label="Fair days" value={scan.fairCount} tone="brand" />
            <DataTile label="Avoid" value={scan.avoidCount} tone="rose" />
          </div>

          {lookahead && lookahead.skippedMonths.length > 0 ? (
            <p className="rounded-2xl border border-brand/30 bg-brand-soft px-4 py-3 text-[0.82rem] leading-6 text-brand-ink">
              No usable day for this ceremony in{' '}
              {lookahead.skippedMonths.map(monthLabel).join(', ')} — the month is traditionally avoided (Sukra
              asta, Adhika Masa or a Pitru period). Scanning{' '}
              <strong>{monthLabel(lookahead.monthKey)}</strong> instead.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="c-display text-[1.15rem] text-ink">
              {monthLabel(lookahead?.monthKey ?? monthKey)} ·{' '}
              {MUHURTHAM_EVENTS.find((event) => event.key === eventKey)?.label}
            </p>
            <button
              type="button"
              onClick={() => setOnlyRecommended((value) => !value)}
              className="c-tab"
              data-active={onlyRecommended}
            >
              {onlyRecommended ? 'Showing recommended' : 'Showing every day'}
            </button>
          </div>

          <ul className="grid gap-3 lg:grid-cols-2">
            {days.map((day) => (
              <li key={day.date} className="c-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="c-display text-[1.05rem] text-ink">
                      {day.date} · {day.dayOfWeekNameEn}
                    </p>
                    <p className="mt-0.5 text-[0.76rem] text-muted">
                      {day.tithiNameEn} · {day.nakshatraNameEn} (pada {day.pada})
                    </p>
                  </div>
                  <span className={GRADE_TONE[day.grade] ?? 'c-pill'}>
                    {day.grade} · {day.score}
                  </span>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-2 text-[0.74rem]">
                  <div className="rounded-xl border border-line bg-surface-2 px-2.5 py-2">
                    <dt className="font-bold text-faint">Nalla neram</dt>
                    <dd className="mt-0.5 font-semibold text-leaf">
                      {day.nallaNeram.length
                        ? day.nallaNeram.map((window) => `${window.start}–${window.end}`).join(', ')
                        : '—'}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-line bg-surface-2 px-2.5 py-2">
                    <dt className="font-bold text-faint">Rahu kalam</dt>
                    <dd className="mt-0.5 font-semibold text-rose">
                      {day.rahuKalam.start}–{day.rahuKalam.end}
                    </dd>
                  </div>
                </dl>

                {day.reasonsEn.length ? (
                  <p className="mt-2.5 text-[0.76rem] leading-6 text-muted">
                    {day.reasonsEn.slice(0, 2).join(' · ')}
                  </p>
                ) : null}
                {day.personalNoteEn ? (
                  <p className="mt-1.5 text-[0.74rem] leading-6 text-accent">{day.personalNoteEn}</p>
                ) : null}
              </li>
            ))}
          </ul>

          <LabNote>
            Grades come from <code className="text-ink">scanMonthMuhurtham()</code> — the same panchangam
            rules, asta windows and Panchaka checks the ordered report uses, with past dates skipped. Add the
            bride, groom or child details in the paid report and each day is additionally checked against
            their Tara Balam and Chandrashtama.
          </LabNote>

          <div className="c-card flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
            <p className="max-w-xl text-[0.85rem] leading-6 text-muted">
              The Subha Muhurtham report covers six months, adds everyone’s personal checks and picks the
              ceremony-specific rules for your event.
            </p>
            <button type="button" onClick={() => onNavigate('muhurtham')} className="c-btn c-btn-primary">
              See the Muhurtham report
            </button>
          </div>
        </>
      ) : error ? (
        <ErrorNote message={error} />
      ) : null}
    </div>
  );
};

/* ----------------------------------------------------------- naming panel */

const NamingPanel: React.FC<{ onNavigate: (route: string) => void }> = ({ onNavigate }) => {
  const [babyName, setBabyName] = useState('');
  const [dob, setDob] = useState(todayIso());
  const [tob, setTob] = useState('09:15');
  const [placeIndex, setPlaceIndex] = useState(0);
  const [gender, setGender] = useState<'M' | 'F'>('F');
  const [result, setResult] = useState<BabyNamingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const babyPada = useMemo(() => {
    const padas = (result as { nameSuggestions?: Array<{ padaNumber: number; soundEn: string; rasiEn: string; south: any[]; north: any[] }> })
      ?.nameSuggestions;
    if (!padas?.length || !result) return null;
    return padas.find((entry) => entry.padaNumber === result.janmaPada) ?? padas[0];
  }, [result]);

  const run = (event?: React.FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    try {
      setResult(
        namingFor({
          name: babyName.trim() || (gender === 'F' ? 'Baby Girl' : 'Baby Boy'),
          dob,
          tob,
          place: PREVIEW_PLACES[placeIndex],
          gender
        }) as BabyNamingResult,
      );
      setError(null);
    } catch (cause) {
      setResult(null);
      setError(cause instanceof Error ? cause.message : 'The naming letters could not be calculated.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <form onSubmit={run} className="c-card space-y-4 p-5">
        <p className="c-eyebrow">Baby’s birth particulars</p>
        <label className="block">
          <span className="c-label">Baby’s name (optional)</span>
          <input
            className="c-input"
            value={babyName}
            onChange={(event) => setBabyName(event.target.value)}
            placeholder="Leave blank to use a placeholder"
          />
        </label>
        <FieldRow>
          <label className="block">
            <span className="c-label">Date of birth</span>
            <input
              type="date"
              className="c-input"
              value={dob}
              max={todayIso()}
              onChange={(event) => setDob(clampIsoDate(event.target.value))}
            />
          </label>
          <label className="block">
            <span className="c-label">Time of birth</span>
            <input type="time" className="c-input" value={tob} onChange={(event) => setTob(event.target.value)} />
          </label>
        </FieldRow>
        <PlaceField value={placeIndex} onChange={setPlaceIndex} label="Birth place" />
        <div>
          <span className="c-label">Baby’s gender</span>
          <div className="flex gap-2">
            {(['F', 'M'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setGender(value)}
                className={`flex-1 rounded-2xl border px-3 py-2.5 text-[0.85rem] font-bold transition-all ${
                  gender === value
                    ? 'border-brand bg-brand-soft text-brand-ink'
                    : 'border-line bg-surface text-muted hover:border-line-strong'
                }`}
              >
                {value === 'F' ? 'Girl' : 'Boy'}
              </button>
            ))}
          </div>
        </div>
        <button type="submit" className="c-btn c-btn-primary w-full" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 c-spin" /> : <Baby className="h-4 w-4" />}
          Show the naming syllables
        </button>
        <LabNote>
          The syllable comes from the Moon’s position in the baby’s Janma Nakshatra pada — the classical
          Namakaranam rule. The ordered report adds the curated name bank, meanings, the certificate and the
          full keepsake pages.
        </LabNote>
      </form>

      <div className="space-y-5">
        {error ? <ErrorNote message={error} /> : null}

        {result ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <DataTile label="Janma nakshatra" value={result.nakshatraLetters?.nakshatraNameEn ?? '—'} tone="brand" />
              <DataTile label="Pada" value={result.janmaPada} />
              <DataTile label="Chandra rasi" value={result.chandraRasiNameEn} />
              <DataTile label="Lagna" value={result.lagnaRasiNameEn} tone="accent" />
            </div>

            <div className="c-card p-5">
              <p className="c-eyebrow mb-3">Name syllables for every pada</p>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {(result.nakshatraLetters?.padas ?? []).map((pada) => {
                  const isBabyPada = pada.padaNumber === result.janmaPada;
                  return (
                    <li
                      key={pada.padaNumber}
                      className={`rounded-2xl border px-4 py-4 text-center ${
                        isBabyPada ? 'border-brand bg-brand-soft' : 'border-line bg-surface-2'
                      }`}
                    >
                      <p className="text-[0.66rem] font-bold uppercase tracking-[0.14em] text-faint">
                        Pada {pada.padaNumber}
                      </p>
                      <p className="c-display mt-1.5 text-[1.6rem] leading-none text-ink">{pada.letterEn}</p>
                      <p className="mt-1 text-[0.8rem] text-brand-ink">{pada.letterTa}</p>
                      <p className="mt-1 text-[0.7rem] text-muted">{pada.rasiEn}</p>
                      {isBabyPada ? (
                        <p className="mt-2 inline-flex items-center gap-1 text-[0.66rem] font-bold text-brand-ink">
                          <CheckCircle2 className="h-3.5 w-3.5" /> this baby
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              {result.nakshatraLetters?.allLettersSummaryEn ? (
                <p className="mt-4 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-[0.82rem] text-ink-soft">
                  {result.nakshatraLetters.allLettersSummaryEn}
                </p>
              ) : null}
            </div>

            <div className="c-card p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="c-eyebrow">Names for this pada, with meanings</p>
                <p className="text-[0.72rem] text-faint">
                  {babyPada ? `pada ${babyPada.padaNumber} · {babyPada.soundEn} · {babyPada.rasiEn}` : ''}
                </p>
              </div>

              {babyPada ? (
                <div className="mt-4 grid gap-5 lg:grid-cols-2">
                  {([
                    { title: 'South Indian naming', list: babyPada.south },
                    { title: 'North Indian naming', list: babyPada.north }
                  ] as const).map((column) => (
                    <div key={column.title}>
                      <p className="text-[0.72rem] font-bold uppercase tracking-[0.12em] text-faint">
                        {column.title}
                      </p>
                      <ul className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
                        {column.list.slice(0, 8).map((name) => (
                          <li
                            key={`{column.title}-{name.name}`}
                            className="rounded-2xl border border-line bg-surface-2 px-3.5 py-3"
                          >
                            <p className="c-display text-[1rem] text-ink">{name.name}</p>
                            <p className="mt-0.5 text-[0.74rem] leading-5 text-muted">{name.meaningEn}</p>
                          </li>
                        ))}
                        {!column.list.length ? (
                          <li className="text-[0.8rem] text-muted">No names in this list.</li>
                        ) : null}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : null}

              {(result.suggestedNames ?? []).length ? (
                <div className="mt-5 border-t border-line pt-4">
                  <p className="text-[0.72rem] font-bold uppercase tracking-[0.12em] text-faint">
                    Shortlist the report prints first
                  </p>
                  <ul className="mt-2.5 flex flex-wrap gap-2">
                    {result.suggestedNames.map((name) => (
                      <li key={name.nameEn} className="c-pill c-pill-brand">
                        {name.nameEn} · {name.meaningEn}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="c-card flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
              <p className="max-w-xl text-[0.85rem] leading-6 text-muted">
                The Vedic Baby Naming report carries the full name bank for every pada, meanings, the
                birth-star details and a printable naming certificate.
              </p>
              <button type="button" onClick={() => onNavigate('naming')} className="c-btn c-btn-primary">
                See the Baby Naming report
              </button>
            </div>
          </>
        ) : null}

        {!result && !error ? (
          <div className="c-card grid place-items-center p-12 text-center">
            <Baby className="h-9 w-9 text-brand-tint" />
            <p className="c-display mt-4 text-[1.15rem] text-ink">The naming letters appear here</p>
            <p className="mt-2 max-w-sm text-[0.85rem] leading-6 text-muted">
              Nakshatra, pada, the auspicious syllable (ezhuthu) for each pada, and names that begin with
              them.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------- page */

export const PreviewLabPage: React.FC<LabPageProps> = ({ onNavigate }) => {
  const [tab, setTab] = useState<TabKey>('panchangam');
  const { notify } = useLightUi();

  useEffect(() => {
    notify('Preview Lab ready — the real engine runs in your browser.', 'good');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="pb-6">
      <section className="relative">
        <div className="c-glow pointer-events-none absolute inset-x-0 top-0 h-80" aria-hidden="true" />
        <div className="c-shell relative pt-10 sm:pt-14">
          <p className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent-soft px-3 py-1.5 text-[0.7rem] font-bold uppercase tracking-[0.14em] text-accent">
            <Wand2 className="h-3.5 w-3.5" />
            No sign-up · no payment · runs offline
          </p>
          <h1 className="c-display mt-4 max-w-3xl text-[2.1rem] leading-[1.1] text-ink sm:text-[2.7rem]">
            The Free Preview Lab
          </h1>
          <p className="mt-4 max-w-2xl text-[0.98rem] leading-7 text-muted sm:text-[1.05rem]">
            Five things you can try right now with the site’s own sidereal engine: today’s panchangam, a
            live birth chart, a ten-porutham match, a muhurtham month scan, and the naming syllable for a
            newborn. Everything is calculated in this browser tab.
          </p>

          <div className="mt-7 flex gap-1.5 overflow-x-auto c-scroll">
            {TABS.map((entry) => {
              const Icon = entry.icon;
              return (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setTab(entry.key)}
                  className="c-tab flex shrink-0 items-center gap-2"
                  data-active={tab === entry.key}
                  aria-pressed={tab === entry.key}
                >
                  <Icon className="h-4 w-4" />
                  {entry.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="c-shell mt-8">
        {tab === 'panchangam' ? <PanchangamPanel /> : null}
        {tab === 'chart' ? <ChartPanel onNavigate={onNavigate} /> : null}
        {tab === 'porutham' ? <PoruthamPanel onNavigate={onNavigate} /> : null}
        {tab === 'muhurtham' ? <MuhurthamPanel onNavigate={onNavigate} /> : null}
        {tab === 'naming' ? <NamingPanel onNavigate={onNavigate} /> : null}
      </section>

      <section className="c-shell mt-16">
        <div className="c-card flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
          <SectionHeading
            eyebrow="What the lab is not"
            title="A preview, not the report"
            lead="The lab shows the raw engine output so you can sanity-check it yourself. The delivered PDF adds the priest review, the full page set, the remedies in your language, the certificate where it applies, and the tax invoice."
            className="max-w-2xl"
          />
          <button type="button" onClick={() => onNavigate('services')} className="c-btn c-btn-primary shrink-0">
            Compare the four reports
          </button>
        </div>
      </section>

      <section className="c-shell mt-8">
        <p className="flex items-start gap-2 text-[0.74rem] leading-6 text-faint">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
          Time zones are resolved through IANA zone data for the selected city, so a birth at 06:42 in
          Chennai and a birth at 06:42 in London are each placed at the correct universal instant.
        </p>
      </section>
    </div>
  );
};
