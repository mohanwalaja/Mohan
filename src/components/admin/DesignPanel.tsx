import React, { useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, Moon, Palette, RefreshCw, Sun, TriangleAlert } from 'lucide-react';
import { api } from '../../services/api';
import { AppSettings, DesignSwitchState, ThemeTemplateId } from '../../types';
import {
  DEFAULT_THEME_TEMPLATE,
  LIGHT_THEME_TEMPLATE,
  normalizeThemeTemplate,
} from '../../services/designSwitch';

interface DesignPanelProps {
  settings: AppSettings | null;
  onUpdateSettings: (updates: Partial<AppSettings>) => Promise<void>;
  /** Called after a save so the portal re-reads the stored settings. */
  onSaved?: () => void | Promise<void>;
}

/**
 * Admin → Site Design: the operator's control for the TWO shipped designs.
 *
 * ASTRO SIVAM serves one design at a time, chosen here:
 *
 *   Classic (dark)     the original dark/indigo site — the default, and the
 *                      only design that has ever been live
 *   Sunrise Ivory      the light design (its own bundle + prerendered
 *                      documents), served at the SAME URLs
 *
 * HOW A CLICK REACHES VISITORS: the id is stored as `activeThemeTemplate` in
 * system_settings.general_settings, and the API writes or deletes the
 * api/.design-light activation marker in the same request. public/.htaccess
 * serves pages/<route>-light.html while that marker exists, so the switch is a
 * static rewrite — no deploy, no client-side redirect, no PHP in a page view.
 * If the host refuses the marker write, this panel says so instead of leaving
 * the operator believing the design changed.
 *
 * WHAT THE LIGHT DESIGN COVERS: every public page (home, the four services,
 * how-it-works, about, team, contact and the four policy pages). The signed-in
 * and operator surfaces (Log In, Sign Up, Customer Dashboard, Admin) always
 * keep the classic interface under both designs, and the ordering/checkout
 * flow stays on the classic design for now. Both designs are the same site:
 * same logo, same brand name and slogan, same wording, same routes.
 */
