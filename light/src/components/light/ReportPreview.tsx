import React, { useMemo } from 'react';
import { Calculator, CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import { DataTile, ScoreBar } from '../ui/primitives';
import {
  chartFor,
  namingFor,
  poruthamFor,
  scanWithLookahead,
  monthLabel,
  monthKeyOf,
  shiftMonthKey,
  PREVIEW_PLACES,
  type BabyNamingResult,
  type HoroscopeResult,
  type WeddingMatchResult
} from '../../lib/previewEngine';
import {
  SAMPLE_BIRTH,
  SAMPLE_BRIDE,
  SAMPLE_BRIDE_NAME,
  SAMPLE_DEVOTEE_NAME,
  SAMPLE_MUHURTHAM_EVENT_KEY,
  sampleDetailsLine
} from '@shared/services/sampleReportInfo';
import { PoruthamStatus } from '@shared/lib/astrology/types';
import type { ServiceType } from '@shared/types';

/** Chennai is the sample's place — the same row the sample PDFs use. */
const SAMPLE_PLACE =
  PREVIEW_PLACES.find((place) => place.placeName === SAMPLE_BIRTH.birthPlace.split(',')[0]) ??
  PREVIEW_PLACES[0];

const PORUTHAM_TONE: Record<PoruthamStatus, { tone: string; Icon: typeof CheckCircle2; label: string }> = {
  [PoruthamStatus.UTTHAMAM]: { tone: 'text-leaf', Icon: CheckCircle2, label: 'Utthamam' },
  [PoruthamStatus.MADHYAMAM]: { tone: 'text-brand-ink', Icon: MinusCircle, label: 'Madhyamam' },
  [PoruthamStatus.PORUNDHADHU]: { tone: 'text-rose', Icon: XCircle, label: 'Porundhadhu' }
};

const GRADE_STYLE: Record<string, string> = {
  BEST: 'border-leaf/30 bg-leaf-soft text-leaf',
  GOOD: 'border-accent/30 bg-accent-soft text-accent',
  FAIR: 'border-brand/30 bg-brand-soft text-brand-ink',
  AVOID: 'border-rose/25 bg-rose-soft text-rose'
};

const BirthPreview: React.FC<{ chart: HoroscopeResult }> = ({ chart }) => (
  <div className="grid gap-3 sm:grid-cols-3">
    <DataTile
      label="Ascendant (Lagna)"
      value={chart.lagnaRasiNameEn}
      hint={`${chart.lagnaDegrees.toFixed(2)}°`}
      tone="brand"
    />
    <DataTile label="Chandra Rasi" value={chart.chandraRasiNameEn} tone="accent" />
    <DataTile
      label="Janma Nakshatra"
      value={chart.janmaNakshatraEn}
      hint={`pada ${chart.janmaPada}`}
    />
    <DataTile
      label="Vimshottari Mahadasha"
      value={chart.currentDasha?.mahadashaLordEn ?? '—'}
      hint={
        chart.currentDasha?.antardashaLordEn
          ? `${chart.currentDasha.antardashaLordEn} antardasha`
          : undefined
      }
      tone="leaf"
    />
    <DataTile label="Navagraha longitudes" value={`${chart.planetPositions.length} grahas mapped`} />
    <DataTile label="Report languages" value="Tamil · English · Hindi" />
  </div>
);

const PoruthamPreview: React.FC<{ result: WeddingMatchResult }> = ({ result }) => (
  <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3">
      <DataTile
        label="Porutham score"
        value={`${result.totalScore} / ${result.maxScore}`}
        hint={`${result.totalPoruthamsMatched} poruthams matched`}
        tone="brand"
      />
      <DataTile label="Bride star" value={result.brideNakshatraNameEn} hint={result.brideRasiNameEn} tone="rose" />
      <DataTile label="Groom star" value={result.groomNakshatraNameEn} hint={result.groomRasiNameEn} tone="accent" />
    </div>

    <ul className="grid gap-2 sm:grid-cols-2">
      {result.poruthams.map((porutham) => {
        const style = PORUTHAM_TONE[porutham.status];
        const Icon = style.Icon;
        return (
          <li
            key={porutham.id}
            className="flex items-start gap-2.5 rounded-2xl border border-line bg-surface-2 px-3.5 py-3"
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.tone}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.84rem] font-bold text-ink">{porutham.nameEn}</span>
                <span className={`text-[0.7rem] font-bold uppercase tracking-[0.1em] ${style.tone}`}>
                  {style.label}
                </span>
              </div>
              <div className="mt-2">
                <ScoreBar value={porutham.pointsEarned} max={porutham.maxPoints} tone="rose" />
              </div>
            </div>
          </li>
        );
      })}
    </ul>

    <p className="rounded-2xl border border-line bg-surface-2 p-4 text-[0.82rem] leading-6 text-ink-soft">
      <strong className="text-ink">Verdict:</strong> {result.overallVerdictEn}{' '}
      <span className="text-muted">{result.sevvayDosham.doshaSamyamStatusEn}</span>
    </p>
  </div>
);

