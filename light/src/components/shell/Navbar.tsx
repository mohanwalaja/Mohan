import React, { useEffect, useState } from 'react';
import { Menu, X, ExternalLink } from 'lucide-react';
import { ACCOUNT_LINKS, BRAND, LIVE_SITE, MOBILE_EXTRA_LINK, NAV_LINKS, type PageKey } from '../../appConfig';
import { BrandWordmark } from './BrandMark';
import { useLightUi } from '../../lightContext';

interface NavbarProps {
  current: PageKey;
  onNavigate: (key: PageKey) => void;
}

/**
 * The live navbar, painted in the light palette: same brand lock-up, same link labels
 * and same order (Home, the four services, Astrology Team), same Log In /
 * Sign Up pair. The four service links keep the live site's hover menu.
 */
export const Navbar: React.FC<NavbarProps> = ({ current, onNavigate }) => {
  const [open, setOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { notify } = useLightUi();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const go = (key: PageKey) => {
    setOpen(false);
    setServicesOpen(false);
    onNavigate(key);
  };

  const linkClass = (key: PageKey) =>
    `rounded-full px-3 py-2 text-[0.82rem] font-semibold transition ${
      current === key ? 'bg-brand-soft text-brand-ink' : 'text-ink-soft hover:bg-page-soft hover:text-ink'
    }`;

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-colors ${
        scrolled ? 'border-line bg-page/95 backdrop-blur' : 'border-transparent bg-page'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:h-[4.5rem] sm:px-6">
        <button
          type="button"
          onClick={() => go('home')}
          className="flex min-w-0 items-center gap-2.5 rounded-2xl py-1 pr-2 text-left"
          aria-label={`${BRAND.name} home`}
        >
          <BrandWordmark emblemAlt="" />
        </button>

        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Primary">
          <button type="button" onClick={() => go('home')} className={linkClass('home')}>
            Home
          </button>

          <div
            className="relative"
            onMouseEnter={() => setServicesOpen(true)}
            onMouseLeave={() => setServicesOpen(false)}
          >
            <button
              type="button"
              onClick={() => go('services')}
              className={linkClass('services')}
              aria-expanded={servicesOpen}
            >
              Services
            </button>
            {servicesOpen && (
              <div className="c-rise absolute left-0 top-full w-72 pt-2">
                <div className="overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-[var(--shadow-pop)]">
                  <button
                    type="button"
                    onClick={() => go('services')}
                    className="block w-full rounded-xl px-3 py-2 text-left text-[0.82rem] font-bold text-brand-ink hover:bg-brand-soft"
                  >
                    All Services
                  </button>
                  {NAV_LINKS.filter((link) => link.key !== 'home' && link.key !== 'team').map((link) => (
                    <button
                      key={link.key}
                      type="button"
                      onClick={() => go(link.key)}
                      className="block w-full rounded-xl px-3 py-2 text-left text-[0.82rem] font-semibold text-ink-soft hover:bg-page-soft hover:text-ink"
                    >
                      {link.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {NAV_LINKS.filter((link) => link.key !== 'home').map((link) => (
            <button key={link.key} type="button" onClick={() => go(link.key)} className={linkClass(link.key)}>
              {link.label}
            </button>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <a
            href={ACCOUNT_LINKS.login.href}
            rel="noopener"
            onClick={() => notify('Log in opens the account area on the live site.')}
            className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-3.5 py-2 text-[0.82rem] font-bold text-ink-soft transition hover:border-brand/50 hover:text-ink"
          >
            {ACCOUNT_LINKS.login.label}
            <ExternalLink size={12} aria-hidden />
          </a>
          <a
            href={ACCOUNT_LINKS.register.href}
            rel="noopener"
            onClick={() => notify('Sign up opens the account area on the live site.')}
            className="rounded-full bg-brand px-4 py-2 text-[0.82rem] font-bold text-white shadow-[var(--shadow-card)] transition hover:bg-brand-deep"
          >
            {ACCOUNT_LINKS.register.label}
          </a>
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-ink lg:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {open && (
        <div className="c-rise border-t border-line bg-page px-4 pb-5 pt-3 lg:hidden">
          <div className="flex flex-col gap-1">
            <button type="button" onClick={() => go('home')} className={linkClass('home')}>
              Home
            </button>
            <button type="button" onClick={() => go('services')} className={linkClass('services')}>
              Services
            </button>
            {NAV_LINKS.filter((link) => link.key !== 'home').map((link) => (
              <button key={link.key} type="button" onClick={() => go(link.key)} className={linkClass(link.key)}>
                {link.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => go(MOBILE_EXTRA_LINK.key)}
              className={linkClass(MOBILE_EXTRA_LINK.key)}
            >
              {MOBILE_EXTRA_LINK.label}
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a
              href={ACCOUNT_LINKS.login.href}
              className="rounded-full border border-line-strong px-3 py-2 text-center text-[0.82rem] font-bold text-ink-soft"
            >
              {ACCOUNT_LINKS.login.label}
            </a>
            <a
              href={ACCOUNT_LINKS.register.href}
              className="rounded-full bg-brand px-3 py-2 text-center text-[0.82rem] font-bold text-white"
            >
              {ACCOUNT_LINKS.register.label}
            </a>
          </div>
          <p className="mt-3 text-[0.68rem] leading-relaxed text-muted">
            This is the layout preview of the light interface. Sign-in opens the secure account area at{' '}
            <span className="font-semibold text-ink-soft">{LIVE_SITE.replace('https://', '')}</span>.
          </p>
        </div>
      )}
    </header>
  );
};
