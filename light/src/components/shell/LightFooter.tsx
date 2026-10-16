import React from 'react';
import { Mail, Globe2, ShieldCheck, MapPin } from 'lucide-react';
import { CATALOG, BUSINESS, SECONDARY_NAV, PRIMARY_NAV } from '../../appConfig';

interface FooterProps {
  onNavigate: (route: string) => void;
}

export const LightFooter: React.FC<FooterProps> = ({ onNavigate }) => (
  <footer className="relative mt-24 overflow-hidden border-t border-line bg-page-soft">
    <div className="c-hairline-grid pointer-events-none absolute inset-0 opacity-[0.35]" aria-hidden="true" />
    <div className="c-shell relative py-14">
      <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1.1fr]">
        <div>
          <p className="c-display text-2xl font-semibold text-ink">Astro Sivam</p>
          <p className="mt-1 text-[0.68rem] font-bold uppercase tracking-[0.24em] text-brand-ink">
            Vedic Jyotish
          </p>
          <p className="mt-4 max-w-xs text-sm leading-6 text-muted">
            Personalised Vedic astrology reports prepared by our India-based priest team, delivered as a
            PDF in English, Tamil or Hindi.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="c-pill c-pill-brand">
              <ShieldCheck className="h-3.5 w-3.5" />
              Details kept private
            </span>
            <span className="c-pill">
              <Globe2 className="h-3.5 w-3.5" />
              {BUSINESS.registrationStatus}
            </span>
          </div>
        </div>

        <div>
          <p className="c-eyebrow mb-4">Reports</p>
          <ul className="space-y-2.5">
            {CATALOG.map((entry) => (
              <li key={entry.route}>
                <button
                  type="button"
                  onClick={() => onNavigate(entry.route)}
                  className="text-left text-sm font-medium text-ink-soft transition-colors hover:text-brand-ink"
                >
                  {entry.title}
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={() => onNavigate('studio')}
                className="text-left text-sm font-medium text-accent transition-colors hover:opacity-80"
              >
                Free Preview Lab
              </button>
            </li>
          </ul>
        </div>

        <div>
          <p className="c-eyebrow mb-4">Company</p>
          <ul className="space-y-2.5">
            {[...PRIMARY_NAV.slice(0, 1), ...SECONDARY_NAV].map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => onNavigate(item.key)}
                  className="text-left text-sm font-medium text-ink-soft transition-colors hover:text-brand-ink"
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="c-eyebrow mb-4">Reach us</p>
          <a
            href={`mailto:${BUSINESS.supportEmail}`}
            className="flex items-center gap-2 text-sm font-semibold text-ink transition-colors hover:text-brand-ink"
          >
            <Mail className="h-4 w-4 text-brand" />
            {BUSINESS.supportEmail}
          </a>
          <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-muted">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <span>
              {BUSINESS.state}, {BUSINESS.country}
            </span>
          </p>
          <p className="mt-4 rounded-2xl border border-line bg-surface px-3.5 py-3 text-[0.72rem] leading-5 text-muted">
            Reports are prepared daily between 9:00 AM and 11:00 AM IST. This daylight design is a
            preview — the live site at{' '}
            <a className="font-semibold text-brand-ink underline" href="https://astrosivam.com">
              {BUSINESS.website}
            </a>{' '}
            is untouched.
          </p>
        </div>
      </div>

      <hr className="c-rule my-10" />

      <div className="flex flex-col gap-3 text-[0.75rem] text-faint sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getFullYear()} {BUSINESS.legalName}. All rights reserved.
        </p>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>{BUSINESS.website}</span>
          <span className="hidden sm:inline">·</span>
          <span>Chitra Paksha Lahiri ayanamsa</span>
          <span className="hidden sm:inline">·</span>
          <span>English · தமிழ் · हिन्दी</span>
        </p>
      </div>
    </div>
  </footer>
);
