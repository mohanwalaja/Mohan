import React from 'react';
import { Sparkles, MapPin, Mail, ShieldCheck, ChevronRight, ArrowUp, Lock, Facebook } from 'lucide-react';
import { BrandWordmark } from './BrandMark';
import { BUSINESS, BRAND, LIVE_SITE, type PageKey } from '../../appConfig';

interface FooterProps {
  onNavigate: (key: PageKey) => void;
}

/**
 * The live footer, painted in the light palette — the same four columns in the same
 * order with the same wording: brand paragraph + Chennai office line + support
 * email + Facebook, "Services", "Company & Support", "Payments & Security"
 * with the identical badge list, then the legal bar with the four policy links
 * and the back-to-top control.
 *
 * The postal address and the Udyam registration number are deliberately NOT
 * here: on this site they belong to the Contact page (and the invoice) only, so
 * the footer reads them from nowhere else.
 */
export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  const year = new Date().getFullYear();

  const ServiceLink: React.FC<{ target: PageKey; label: string; emphasis?: boolean }> = ({
    target,
    label,
    emphasis = false
  }) => (
    <button
      type="button"
      onClick={() => onNavigate(target)}
      className={`group flex items-center gap-1.5 text-left text-[0.78rem] transition ${
        emphasis ? 'font-semibold text-brand-ink hover:text-brand-deep' : 'text-ink-soft hover:text-brand-ink'
      }`}
    >
      <ChevronRight
        size={12}
        className="shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-brand"
        aria-hidden
      />
      <span>{label}</span>
    </button>
  );

  return (
    <footer className="relative z-20 mt-20 select-none border-t border-line bg-page-soft">
      <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-brand/60 to-transparent" />

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-12 lg:gap-10">
          <div className="space-y-3.5 lg:col-span-4">
            <button
              type="button"
              onClick={() => onNavigate('home')}
              className="inline-flex items-center gap-3"
              aria-label={`${BRAND.name} home`}
            >
              <BrandWordmark emblemAlt="" />
            </button>

            <p className="pr-2 text-[0.78rem] leading-relaxed text-ink-soft">
              Authentic Vedic horoscope calculations, 10-Poruthams marriage compatibility, auspicious
              baby naming ceremonies, and Subha Muhurtham dates computed with Lahiri sidereal
              ephemeris.
            </p>

            <div className="space-y-1.5 text-[0.78rem] text-ink-soft">
              <div className="flex items-center gap-2">
                <MapPin size={14} className="shrink-0 text-brand" aria-hidden />
                <span>Chennai, India • Serving Australia, NZ, USA, UK, Canada &amp; worldwide</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail size={14} className="shrink-0 text-brand" aria-hidden />
                <a
                  href={`mailto:${BUSINESS.supportEmail}`}
                  className="underline-offset-2 transition hover:text-brand-ink hover:underline"
                >
                  {BUSINESS.supportEmail}
                </a>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <a
                href={BRAND.facebook}
                target="_blank"
                rel="noopener noreferrer"
                title={`Follow ${BRAND.name} on Facebook`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent-soft px-3 py-1 text-[0.75rem] font-semibold text-accent transition hover:bg-accent/15"
              >
                <Facebook size={13} aria-hidden />
                <span>Facebook</span>
              </a>
              <button
                type="button"
                onClick={() => onNavigate('contact')}
                className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-3 py-1 text-[0.75rem] font-semibold text-ink-soft transition hover:border-brand/40 hover:text-brand-ink"
              >
                <span>Contact Us</span>
              </button>
            </div>
          </div>

          <div className="space-y-3 lg:col-span-3">
            <h4 className="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-[0.14em] text-brand-ink">
              <Sparkles size={13} className="text-brand" aria-hidden />
              <span>Services</span>
            </h4>
            <ul className="space-y-2">
              <li>
                <ServiceLink target="birth-jathagam" label="Birth Jathagam (Horoscope)" />
              </li>
              <li>
                <ServiceLink target="marriage-compatibility" label="Marriage Compatibility (10 Poruthams)" />
              </li>
              <li>
                <ServiceLink target="baby-naming" label="Baby Naming & Nakshatra Letters" />
              </li>
              <li>
                <ServiceLink target="muhurtham" label="Subha Muhurtham Finder (Auspicious Dates)" />
              </li>
              <li>
                <ServiceLink target="services" label="Full Service Catalogue & Plans" />
              </li>
            </ul>
          </div>

          <div className="space-y-3 lg:col-span-2">
            <h4 className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-brand-ink">
              <span>Company &amp; Support</span>
            </h4>
            <ul className="space-y-2">
              <li>
                <ServiceLink target="how-it-works" label="How It Works" />
              </li>
              <li>
                <ServiceLink target="team" label="Astrology Team" emphasis />
              </li>
              <li>
                <ServiceLink target="about" label="About Us" />
              </li>
              <li>
                <ServiceLink target="contact" label="Contact" />
              </li>
              <li>
                <a
                  href={`${LIVE_SITE}/dashboard`}
                  className="group flex items-center gap-1.5 text-[0.78rem] text-ink-soft transition hover:text-brand-ink"
                >
                  <ChevronRight
                    size={12}
                    className="shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-brand"
                    aria-hidden
                  />
                  <span>Customer Dashboard</span>
                </a>
              </li>
            </ul>
          </div>

          <div className="space-y-3 lg:col-span-3">
            <h4 className="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-[0.14em] text-brand-ink">
              <ShieldCheck size={13} className="text-leaf" aria-hidden />
              <span>Payments &amp; Security</span>
            </h4>

            <p className="text-[0.72rem] text-ink-soft">Secure &amp; verified global payment channels:</p>

            <div className="flex flex-wrap gap-1.5">
              {[
                { label: 'PayPal', tone: 'bg-accent-soft text-accent border-accent/30', dot: 'bg-accent' },
                { label: 'VISA', tone: 'bg-brand-soft text-brand-ink border-brand/30', dot: 'bg-brand' },
                { label: 'Mastercard', tone: 'bg-rose-soft text-rose border-rose/30', dot: 'bg-rose' },
                { label: 'Amex', tone: 'bg-page-deep text-brand-ink border-line-strong', dot: 'bg-brand-deep' },
                { label: 'Google Pay (UPI · India)', tone: 'bg-leaf-soft text-leaf border-leaf/30', dot: 'bg-leaf' },
                { label: 'Discover', tone: 'bg-surface-2 text-ink-soft border-line-strong', dot: 'bg-faint' }
              ].map((badge) => (
                <span
                  key={badge.label}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[0.66rem] font-bold ${badge.tone}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                  {badge.label}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-1.5 pt-1 text-[0.7rem] text-ink-soft">
              <Lock size={12} className="shrink-0 text-leaf" aria-hidden />
              <span>256-Bit SSL Encrypted &amp; Confidential</span>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-line pt-5 text-[0.75rem] text-muted sm:flex-row">
          <div>
            © {year} <strong className="text-ink">{BRAND.name}</strong>. All rights reserved.
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 text-[0.7rem]">
            {(
              [
                ['policy-privacy', 'Privacy Policy'],
                ['policy-terms', 'Terms & Conditions'],
                ['policy-payment', 'Payment Policy'],
                ['policy-refund', 'Refund & Cancellation Policy']
              ] as Array<[PageKey, string]>
            ).map(([key, label], index) => (
              <React.Fragment key={key}>
                {index > 0 && <span className="text-line-strong">•</span>}
                <button type="button" onClick={() => onNavigate(key)} className="transition hover:text-brand-ink">
                  {label}
                </button>
              </React.Fragment>
            ))}
          </div>

          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            title="Back to Top"
            className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 text-[0.75rem] font-semibold text-ink-soft transition hover:border-brand/40 hover:text-brand-ink"
          >
            <span>Top</span>
            <ArrowUp size={12} className="text-brand" aria-hidden />
          </button>
        </div>
      </div>
    </footer>
  );
};
