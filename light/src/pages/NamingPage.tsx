import React, { useMemo, useState } from 'react';
import { Baby, Loader2 } from 'lucide-react';
import { ServiceLayout } from '../components/light/ServiceLayout';
import { SectionHeading, DataTile } from '../components/ui/primitives';
import { CATALOG } from '../appConfig';
import { BABY_NAMING_FAQ_ITEMS } from '@shared/data/serviceFaqs';
import { PREVIEW_PLACES, clampIsoDate, namingFor, type BabyNamingResult } from '../lib/previewEngine';

interface PadaNames {
  padaNumber: number;
  soundEn: string;
  rasiEn: string;
  south: Array<{ name: string; meaningEn: string }>;
  north: Array<{ name: string; meaningEn: string }>;
}

const NAMING_STEPS = [
  {
    title: 'The Moon decides the syllable',
    body: 'The Moon’s exact longitude at birth places the baby in a nakshatra and one of its four padas. Each pada owns a syllable — the ezhuthu the name traditionally begins with.'
  },
  {
    title: 'The chart confirms the rest',
    body: 'Lagna, Moon sign and the birth nakshatra’s deity, gana, yoni and rajju are recorded, so the certificate carries the full traditional context, not just a letter.'
  },
  {
    title: 'Names from the curated bank',
    body: 'Both South Indian and North Indian naming conventions are offered for the baby’s gender, each name printed with its meaning so the choice is made with the meaning in view.'
  }
];

