import React from 'react';
import {
  Sparkles,
  MapPin,
  Mail,
  ShieldCheck,
  ChevronRight,
  ArrowUp,
  Lock,
  Facebook
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { BrandWordmark } from '../common/BrandLockup';
import { RouteLink } from '../common/RouteLink';

interface FooterProps {
  onNavigate: (route: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  const { t } = useLanguage();

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="relative z-20 bg-[#080a18] text-slate-300 select-none border-t border-amber-500/20">
      {/* Top Gold Accent Bar */}
      <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-amber-500/70 to-transparent" />

      {/* Main Footer Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8 lg:gap-10">
          
          {/* Brand & Contact (Span 4) */}
          <div className="lg:col-span-4 space-y-3.5">
            <RouteLink
              route="home"
              onNavigate={onNavigate}
              className="inline-flex items-center gap-3 cursor-pointer group"
              aria-label="ASTRO SIVAM home"
            >
              {/* The reference lock-up — the navbar renders this same component.
                  emblemAlt is empty because the link carries the name. */}
              <BrandWordmark emblemAlt="" />
            </RouteLink>

            <p className="text-xs text-slate-400 leading-relaxed pr-2">
              Authentic Vedic horoscope calculations, 10-Poruthams marriage compatibility, auspicious baby naming ceremonies, and Subha Muhurtham dates computed with Lahiri sidereal ephemeris.
            </p>

            <div className="space-y-1.5 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Chennai, India • Serving Australia, NZ, USA, UK, Canada &amp; worldwide</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <a
                  href="mailto:admin@astrosivam.com"
                  className="hover:text-amber-300 transition-colors underline-offset-2 hover:underline"
                >
                  admin@astrosivam.com
                </a>
              </div>
            </div>

            <div className="pt-1 flex flex-wrap items-center gap-2">
              <a
                href="https://www.facebook.com/Astrosivamofficial"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#1877F2]/15 hover:bg-[#1877F2]/25 border border-[#1877F2]/40 text-[#4599FF] text-xs font-semibold transition-colors cursor-pointer"
                title="Follow ASTRO SIVAM on Facebook"
              >
                <Facebook className="w-3.5 h-3.5 text-[#1877F2]" />
                <span>Facebook</span>
              </a>
              <RouteLink
                route="contact"
                onNavigate={onNavigate}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                <span>Contact Us</span>
              </RouteLink>
            </div>
          </div>

          {/* Column 2: Vedic Services (Span 3) */}
          <div className="lg:col-span-3 space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('services')}</span>
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <RouteLink
                  route="birth-jathagam"
                  onNavigate={onNavigate}
                  className="group flex items-center gap-1.5 text-slate-400 hover:text-amber-300 transition-colors text-left"
                >
                  <ChevronRight className="w-3 h-3 text-slate-600 group-hover:text-amber-400 transition-transform group-hover:translate-x-0.5" />
                  <span>{t('birth_jathagam')} (Horoscope)</span>
                </RouteLink>
              </li>
              <li>
                <RouteLink
                  route="marriage-compatibility"
                  onNavigate={onNavigate}
                  className="group flex items-center gap-1.5 text-slate-400 hover:text-amber-300 transition-colors text-left"
                >
                  <ChevronRight className="w-3 h-3 text-slate-600 group-hover:text-amber-400 transition-transform group-hover:translate-x-0.5" />
                  <span>{t('marriage_compatibility')} (10 Poruthams)</span>
                </RouteLink>
              </li>
              <li>
                <RouteLink
                  route="baby-naming"
                  onNavigate={onNavigate}
                  className="group flex items-center gap-1.5 text-slate-400 hover:text-amber-300 transition-colors text-left"
                >
                  <ChevronRight className="w-3 h-3 text-slate-600 group-hover:text-amber-400 transition-transform group-hover:translate-x-0.5" />
                  <span>{t('baby_naming')} & Nakshatra Letters</span>
                </RouteLink>
              </li>
              <li>
                <RouteLink
                  route="muhurtham"
                  onNavigate={onNavigate}
                  className="group flex items-center gap-1.5 text-slate-400 hover:text-amber-300 transition-colors text-left"
                >
                  <ChevronRight className="w-3 h-3 text-slate-600 group-hover:text-amber-400 transition-transform group-hover:translate-x-0.5" />
                  <span>Subha Muhurtham Finder (Auspicious Dates)</span>
                </RouteLink>
              </li>
              <li>
                <RouteLink
                  route="services"
                  onNavigate={onNavigate}
                  className="group flex items-center gap-1.5 text-slate-400 hover:text-amber-300 transition-colors text-left"
                >
                  <ChevronRight className="w-3 h-3 text-slate-600 group-hover:text-amber-400 transition-transform group-hover:translate-x-0.5" />
                  <span>Full Service Catalogue & Plans</span>
                </RouteLink>
              </li>
            </ul>
          </div>

          {/* Column 3: Company & Information (Span 2) */}
          <div className="lg:col-span-2 space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              <span>Company & Support</span>
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <RouteLink
                  route="how-it-works"
                  onNavigate={onNavigate}
                  className="group flex items-center gap-1.5 text-slate-400 hover:text-amber-300 transition-colors text-left"
                >
                  <ChevronRight className="w-3 h-3 text-slate-600 group-hover:text-amber-400 transition-transform group-hover:translate-x-0.5" />
                  <span>{t('how_it_works')}</span>
                </RouteLink>
              </li>
              <li>
                <RouteLink
                  route="team"
                  onNavigate={onNavigate}
                  className="group flex items-center gap-1.5 text-amber-400 hover:text-amber-300 font-semibold transition-colors text-left"
                >
                  <ChevronRight className="w-3 h-3 text-amber-500 group-hover:translate-x-0.5 transition-transform" />
                  <span>Astrology Team</span>
                </RouteLink>
              </li>
              <li>
                <RouteLink
                  route="about"
                  onNavigate={onNavigate}
                  className="group flex items-center gap-1.5 text-slate-400 hover:text-amber-300 transition-colors text-left"
                >
                  <ChevronRight className="w-3 h-3 text-slate-600 group-hover:text-amber-400 transition-transform group-hover:translate-x-0.5" />
                  <span>{t('about')}</span>
                </RouteLink>
              </li>
              <li>
                <RouteLink
                  route="contact"
                  onNavigate={onNavigate}
                  className="group flex items-center gap-1.5 text-slate-400 hover:text-amber-300 transition-colors text-left"
                >
                  <ChevronRight className="w-3 h-3 text-slate-600 group-hover:text-amber-400 transition-transform group-hover:translate-x-0.5" />
                  <span>{t('contact')}</span>
                </RouteLink>
              </li>
              <li>
                <RouteLink
                  route="dashboard"
                  onNavigate={onNavigate}
                  className="group flex items-center gap-1.5 text-slate-400 hover:text-amber-300 transition-colors text-left"
                >
                  <ChevronRight className="w-3 h-3 text-slate-600 group-hover:text-amber-400 transition-transform group-hover:translate-x-0.5" />
                  <span>Customer Dashboard</span>
                </RouteLink>
              </li>
            </ul>
          </div>

          {/* Column 4: Payment Acceptance & Security (Span 3) */}
          <div className="lg:col-span-3 space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Payments & Security</span>
            </h4>
            
            <p className="text-[11px] text-slate-400">
              Secure & verified global payment channels:
            </p>

            <div className="payment-brand-logos" aria-label="Accepted payment methods">
              {[
                ['paypal', 'PayPal'], ['visa', 'Visa'], ['master', 'Mastercard'],
                ['american_express', 'American Express'], ['google_pay', 'Google Pay (UPI · India)'],
                ['discover', 'Discover'],
              ].map(([file, label]) => (
                <span className="payment-brand-logos__item" key={file} title={label}>
                  <img src={`/assets/payments/${file}.svg`} alt={label} width="64" height="40" loading="lazy" />
                  {file === 'google_pay' && <small>UPI · India</small>}
                </span>
              ))}
            </div>

            <div className="payment-text-badges flex flex-wrap gap-1.5">
              <span className="px-2.5 py-1 rounded-md bg-blue-950/40 border border-blue-800/60 text-blue-300 text-[10.5px] font-bold inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                PayPal
              </span>
              <span className="px-2.5 py-1 rounded-md bg-indigo-950/40 border border-indigo-800/60 text-indigo-300 text-[10.5px] font-bold inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                VISA
              </span>
              <span className="px-2.5 py-1 rounded-md bg-orange-950/40 border border-orange-800/60 text-orange-300 text-[10.5px] font-bold inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                Mastercard
              </span>
              <span className="px-2.5 py-1 rounded-md bg-sky-950/40 border border-sky-800/60 text-sky-300 text-[10.5px] font-bold inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                Amex
              </span>
              <span className="px-2.5 py-1 rounded-md bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-[10.5px] font-bold inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Google Pay (UPI · India)
              </span>
              <span className="px-2.5 py-1 rounded-md bg-purple-950/40 border border-purple-800/60 text-purple-300 text-[10.5px] font-bold inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                Discover
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-[10.5px] text-slate-400 pt-1">
              <Lock className="w-3 h-3 text-emerald-400 shrink-0" />
              <span>256-Bit SSL Encrypted & Confidential</span>
            </div>
          </div>

        </div>

        {/* Bottom Bar: Copyright, Legal Links, Scroll to Top */}
        <div className="mt-8 pt-5 border-t border-slate-800/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div>
            © {new Date().getFullYear()} <strong className="text-slate-200">ASTRO SIVAM</strong>. {t('all_rights_reserved')}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 text-[11px]">
            <RouteLink
              route="policy-privacy"
              onNavigate={onNavigate}
              className="hover:text-amber-300 transition-colors"
            >
              {t('privacy_policy')}
            </RouteLink>
            <span className="text-slate-600">•</span>
            <RouteLink
              route="policy-terms"
              onNavigate={onNavigate}
              className="hover:text-amber-300 transition-colors"
            >
              {t('terms_conditions')}
            </RouteLink>
            <span className="text-slate-600">•</span>
            <RouteLink
              route="policy-payment"
              onNavigate={onNavigate}
              className="hover:text-amber-300 transition-colors"
            >
              {t('payment_policy')}
            </RouteLink>
            <span className="text-slate-600">•</span>
            <RouteLink
              route="policy-refund"
              onNavigate={onNavigate}
              className="hover:text-amber-300 transition-colors"
            >
              {t('refund_policy')}
            </RouteLink>
          </div>

          <button
            type="button"
            onClick={scrollToTop}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
            title="Back to Top"
          >
            <span>Top</span>
            <ArrowUp className="w-3 h-3 text-amber-400" />
          </button>
        </div>
      </div>
    </footer>
  );
};
