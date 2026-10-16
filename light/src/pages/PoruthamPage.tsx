import React, { useState } from 'react';
import { Heart, Loader2 } from 'lucide-react';
import { ServiceLayout } from '../components/light/ServiceLayout';
import { SectionHeading, DataTile, ScoreBar } from '../components/ui/primitives';
import { CATALOG } from '../appConfig';
import { MARRIAGE_COMPATIBILITY_FAQ_ITEMS } from '@shared/data/serviceFaqs';
import { PREVIEW_PLACES, clampIsoDate, poruthamFor, type WeddingMatchResult } from '../lib/previewEngine';

const PORUTHAM_REFERENCE = [
  { name: 'Dina Porutham', asks: 'Do the birth stars give each other long life and health?' },
  { name: 'Gana Porutham', asks: 'Do the temperaments (deva, manushya, rakshasa) sit together?' },
  { name: 'Mahendra Porutham', asks: 'Is there protection for the family line and progeny?' },
  { name: 'Sthree Deerga', asks: 'Does the matching favour the bride’s wellbeing and longevity?' },
  { name: 'Yoni Porutham', asks: 'Are the physical and instinctive natures compatible?' },
  { name: 'Rasi Porutham', asks: 'Do the Moon signs support each other’s emotional life?' },
  { name: 'Rajju Porutham', asks: 'Is the “rope” of the nakshatra free of a harmful bind?' },
  { name: 'Vedha Porutham', asks: 'Is there a Vedha obstruction between the two stars?' },
  { name: 'Nadi Porutham', asks: 'Are the nadi constitutions different, as tradition requires?' },
  { name: 'Rasyadhipathi', asks: 'Are the sign lords friendly towards each other?' }
];