const QuickSyllables: React.FC = () => {
  const [dob, setDob] = useState('');
  const [tob, setTob] = useState('06:30');
  const [placeIndex, setPlaceIndex] = useState(0);
  const [gender, setGender] = useState<'F' | 'M'>('F');
  const [result, setResult] = useState<BabyNamingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    const today = new Date();
    setDob(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);
  }, []);

  const babyPada = useMemo(() => {
    const padas = (result as { nameSuggestions?: PadaNames[] } | null)?.nameSuggestions;
    if (!padas?.length || !result) return null;
    return padas.find((entry) => entry.padaNumber === result.janmaPada) ?? padas[0];
  }, [result]);

  const run = (event?: React.FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    try {
      setResult(
        namingFor({
          name: gender === 'F' ? 'Baby Girl' : 'Baby Boy',
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
    <form onSubmit={run} className="c-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="c-eyebrow">
            <Baby className="h-3.5 w-3.5" />
            Instant check
          </p>
          <p className="c-display mt-2 text-[1.35rem] text-ink">Which syllable does the star give?</p>
        </div>
        <span className="c-pill c-pill-accent">Uses the same Namakaranam rules</span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="c-label">Date of birth</span>
          <input
            type="date"
            className="c-input"
            value={dob}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(event) => setDob(clampIsoDate(event.target.value))}
          />
        </label>
        <label className="block">
          <span className="c-label">Time of birth</span>
          <input type="time" className="c-input" value={tob} onChange={(event) => setTob(event.target.value)} />
        </label>
        <label className="block">
          <span className="c-label">Birth place</span>
          <select
            className="c-input"
            value={placeIndex}
            onChange={(event) => setPlaceIndex(Number(event.target.value))}
          >
            {PREVIEW_PLACES.map((place, index) => (
              <option key={place.placeName} value={index}>
                {place.placeName}, {place.country}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="c-label">Baby</span>
          <select
            className="c-input"
            value={gender}
            onChange={(event) => setGender(event.target.value as 'F' | 'M')}
          >
            <option value="F">Girl</option>
            <option value="M">Boy</option>
          </select>
        </label>
      </div>

      <button type="submit" className="c-btn c-btn-primary mt-4" disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 c-spin" /> : <Baby className="h-4 w-4" />}
        Show the syllables
      </button>

      {error ? (
        <p className="mt-4 rounded-2xl border border-rose/25 bg-rose-soft px-4 py-3 text-[0.84rem] text-rose">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DataTile
              label="Nakshatra"
              value={result.nakshatraLetters?.nakshatraNameEn ?? '—'}
              tone="brand"
              hint={`pada ${result.janmaPada}`}
            />
            <DataTile label="Rasi" value={result.chandraRasiNameEn} tone="accent" />
            <DataTile label="Deity" value={result.nakshatraLetters?.deityEn ?? '—'} />
            <DataTile label="Gana / Yoni" value={`${result.nakshatraLetters?.ganaEn ?? '—'} · ${result.nakshatraLetters?.yoniEn ?? '—'}`} />
          </div>

          <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {(result.nakshatraLetters?.padas ?? []).map((pada) => {
              const isBaby = pada.padaNumber === result.janmaPada;
              return (
                <li
                  key={pada.padaNumber}
                  className={`rounded-2xl border px-4 py-3 text-center ${
                    isBaby ? 'border-brand bg-brand-soft' : 'border-line bg-surface-2'
                  }`}
                >
                  <p className="text-[0.64rem] font-bold uppercase tracking-[0.14em] text-faint">
                    Pada {pada.padaNumber}
                  </p>
                  <p className="c-display mt-1 text-[1.4rem] leading-none text-ink">{pada.letterEn}</p>
                  <p className="mt-1 text-[0.78rem] text-brand-ink">{pada.letterTa}</p>
                </li>
              );
            })}
          </ul>

          {babyPada ? (
            <div className="grid gap-5 rounded-2xl border border-line bg-surface p-4 lg:grid-cols-2">
              {([
                { title: 'South Indian names', list: babyPada.south },
                { title: 'North Indian names', list: babyPada.north }
              ] as const).map((column) => (
                <div key={column.title}>
                  <p className="text-[0.72rem] font-bold uppercase tracking-[0.12em] text-faint">
                    {column.title} · {babyPada.soundEn}
                  </p>
                  <ul className="mt-2.5 flex flex-wrap gap-2">
                    {column.list.slice(0, 8).map((name) => (
                      <li key={`${column.title}-${name.name}`} className="c-pill">
                        {name.name}
                        <span className="text-faint">· {name.meaningEn}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </form>
  );
};

export const NamingPage: React.FC<{ onNavigate: (route: string) => void }> = ({ onNavigate }) => {
  const entry = CATALOG.find((item) => item.route === 'naming')!;

  return (
    <ServiceLayout
      entry={entry}
      onNavigate={onNavigate}
      promise="The syllable tradition gives your child, the names that carry it, and the meanings spelled out — so the first name a family calls is also the one the chart agrees with."
      intro={NAMING_STEPS.map((step) => step.body)}
      facts={[
        { label: 'Starts with', value: 'Nakshatra pada', hint: 'the classical rule', tone: 'accent' },
        { label: 'Name bank', value: 'South + North Indian', hint: 'per pada, per gender' },
        { label: 'Meanings', value: 'Every name', hint: 'also in Tamil and Hindi' },
        { label: 'Certificate', value: 'Vedic naming', hint: 'printable keepsake', tone: 'brand' },
        { label: 'Languages', value: 'English · தமிழ் · हिन्दी' },
        { label: 'Delivery', value: 'Daily 9–11 AM IST' }
      ]}
      labTab={{
        label: 'Find the naming syllable for a newborn',
        blurb:
          'The lab’s naming tab takes the baby’s birth date, time and place and returns the nakshatra, pada, all four pada syllables and a first set of names with meanings.'
      }}
      faqItems={BABY_NAMING_FAQ_ITEMS}
    >
      <section className="c-shell mt-14">
        <QuickSyllables />
      </section>

      <section className="c-shell mt-14">
        <SectionHeading
          eyebrow="How the syllable is chosen"
          title="Three steps behind every name in the report"
        />
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {NAMING_STEPS.map((step, index) => (
            <li key={step.title} className="c-card p-5">
              <span className="c-display text-[1.5rem] font-semibold text-brand-tint">0{index + 1}</span>
              <h3 className="c-display mt-2 text-[1.08rem] leading-snug text-ink">{step.title}</h3>
              <p className="mt-2 text-[0.85rem] leading-6 text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </ServiceLayout>
  );
};