const NamingPreview: React.FC<{ result: BabyNamingResult }> = ({ result }) => (
  <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3">
      <DataTile label="Janma Nakshatra" value={result.nakshatraLetters.nakshatraNameEn} hint={`pada ${result.janmaPada}`} tone="brand" />
      <DataTile label="Chandra Rasi" value={result.chandraRasiNameEn} tone="accent" />
      <DataTile label="Ascendant (Lagna)" value={result.lagnaRasiNameEn} tone="leaf" />
    </div>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {result.nakshatraLetters.padas.map((pada) => {
        const isBaby = pada.padaNumber === result.janmaPada;
        return (
          <div
            key={pada.padaNumber}
            className={`rounded-2xl border px-3.5 py-3 text-center ${
              isBaby ? 'border-brand/45 bg-brand-soft' : 'border-line bg-surface-2'
            }`}
          >
            <p className="text-[0.64rem] font-bold uppercase tracking-[0.14em] text-faint">Pada {pada.padaNumber}</p>
            <p className="c-display mt-1 text-[1.4rem] leading-none text-ink">{pada.letterEn}</p>
            <p className="mt-1 text-[0.78rem] text-brand-ink">{pada.letterTa}</p>
          </div>
        );
      })}
    </div>

    <ul className="grid gap-2 sm:grid-cols-2">
      {result.suggestedNames.slice(0, 6).map((name) => (
        <li key={name.nameEn} className="rounded-2xl border border-line bg-surface-2 px-3.5 py-3">
          <p className="text-[0.88rem] font-bold text-ink">{name.nameEn}</p>
          <p className="mt-0.5 text-[0.76rem] leading-5 text-muted">{name.meaningEn}</p>
        </li>
      ))}
    </ul>
  </div>
);

