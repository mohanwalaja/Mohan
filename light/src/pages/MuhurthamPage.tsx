import React, { useEffect, useState } from 'react';
import { CalendarDays, Loader2 } from 'lucide-react';
import { ServiceLayout } from '../components/light/ServiceLayout';
import { SectionHeading } from '../components/ui/primitives';
import { CATALOG } from '../appConfig';
import { MUHURTHAM_FAQ_ITEMS } from '@shared/data/serviceFaqs';
import {
  MUHURTHAM_EVENTS,
  PREVIEW_PLACES,
  monthKeyOf,
  monthLabel,
  scanWithLookahead,
  shiftMonthKey,
  type MuhurthamEventKey,
  type MuhurthamLookahead
} from '../lib/previewEngine';

const GRADE_STYLE: Record<string, string> = {
  BEST: 'c-pill c-pill-leaf',
  GOOD: 'c-pill c-pill-accent',
  FAIR: 'c-pill c-pill-brand',
  AVOID: 'c-pill c-pill-rose'
};

/**
 * A compact month preview: the current month, Chennai, wedding. It runs
 * `scanMonthMuhurtham()` on mount, so the page opens with real grades for real
 * dates instead of a marketing tile.
 */
const ThisMonthPreview: React.FC<{ onNavigate: (route: string) => void }> = ({ onNavigate }) => {
  const [monthKey, setMonthKey] = useState(() => monthKeyOf(new Date()));
  const [eventKey, setEventKey] = useState<MuhurthamEventKey>('wedding');
  const [lookahead, setLookahead] = useState<MuhurthamLookahead | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setLookahead(scanWithLookahead(monthKey, PREVIEW_PLACES[0], eventKey));
      setError(null);
    } catch (cause) {
      setLookahead(null);
      setError(cause instanceof Error ? cause.message : 'The preview scan failed.');
    }
  }, [monthKey, eventKey]);

  const scan = lookahead?.scan ?? null;
  const highlights = scan
    ? [...scan.days]
        .filter((day) => day.grade === 'BEST' || day.grade === 'GOOD')
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
    : [];

  return (
    <div className="c-card p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="c-eyebrow">
            <CalendarDays className="h-3.5 w-3.5" />
            Live month preview
          </p>
          <p className="c-display mt-2 text-[1.35rem] text-ink">
            {scan ? scan.monthNameEn : monthLabel(monthKey)} in Chennai
          </p>
          <p className="mt-1 text-[0.82rem] text-muted">
            Scanned with the site’s own rules — no account needed.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="c-input !min-h-10 !w-auto !rounded-full !py-1.5 text-[0.8rem] font-semibold"
            value={eventKey}
            onChange={(event) => setEventKey(event.target.value as MuhurthamEventKey)}
            aria-label="Ceremony type"
          >
            {MUHURTHAM_EVENTS.map((event) => (
              <option key={event.key} value={event.key}>
                {event.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1 rounded-full border border-line bg-surface p-1">
            <button
              type="button"
              onClick={() => setMonthKey((value) => shiftMonthKey(value, -1))}
              className="grid h-8 w-8 place-items-center rounded-full text-muted transition-colors hover:bg-page-soft hover:text-ink"
              aria-label="Previous month"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setMonthKey((value) => shiftMonthKey(value, 1))}
              className="grid h-8 w-8 place-items-center rounded-full text-muted transition-colors hover:bg-page-soft hover:text-ink"
              aria-label="Next month"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-2xl border border-rose/25 bg-rose-soft px-4 py-3 text-[0.84rem] text-rose">
          {error}
        </p>
      ) : null}

      {lookahead && lookahead.skippedMonths.length > 0 ? (
        <p className="mt-4 rounded-2xl border border-brand/30 bg-brand-soft px-4 py-3 text-[0.82rem] leading-6 text-brand-ink">
          {lookahead.skippedMonths.map(monthLabel).join(', ')} {lookahead.skippedMonths.length === 1 ? 'is' : 'are'}{' '}
          traditionally avoided for this ceremony (Sukra asta, Adhika Masa or a Pitru period). Showing{' '}
          <strong>{monthLabel(lookahead.monthKey)}</strong> instead.
        </p>
      ) : null}

      {scan ? (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Best', value: scan.bestCount, tone: 'text-leaf' },
              { label: 'Good', value: scan.goodCount, tone: 'text-accent' },
              { label: 'Fair', value: scan.fairCount, tone: 'text-brand-ink' },
              { label: 'Avoid', value: scan.avoidCount, tone: 'text-rose' }
            ].map((tile) => (
              <div key={tile.label} className="rounded-2xl border border-line bg-surface-2 px-3.5 py-3 text-center">
                <p className="text-[0.64rem] font-bold uppercase tracking-[0.14em] text-faint">{tile.label}</p>
                <p className={`c-display mt-1 text-[1.4rem] leading-none ${tile.tone}`}>{tile.value}</p>
              </div>
            ))}
          </div>

          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {highlights.map((day) => (
              <li key={day.date} className="rounded-2xl border border-line bg-surface-2 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="c-display text-[1rem] text-ink">
                    {day.date} · {day.dayOfWeekNameEn}
                  </span>
                  <span className={GRADE_STYLE[day.grade] ?? 'c-pill'}>{day.grade}</span>
                </div>
                <p className="mt-1.5 text-[0.76rem] text-muted">
                  {day.tithiNameEn} · {day.nakshatraNameEn}
                </p>
                <p className="mt-1.5 text-[0.74rem] font-semibold text-leaf">
                  Nalla neram{' '}
                  {day.nallaNeram.length
                    ? day.nallaNeram.map((window) => `${window.start}–${window.end}`).join(', ')
                    : '—'}
                </p>
              </li>
            ))}
            {!highlights.length ? (
              <li className="rounded-2xl border border-dashed border-line-strong px-4 py-4 text-[0.82rem] text-muted">
                No best or good days remain in this month for the selected ceremony — try the next month.
              </li>
            ) : null}
          </ul>

          <button type="button" onClick={() => onNavigate('studio')} className="c-btn c-btn-soft mt-5">
            Open the full month scan in the Preview Lab
          </button>
        </>
      ) : (
        <p className="mt-6 flex items-center gap-2 text-[0.85rem] text-muted">
          <Loader2 className="h-4 w-4 c-spin" /> Scanning the month…
        </p>
      )}
    </div>
  );
};

