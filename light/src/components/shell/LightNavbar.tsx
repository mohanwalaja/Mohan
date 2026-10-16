import React, { useEffect, useState } from 'react';
import { Menu, X, Sparkles, ChevronRight, PhoneCall } from 'lucide-react';
import { ALL_ROUTES, PRIMARY_NAV, SECONDARY_NAV } from '../../appConfig';

/**
 * Daylight navigation.
 *
 * A paper bar that turns translucent over the page as you scroll, a segmented
 * service dock on desktop, and a full-height drawer on phones. Route keys map
 * straight to the hash router, so every link is a real, shareable URL.
 */
interface NavbarProps {
  route: string;
  onNavigate: (route: string) => void;
}

export const LightNavbar: React.FC<NavbarProps> = ({ route, onNavigate }) => {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const go = (next: string) => {
    onNavigate(next);
    setOpen(false);
  };

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:shadow-lg"
      >
        Skip to content
      </a>

      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'border-b border-line bg-surface/85 backdrop-blur-xl supports-[backdrop-filter]:bg-surface/70'
            : 'border-b border-transparent bg-page/60 backdrop-blur-sm'
        }`}
      >
        <div className="c-shell">
          <div className="flex h-[4.25rem] items-center justify-between gap-3 lg:h-[4.75rem]">
            <button
              type="button"
              onClick={() => go('home')}
              className="group flex shrink-0 items-center gap-2.5 text-left"
              aria-label="ASTRO SIVAM — Daylight preview home"
            >
              <span className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-2xl border border-line bg-white shadow-[0_6px_18px_-12px_rgba(30,36,56,0.5)]">
                <img
                  src="/assets/images/astrosivam_logo.png"
                  alt=""
                  className="h-7 w-7 object-contain"
                />
              </span>
              <span className="leading-none">
                <span className="c-display block text-[1.08rem] font-semibold tracking-tight text-ink">
                  Astro Sivam
                </span>
                <span className="mt-0.5 block text-[0.6rem] font-bold uppercase tracking-[0.24em] text-brand-ink">
                  Vedic Jyotish
                </span>
              </span>
            </button>

            <nav aria-label="Service reports" className="hidden xl:block">
              <ul className="flex items-center gap-0.5 rounded-full border border-line bg-surface/80 p-1 shadow-[0_8px_24px_-20px_rgba(30,36,56,0.6)]">
                {PRIMARY_NAV.map((item) => {
                  const active = route === item.key;
                  return (
                    <li key={item.key}>
                      <button
                        type="button"
                        onClick={() => go(item.key)}
                        aria-current={active ? 'page' : undefined}
                        className={`rounded-full px-3.5 py-2 text-[0.82rem] font-semibold transition-all ${
                          active
                            ? 'bg-brand text-white shadow-[0_8px_20px_-10px_rgba(217,154,43,0.9)]'
                            : 'text-ink-soft hover:bg-page-soft hover:text-ink'
                        }`}
                      >
                        {item.short ?? item.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => go('how-it-works')}
                className="hidden items-center gap-1.5 text-[0.82rem] font-semibold text-ink-soft transition-colors hover:text-brand-ink 2xl:inline-flex"
              >
                How it works
              </button>
              <button
                type="button"
                onClick={() => go('studio')}
                className="c-btn c-btn-primary hidden sm:inline-flex"
              >
                <Sparkles className="h-4 w-4" />
                Free preview
              </button>
              <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="grid h-11 w-11 place-items-center rounded-2xl border border-line bg-surface text-ink transition-colors hover:border-brand hover:text-brand-ink xl:hidden"
                aria-expanded={open}
                aria-label={open ? 'Close menu' : 'Open menu'}
              >
                {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {open && (
          <div className="border-t border-line bg-surface xl:hidden">
            <div className="c-shell max-h-[calc(100vh-4.5rem)] overflow-y-auto py-4 c-scroll">
              <p className="c-eyebrow mb-3">Reports</p>
              <ul className="space-y-1.5">
                {PRIMARY_NAV.map((item) => {
                  const active = route === item.key;
                  return (
                    <li key={item.key}>
                      <button
                        type="button"
                        onClick={() => go(item.key)}
                        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-[0.95rem] font-semibold transition-all ${
                          active
                            ? 'border-brand/40 bg-brand-soft text-brand-ink'
                            : 'border-line bg-surface-2 text-ink-soft hover:border-line-strong'
                        }`}
                      >
                        <span>{item.label}</span>
                        <ChevronRight className="h-4 w-4 opacity-60" />
                      </button>
                    </li>
                  );
                })}
              </ul>

              <p className="c-eyebrow mb-3 mt-6">Company</p>
              <ul className="grid grid-cols-2 gap-1.5">
                {SECONDARY_NAV.map((item) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => go(item.key)}
                      className="w-full rounded-2xl border border-line bg-surface-2 px-3.5 py-3 text-left text-[0.85rem] font-semibold text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => go('contact')}
                className="c-btn c-btn-outline mt-5 w-full"
              >
                <PhoneCall className="h-4 w-4" />
                Talk to the priest team
              </button>
              <p className="mt-4 text-center text-[0.7rem] text-faint">
                {ALL_ROUTES.length} pages · Daylight UI preview
              </p>
            </div>
          </div>
        )}
      </header>
    </>
  );
};