export const DesignPanel: React.FC<DesignPanelProps> = ({ settings, onUpdateSettings, onSaved }) => {
  const [saving, setSaving] = useState<ThemeTemplateId | null>(null);
  const [status, setStatus] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  const activeDesign = useMemo<ThemeTemplateId>(
    () => normalizeThemeTemplate(settings?.activeThemeTemplate),
    [settings?.activeThemeTemplate],
  );

  const choose = async (design: ThemeTemplateId) => {
    if (design === activeDesign) {
      setStatus({ tone: 'ok', text: 'This design is already the active one for visitors.' });
      return;
    }
    setSaving(design);
    setStatus(null);
    try {
      const res = await api.updateAdminSettings({ activeThemeTemplate: design });
      const switchState: DesignSwitchState | undefined = res.designSwitch;
      if (res.success) {
        setStatus({
          tone: switchState && switchState.markerWritten === false ? 'warn' : 'ok',
          text: switchState?.message || res.message || 'Design saved.',
        });
        await onUpdateSettings({ activeThemeTemplate: design });
        await onSaved?.();
      } else {
        setStatus({ tone: 'warn', text: res.message || 'The design could not be saved.' });
      }
    } catch (err: any) {
      setStatus({ tone: 'warn', text: err?.message || 'The design could not be saved.' });
    } finally {
      setSaving(null);
    }
  };

  const cards: Array<{
    id: ThemeTemplateId;
    title: string;
    badge: string;
    icon: React.ReactNode;
    description: string;
    palette: string[];
    covers: string;
    previewHref: string;
    previewLabel: string;
  }> = [
    {
      id: DEFAULT_THEME_TEMPLATE,
      title: 'Classic (dark)',
      badge: 'Default',
      icon: <Moon className="w-4 h-4 text-amber-400" aria-hidden />,
      description:
        'The original ASTRO SIVAM design: cosmic indigo surfaces with temple gold and crimson, and the full ordering, payment, account and report flow.',
      palette: ['#0b0718', '#120e24', '#d97706', '#7a1f1f'],
      covers: 'Every page, including ordering, checkout, accounts and the admin portal.',
      previewHref: '/',
      previewLabel: 'Open the live site',
    },
    {
      id: LIGHT_THEME_TEMPLATE,
      title: 'Sunrise Ivory (light)',
      badge: 'Light',
      icon: <Sun className="w-4 h-4 text-amber-500" aria-hidden />,
      description:
        'The light design: warm paper surfaces, hairline gold rules and Playfair Display headings, with the same logo, wording and routes as the classic design.',
      palette: ['#fffbf3', '#ffffff', '#c98f1e', '#0e7c7b'],
      covers:
        'Home, the four service pages, How It Works, About, Astrology Team, Contact and the four policy pages — at the same URLs.',
      // In development the light UI has its own dev server (npm run dev:light,
      // port 5200). In production the deployed light documents are readable
      // directly; visitors get them through the rewrite, at the clean URLs.
      previewHref: import.meta.env.DEV ? 'http://localhost:5200/' : '/pages/index-light.html',
      previewLabel: import.meta.env.DEV ? 'Open the light preview (dev server :5200)' : 'Open the light document',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-purple-600/10 text-purple-500 dark:text-purple-300">
            <Palette className="w-5 h-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Site Design</h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              ASTRO SIVAM ships two designs. Pick the one visitors see; the other stays installed and can be
              restored from here at any time. Both serve the same pages, at the same URLs, with the same logo,
              brand name, wording and route structure — only the surface changes.
            </p>
          </div>
        </div>
      </div>

      {status && (
        <div
          className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm font-semibold ${
            status.tone === 'ok'
              ? 'border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
              : 'border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
          }`}
          role="status"
        >
          {status.tone === 'ok' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          )}
          <span>{status.text}</span>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {cards.map((card) => {
          const isActive = card.id === activeDesign;
          return (
            <div
              key={card.id}
              className={`flex flex-col rounded-2xl border p-5 transition ${
                isActive
                  ? 'border-purple-500 bg-purple-50/60 dark:border-purple-500 dark:bg-purple-500/10'
                  : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
                  {card.icon}
                  {card.title}
                </h3>
                <span
                  className={`rounded-full px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-wide ${
                    isActive
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {isActive ? 'Active for visitors' : card.badge}
                </span>
              </div>

              <div className="mt-3 flex items-center gap-1.5">
                {card.palette.map((colour) => (
                  <span
                    key={colour}
                    className="h-5 w-9 rounded-md border border-slate-300/70 dark:border-slate-700"
                    style={{ backgroundColor: colour }}
                    title={colour}
                  />
                ))}
              </div>

              <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{card.description}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-500">
                <span className="font-semibold text-slate-600 dark:text-slate-400">Serves: </span>
                {card.covers}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={saving !== null || isActive}
                  onClick={() => choose(card.id)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                    isActive
                      ? 'cursor-default bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-500'
                      : 'bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60'
                  }`}
                >
                  {saving === card.id ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  )}
                  <span>{isActive ? 'In use' : saving === card.id ? 'Saving…' : 'Use this design'}</span>
                </button>

                <a
                  href={card.previewHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:border-purple-400 hover:text-purple-600 dark:border-slate-700 dark:text-slate-300"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  <span>{card.previewLabel}</span>
                </a>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
        <p className="font-bold text-slate-700 dark:text-slate-300">How the switch works (no deploy needed)</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            The choice is stored as <code className="font-mono">activeThemeTemplate</code> and applied by the server
            on the next page view — visitors never see a redirect, and the URLs stay exactly the same.
          </li>
          <li>
            The light design ships its own prerendered documents (<code className="font-mono">pages/&lt;route&gt;-light.html</code>),
            served only while <code className="font-mono">api/.design-light</code> exists.
          </li>
          <li>
            Log In, Sign Up, the Customer Dashboard and this admin portal always keep the classic interface, and the
            ordering/checkout flow stays on the classic design under both options.
          </li>
        </ul>
      </div>
    </div>
  );
};