export const MuhurthamPage: React.FC<{ onNavigate: (route: string) => void }> = ({ onNavigate }) => {
  const entry = CATALOG.find((item) => item.route === 'muhurtham')!;

  return (
    <ServiceLayout
      entry={entry}
      onNavigate={onNavigate}
      promise="Six months of candidate dates, every one checked against the panchangam and against the personal stars of the people involved — so the date you pick already agrees with the people it is for."
      intro={[
        'The scan starts with the classical panchangam filters: tithi suitability for the ceremony, nakshatra quality, yoga and karana, Panchaka avoidance, and the Guru and Sukra asta windows.',
        'Each surviving day is then scored — best, good, fair or avoid — and the usable time windows are printed: Nalla Neram, Abhijit muhurtham, and the Rahu Kalam, Yamagandam and Gulikai stretches to avoid.',
        'When you supply the bride, groom or child details, every day is additionally checked for Tara Balam, Chandrashtama and the Janma Nakshatra. A day that falls on someone’s Janma star is never recommended, however good it looks on paper.'
      ]}
      facts={[
        { label: 'Window', value: '6 months', hint: 'three-month scan around your month', tone: 'brand' },
        { label: 'Ceremonies', value: '18 event types', hint: 'wedding to vehicle purchase' },
        { label: 'Personal checks', value: 'Tara Balam', hint: 'Chandrashtama and Janma star' },
        { label: 'Panchangam', value: 'Drik', hint: 'tithi, nakshatra, yoga, karana' },
        { label: 'Languages', value: 'English · தமிழ் · हिन्दी' },
        { label: 'Delivery', value: 'Daily 9–11 AM IST' }
      ]}
      labTab={{
        label: 'Scan a month for your ceremony, free',
        blurb:
          'The lab’s muhurtham tab scans any month for any of the eighteen ceremonies in any of the ten cities, showing every graded day with its windows and reasons.'
      }}
      faqItems={MUHURTHAM_FAQ_ITEMS}
    >
      <section className="c-shell mt-14">
        <ThisMonthPreview onNavigate={onNavigate} />
      </section>

      <section className="c-shell mt-14">
        <SectionHeading
          eyebrow="Ceremonies covered"
          title="Eighteen ceremonies, each with its own rule set"
          lead="Wedding rules are not house-warming rules. The scanner applies the ceremony’s own tithi and nakshatra preferences, then the shared personal checks."
        />
        <ul className="mt-8 flex flex-wrap gap-2.5">
          {MUHURTHAM_EVENTS.map((event) => (
            <li key={event.key} className="c-pill !px-3.5 !py-2 !text-[0.78rem]">
              {event.label}
            </li>
          ))}
        </ul>
      </section>
    </ServiceLayout>
  );
};
