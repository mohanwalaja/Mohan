import React, { useEffect, useState } from 'react';
import { Palette, X } from 'lucide-react';
import { PALETTES, useLightUi } from '../../lightContext';

/**
 * Palette dock — the one control that is unique to this design.
 *
 * Three light palettes ship in the stylesheet; switching one repaints every
 * surface, border, shadow tint and glow through CSS custom properties. The dock
 * floats out of the way bottom-left and remembers the choice.
 */
export const PaletteDock: React.FC = () => {
  const { palette, setPalette } = useLightUi();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const active = PALETTES.find((entry) => entry.id === palette) ?? PALETTES[0];

  return (
    <div className="fixed bottom-4 left-4 z-[45] print:hidden">
      {open && (
        <div className="mb-3 w-[19rem] max-w-[calc(100vw-2rem)] rounded-3xl border border-line bg-surface p-3.5 shadow-[var(--shadow-pop)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[0.7rem] font-bold uppercase tracking-[0.18em] text-brand-ink">
                Daytime palettes
              </p>
              <p className="mt-1 text-[0.72rem] leading-5 text-muted">
                Same layout, three light moods. Pick the one that reads best for you.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line text-muted transition-colors hover:text-ink"
              aria-label="Close palette dock"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <ul className="mt-3 space-y-2">
            {PALETTES.map((entry) => {
              const selected = entry.id === palette;
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => setPalette(entry.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-all ${
                      selected
                        ? 'border-brand bg-brand-soft'
                        : 'border-line bg-surface-2 hover:border-line-strong'
                    }`}
                  >
                    <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
                      {entry.swatch.map((color) => (
                        <span
                          key={color}
                          className="h-5 w-5 rounded-full border border-black/10"
                          style={{ background: color }}
                        />
                      ))}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.82rem] font-bold text-ink">
                        {entry.name}
                      </span>
                      <span className="block truncate text-[0.7rem] text-muted">{entry.tagline}</span>
                    </span>
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        selected ? 'bg-brand' : 'bg-line-strong'
                      }`}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-full border border-line bg-surface/95 px-3.5 py-2.5 text-[0.78rem] font-bold text-ink shadow-[var(--shadow-pop)] backdrop-blur transition-all hover:border-brand"
        aria-expanded={open}
      >
        <Palette className="h-4 w-4 text-brand" />
        <span className="hidden sm:inline">{active.name}</span>
        <span className="flex items-center gap-1" aria-hidden="true">
          {active.swatch.slice(1).map((color) => (
            <span
              key={color}
              className="h-3.5 w-3.5 rounded-full border border-black/10"
              style={{ background: color }}
            />
          ))}
        </span>
      </button>
    </div>
  );
};

/** Lightweight, self-dismissing notices (used for form and lab feedback). */
export const Toasts: React.FC = () => {
  const { toasts } = useLightUi();
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[70] flex flex-col items-center gap-2 px-4">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`c-rise max-w-md rounded-2xl border px-4 py-2.5 text-[0.82rem] font-semibold shadow-[var(--shadow-pop)] ${
            toast.tone === 'good'
              ? 'border-leaf/30 bg-leaf-soft text-leaf'
              : 'border-line bg-surface text-ink'
          }`}
        >
          {toast.text}
        </div>
      ))}
    </div>
  );
};
