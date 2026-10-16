import React, { useState } from 'react';
import { Compass, Loader2, Sparkles } from 'lucide-react';
import { ServiceLayout } from '../components/light/ServiceLayout';
import { SectionHeading, DataTile } from '../components/ui/primitives';
import { CATALOG } from '../appConfig';
import { BIRTH_JATHAGAM_FAQ_ITEMS } from '@shared/data/serviceFaqs';
import { PREVIEW_PLACES, chartFor, clampIsoDate, type HoroscopeResult } from '../lib/previewEngine';

const BHAVA_NAMES = [
  'Thanmaan (self, body, vitality)',
  'Dhanam (wealth, speech, family)',
  'Sahodharan (siblings, courage, effort)',
  'Matru (mother, home, comforts)',
  'Puthiran (children, intellect, creativity)',
  'Shatru (health, service, debts, enemies)',
  'Kalathiran (spouse, partnerships, travel)',
  'Ayul (longevity, transformation, inheritance)',
  'Bhagyam (fortune, dharma, father, pilgrimage)',
  'Karma (career, standing, authority)',
  'Laabham (gains, friends, aspirations)',
  'Vyayam (expenses, foreign lands, liberation)'
];

/**
 * Instant Lagna check — a three-field version of the lab, kept here so a
 * visitor reading about the Birth Jathagam can see their own Lagna (and that
 * the chart is real) without leaving the page.
 */
const InstantLagnaCheck: React.FC = () => {
  const [dob, setDob] = useState('1992-05-18');
  const [tob, setTob] = useState('07:20');
  const [placeIndex, setPlaceIndex] = useState(0);
  const [chart, setChart] = useState<HoroscopeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = (event?: React.FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    try {
      setChart(
        chartFor({
          name: 'Preview',
          dob,
          tob,
          place: PREVIEW_PLACES[placeIndex],
          gender: 'M'
        }),
      );
      setError(null);
    } catch (cause) {
      setChart(null);
      setError(cause instanceof Error ? cause.message : 'That birth time could not be resolved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={run} className="c-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="c-eyebrow">
            <Sparkles className="h-3.5 w-3.5" />
            Instant check
          </p>
          <p className="c-display mt-2 text-[1.35rem] text-ink">What is my Lagna?</p>
        </div>
        <span className="c-pill c-pill-accent">No name or email needed</span>
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
        <div className="flex items-end">
          <button type="submit" className="c-btn c-btn-primary w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 c-spin" /> : <Compass className="h-4 w-4" />}
            Find my Lagna
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-2xl border border-rose/25 bg-rose-soft px-4 py-3 text-[0.84rem] text-rose">
          {error}
        </p>
      ) : null}

      {chart ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DataTile label="Lagna" value={chart.lagnaRasiNameEn} tone="brand" hint={`${chart.lagnaDegrees.toFixed(2)}°`} />
          <DataTile label="Chandra rasi" value={chart.chandraRasiNameEn} tone="accent" />
          <DataTile label="Janma nakshatra" value={chart.janmaNakshatraEn} hint={`pada ${chart.janmaPada}`} />
          <DataTile
            label="Dasha lord now"
            value={chart.currentDasha?.mahadashaLordEn ?? '—'}
            hint={chart.currentDasha?.antardashaLordEn ? `${chart.currentDasha.antardashaLordEn} antardasha` : undefined}
          />
        </div>
      ) : null}
    </form>
  );
};

export const JathagamPage: React.FC<{ onNavigate: (route: string) => void }> = ({ onNavigate }) => {
  const entry = CATALOG.find((item) => item.route === 'jathagam')!;

  return (
    <ServiceLayout
      entry={entry}
      onNavigate={onNavigate}
      promise="One chart, read from every angle that matters — your nature, your work, your wealth, your relationships, your health and the seasons of your life as the dashas turn."
      intro={[
        'Your birth particulars are converted to the exact universal instant using the IANA time zone of your birth place, so historical offsets and daylight saving are handled the way a professional chart does it.',
        'The sidereal chart is then cast with the Chitra Paksha Lahiri ayanamsa: twelve bhavas, nine grahas with their degrees, nakshatras and padas, the Navamsa for inner strength, and the Vimshottari dasha timeline that places today inside your life’s sequence.',
        'Before the PDF is created, our priest team reads the chart and writes the interpretation — the eight life aspects, the dosha findings and the traditional remedies — in the language you chose.'
      ]}
      facts={[
        { label: 'Pages', value: '22+', hint: 'charts, tables and commentary', tone: 'brand' },
        { label: 'Charts included', value: 'Rasi · Navamsa', hint: 'D1 and D9, drawn to scale' },
        { label: 'Dasha depth', value: 'Maha · Antar · Pratyantar', hint: 'with balance at birth', tone: 'accent' },
        { label: 'Languages', value: 'English · தமிழ் · हिन्दी' },
        { label: 'Delivery', value: 'Daily 9–11 AM IST', hint: 'after admin review and approval' },
        { label: 'System', value: 'Chitra Paksha Lahiri', hint: 'sidereal, Drik panchangam', tone: 'leaf' }
      ]}
      labTab={{
        label: 'See your Lagna, nakshatra and dasha lord for free',
        blurb:
          'The lab lets you enter a birth date, exact time and place, then shows the same sidereal output the report is built from — including the drawn rasi chart and the dosha findings table.'
      }}
      faqItems={BIRTH_JATHAGAM_FAQ_ITEMS}
    >
      <section className="c-shell mt-14">
        <InstantLagnaCheck />
      </section>

      <section className="c-shell mt-14">
        <SectionHeading
          eyebrow="Inside the report"
          title="The twelve bhavas, each with a plain-language reading"
          lead="The house-by-house commentary is written so a reader with no Sanskrit background can follow it — and a reader who has one can check every claim against the tables above it."
        />
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BHAVA_NAMES.map((name, index) => (
            <li key={name} className="c-card-flat flex items-start gap-3 p-4">
              <span className="c-display grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-brand/30 bg-brand-soft text-[0.9rem] text-brand-ink">
                {index + 1}
              </span>
              <span className="text-[0.85rem] leading-6 text-ink-soft">{name}</span>
            </li>
          ))}
        </ul>
      </section>
    </ServiceLayout>
  );
};
