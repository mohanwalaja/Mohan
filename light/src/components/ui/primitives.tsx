import React, { useId, useState } from 'react';
import { ChevronDown, Star } from 'lucide-react';

/** Section heading used by every page, so rhythm is identical everywhere. */
export const SectionHeading: React.FC<{
  eyebrow?: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  align?: 'left' | 'center';
  className?: string;
}> = ({ eyebrow, title, lead, align = 'left', className = '' }) => (
  <div
    className={`${align === 'center' ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'} ${className}`}
  >
    {eyebrow ? (
      <p className={`c-eyebrow ${align === 'center' ? 'justify-center' : ''}`}>
        <span className="h-px w-6 bg-brand/60" aria-hidden="true" />
        {eyebrow}
      </p>
    ) : null}
    <h2 className="c-display mt-3 text-[1.85rem] leading-[1.15] text-ink sm:text-[2.35rem]">{title}</h2>
    {lead ? (
      <p className="mt-3.5 text-[0.98rem] leading-7 text-muted sm:text-[1.05rem]">{lead}</p>
    ) : null}
  </div>
);

export const StarRow: React.FC<{ rating: number; size?: number }> = ({ rating, size = 16 }) => (
  <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
    {[1, 2, 3, 4, 5].map((index) => (
      <Star
        key={index}
        width={size}
        height={size}
        className={index <= Math.round(rating) ? 'fill-brand text-brand' : 'text-line-strong'}
      />
    ))}
  </span>
);

/** Small labelled data tile used across the chart, porutham and muhurtham views. */
export const DataTile: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'default' | 'brand' | 'accent' | 'leaf' | 'rose';
}> = ({ label, value, hint, tone = 'default' }) => {
  const valueTone =
    tone === 'brand'
      ? 'text-brand-ink'
      : tone === 'accent'
        ? 'text-accent'
        : tone === 'leaf'
          ? 'text-leaf'
          : tone === 'rose'
            ? 'text-rose'
            : 'text-ink';
  return (
    <div className="rounded-2xl border border-line bg-surface px-3.5 py-3">
      <p className="text-[0.66rem] font-bold uppercase tracking-[0.14em] text-faint">{label}</p>
      <p className={`c-display mt-1.5 text-[1.05rem] leading-tight ${valueTone}`}>{value}</p>
      {hint ? <p className="mt-1 text-[0.72rem] leading-5 text-muted">{hint}</p> : null}
    </div>
  );
};

export const Accordion: React.FC<{
  items: ReadonlyArray<{ question: string; answer: string }>;
  className?: string;
}> = ({ items, className = '' }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const baseId = useId();

  return (
    <div className={`space-y-3 ${className}`}>
      {items.map((item, index) => {
        const open = openIndex === index;
        return (
          <div
            key={item.question}
            className={`overflow-hidden rounded-3xl border bg-surface transition-colors ${
              open ? 'border-brand/45' : 'border-line'
            }`}
          >
            <button
              type="button"
              onClick={() => setOpenIndex(open ? null : index)}
              aria-expanded={open}
              aria-controls={`${baseId}-${index}`}
              className="flex w-full items-center gap-3 px-5 py-4 text-left"
            >
              <span className="flex-1 text-[0.95rem] font-bold leading-6 text-ink">{item.question}</span>
              <ChevronDown
                className={`h-5 w-5 shrink-0 text-brand transition-transform duration-300 ${
                  open ? 'rotate-180' : ''
                }`}
              />
            </button>
            <div
              id={`${baseId}-${index}`}
              hidden={!open}
              className="border-t border-line px-5 py-4 text-[0.9rem] leading-7 text-muted"
            >
              {item.answer}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** A single horizontal bar for a 0–max score, used in porutham tables. */
export const ScoreBar: React.FC<{ value: number; max: number; tone?: 'brand' | 'accent' | 'leaf' | 'rose' }> = ({
  value,
  max,
  tone = 'brand'
}) => {
  const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const fill =
    tone === 'accent'
      ? 'bg-accent'
      : tone === 'leaf'
        ? 'bg-leaf'
        : tone === 'rose'
          ? 'bg-rose'
          : 'bg-brand';
  return (
    <span className="block h-2 w-full overflow-hidden rounded-full bg-page-deep">
      <span className={`block h-full rounded-full ${fill}`} style={{ width: `${percent}%` }} />
    </span>
  );
};