/** Two-chart, three-field version of the lab’s porutham tab. */
const QuickPorutham: React.FC = () => {
  const [bride, setBride] = useState({ dob: '1996-04-21', tob: '11:40', place: 0 });
  const [groom, setGroom] = useState({ dob: '1993-09-09', tob: '18:15', place: 0 });
  const [result, setResult] = useState<WeddingMatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = (event?: React.FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    try {
      setResult(
        poruthamFor(
          { name: 'Bride', dob: bride.dob, tob: bride.tob, place: PREVIEW_PLACES[bride.place], gender: 'F' },
          { name: 'Groom', dob: groom.dob, tob: groom.tob, place: PREVIEW_PLACES[groom.place], gender: 'M' },
        ),
      );
      setError(null);
    } catch (cause) {
      setResult(null);
      setError(cause instanceof Error ? cause.message : 'That pair could not be matched.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={run} className="c-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="c-eyebrow">
            <Heart className="h-3.5 w-3.5" />
            Instant match
          </p>
          <p className="c-display mt-2 text-[1.35rem] text-ink">Try a pair of charts right here</p>
        </div>
        <span className="c-pill c-pill-rose">No names stored</span>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {[
          { title: 'Bride', state: bride, setState: setBride },
          { title: 'Groom', state: groom, setState: setGroom }
        ].map((person) => (
          <div key={person.title} className="rounded-2xl border border-line bg-surface-2 p-4">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-brand-ink">
              {person.title}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="c-label">Date</span>
                <input
                  type="date"
                  className="c-input"
                  value={person.state.dob}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(event) =>
                    person.setState({ ...person.state, dob: clampIsoDate(event.target.value) })
                  }
                />
              </label>
              <label className="block">
                <span className="c-label">Time</span>
                <input
                  type="time"
                  className="c-input"
                  value={person.state.tob}
                  onChange={(event) => person.setState({ ...person.state, tob: event.target.value })}
                />
              </label>
              <label className="block">
                <span className="c-label">Place</span>
                <select
                  className="c-input"
                  value={person.state.place}
                  onChange={(event) => person.setState({ ...person.state, place: Number(event.target.value) })}
                >
                  {PREVIEW_PLACES.map((place, index) => (
                    <option key={place.placeName} value={index}>
                      {place.placeName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ))}
      </div>

      <button type="submit" className="c-btn c-btn-primary mt-5" disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 c-spin" /> : <Heart className="h-4 w-4" />}
        Show the ten poruthams
      </button>

      {error ? (
        <p className="mt-4 rounded-2xl border border-rose/25 bg-rose-soft px-4 py-3 text-[0.84rem] text-rose">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-6 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DataTile
              label="Total score"
              value={`${result.totalScore} / ${result.maxScore}`}
              tone="brand"
              hint={`${result.totalPoruthamsMatched} poruthams matched`}
            />
            <DataTile label="Bride star" value={result.brideNakshatraNameEn} hint={result.brideRasiNameEn} />
            <DataTile label="Groom star" value={result.groomNakshatraNameEn} hint={result.groomRasiNameEn} />
            <DataTile
              label="Rajju / Vedha"
              value={`${result.rajjuMatch ? 'Clear' : 'Conflict'} / ${result.vedhaMatch ? 'Present' : 'Clear'}`}
              tone={result.rajjuMatch ? 'leaf' : 'rose'}
            />
          </div>

          <ul className="grid gap-2.5 sm:grid-cols-2">
            {result.poruthams.map((porutham) => (
              <li key={porutham.id} className="rounded-2xl border border-line bg-surface px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[0.85rem] font-bold text-ink">{porutham.nameEn}</span>
                  <span className="text-[0.75rem] font-bold tabular-nums text-muted">
                    {porutham.pointsEarned}/{porutham.maxPoints}
                  </span>
                </div>
                <span className="mt-2 block">
                  <ScoreBar
                    value={porutham.pointsEarned}
                    max={porutham.maxPoints}
                    tone={porutham.status === 'UTTHAMAM' ? 'leaf' : porutham.status === 'MADHYAMAM' ? 'brand' : 'rose'}
                  />
                </span>
                <p className="mt-2 text-[0.76rem] leading-6 text-muted">{porutham.explanationEn}</p>
              </li>
            ))}
          </ul>

          <p className="rounded-2xl border border-line bg-surface-2 px-4 py-3 text-[0.85rem] leading-6 text-ink-soft">
            <strong className="text-ink">Verdict:</strong> {result.overallVerdictEn}{' '}
            <span className="text-muted">{result.sevvayDosham.doshaSamyamStatusEn}</span>
          </p>
        </div>
      ) : null}
    </form>
  );
};

export const PoruthamPage: React.FC<{ onNavigate: (route: string) => void }> = ({ onNavigate }) => {
  const entry = CATALOG.find((item) => item.route === 'porutham')!;

  return (
    <ServiceLayout
      entry={entry}
      onNavigate={onNavigate}
      promise="Ten classical checks, two complete charts, and one page both families can read together — with the reasoning printed beside every score instead of a bare yes or no."
      intro={[
        'Both charts are cast independently first — Lagna, Moon sign, nakshatra and pada, Mars position — because every porutham check depends on those being right.',
        'The ten poruthams are then scored: some are pass-or-fail in tradition, others are graded. The report always shows the points earned beside the points available, so you can see how the verdict was reached.',
        'The dasa-sandhi comparison, Rajju and Vedha findings, Kuja Dosha reading for both charts and the traditional remedies complete the report, along with a summary page written for sharing.'
      ]}
      facts={[
        { label: 'Poruthams', value: '10 checks', hint: 'scored, with reasoning', tone: 'brand' },
        { label: 'Charts compared', value: 'Bride + Groom', hint: 'Lagna, rasi, nakshatra, pada' },
        { label: 'Dosha checks', value: 'Kuja · Rajju · Vedha · Nadi', tone: 'rose' },
        { label: 'Timing', value: 'Dasa Sandhi', hint: 'period compatibility' },
        { label: 'Languages', value: 'English · தமிழ் · हिन्दी' },
        { label: 'Delivery', value: 'Daily 9–11 AM IST' }
      ]}
      labTab={{
        label: 'Score a pair of charts before you order',
        blurb:
          'The lab’s porutham tab asks for both people’s birth date, time and place, then scores all ten poruthams with the same engine and shows the Rajju, Vedha and Kuja findings.'
      }}
      faqItems={MARRIAGE_COMPATIBILITY_FAQ_ITEMS}
    >
      <section className="c-shell mt-14">
        <QuickPorutham />
      </section>

      <section className="c-shell mt-14">
        <SectionHeading
          eyebrow="The ten checks"
          title="What each porutham actually asks"
          lead="Tradition names them; the report explains them. These are the questions behind the ten rows you will read in the PDF."
        />
        <ol className="mt-8 grid gap-3 sm:grid-cols-2">
          {PORUTHAM_REFERENCE.map((row, index) => (
            <li key={row.name} className="c-card-flat flex items-start gap-3 p-4">
              <span className="c-display grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-rose/25 bg-rose-soft text-[0.85rem] text-rose">
                {index + 1}
              </span>
              <span>
                <span className="block text-[0.88rem] font-bold text-ink">{row.name}</span>
                <span className="mt-0.5 block text-[0.8rem] leading-6 text-muted">{row.asks}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </ServiceLayout>
  );
};