const MuhurthamPreview: React.FC = () => {
  const targetMonth = useMemo(() => monthKeyOf(new Date(new Date().getFullYear(), new Date().getMonth() + 2, 1)), []);
  const lookahead = useMemo(
    () => scanWithLookahead(targetMonth, SAMPLE_PLACE, SAMPLE_MUHURTHAM_EVENT_KEY as never),
    [targetMonth]
  );
  const { scan } = lookahead;
  const days = [...scan.days].filter((day) => day.grade !== 'AVOID').slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <DataTile label="Best" value={scan.bestCount} tone="leaf" />
        <DataTile label="Good" value={scan.goodCount} tone="accent" />
        <DataTile label="Fair" value={scan.fairCount} tone="brand" />
        <DataTile label="Avoid" value={scan.avoidCount} tone="rose" />
      </div>

      <p className="text-[0.8rem] text-muted">
        {scan.monthNameEn} · Wedding · {SAMPLE_PLACE.placeName}
        {lookahead.skippedMonths.length ? (
          <>
            {' '}
            · scanned past{' '}
            {lookahead.skippedMonths.map((month) => monthLabel(shiftMonthKey(month, 0))).join(', ')}
          </>
        ) : null}
      </p>

      <ul className="space-y-2">
        {days.map((day) => (
          <li
            key={day.date}
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-surface-2 px-4 py-3"
          >
            <div>
              <p className="text-[0.86rem] font-bold text-ink">
                {day.date} · {day.dayOfWeekNameEn}
              </p>
              <p className="mt-0.5 text-[0.78rem] text-muted">
                {day.tithiNameEn} · {day.nakshatraNameEn}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[0.76rem] text-ink-soft">
                {day.nallaNeram.length
                  ? day.nallaNeram.map((window) => `${window.start}–${window.end}`).join(', ')
                  : '—'}
              </span>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-[0.1em] ${
                  GRADE_STYLE[day.grade] ?? 'border-line bg-surface text-ink-soft'
                }`}
              >
                {day.grade}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

/**
 * "Live PDF Report Preview" — the label the live site uses when it renders a
 * report in the browser. Here it runs the SAME verified engine on the SAME fixed
 * sample details the sample PDFs use (01 Jan 2000, 2:00 AM, Chennai), so what a
 * visitor sees before ordering is the engine's own output, not a mock-up.
 */
export const ReportPreview: React.FC<{ service: ServiceType }> = ({ service }) => {
  const chart = useMemo(
    () =>
      chartFor({
        name: SAMPLE_DEVOTEE_NAME,
        dob: SAMPLE_BIRTH.dob,
        tob: SAMPLE_BIRTH.tob,
        place: SAMPLE_PLACE,
        gender: 'M'
      }),
    []
  );

  const porutham = useMemo(
    () =>
      poruthamFor(
        {
          name: SAMPLE_BRIDE_NAME,
          dob: SAMPLE_BRIDE.dob,
          tob: SAMPLE_BRIDE.tob,
          place: SAMPLE_PLACE,
          gender: 'F'
        },
        {
          name: SAMPLE_DEVOTEE_NAME,
          dob: SAMPLE_BIRTH.dob,
          tob: SAMPLE_BIRTH.tob,
          place: SAMPLE_PLACE,
          gender: 'M'
        }
      ),
    []
  );

  const naming = useMemo(
    () => namingFor({ name: SAMPLE_DEVOTEE_NAME, dob: SAMPLE_BIRTH.dob, tob: SAMPLE_BIRTH.tob, place: SAMPLE_PLACE, gender: 'M' }),
    []
  );

  return (
    <section className="c-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <h2 className="flex items-center gap-2 text-[0.72rem] font-bold uppercase tracking-[0.14em] text-ink">
          <Calculator className="h-4 w-4 text-brand" aria-hidden />
          <span>Live PDF Report Preview</span>
        </h2>
        <span className="rounded-full border border-brand/30 bg-brand-soft px-3 py-1 text-[0.68rem] font-bold text-brand-ink">
          {sampleDetailsLine(service)}
        </span>
      </div>

      <div className="pt-5">
        {service === 'BIRTH_JATHAGAM' ? <BirthPreview chart={chart} /> : null}
        {service === 'MARRIAGE_COMPATIBILITY' ? <PoruthamPreview result={porutham} /> : null}
        {service === 'BABY_NAMING' ? <NamingPreview result={naming} /> : null}
        {service === 'MUHURTHAM' ? <MuhurthamPreview /> : null}
      </div>

      <p className="mt-5 text-[0.74rem] leading-relaxed text-faint">
        This preview is calculated by the same Drik Panchanga and Chitra Paksha Lahiri engine that
        prepares the reports, using the fixed sample details above. Your own report is calculated from
        the birth details you submit.
      </p>
    </section>
  );
};

