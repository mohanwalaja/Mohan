import React, { useEffect, useState } from 'react';
import { Menu, X, ExternalLink } from 'lucide-react';
import { accountHref, ACCOUNT_LINKS, BRAND, LIVE_SITE, MOBILE_EXTRA_LINK, NAV_LINKS, isPreviewBuild, type PageKey } from '../../appConfig';
import { BrandWordmark } from './BrandMark';
import { RouteLink } from '../ui/RouteLink';
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

  // Every internal link is a real <a href> (see RouteLink); this only closes
  // the menus the click came out of, so the page below is visible immediately.
  const closeMenus = () => {
    setOpen(false);
    setServicesOpen(false);
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
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:h-20 sm:px-6 md:h-22">
        {/* Same lock-up, same spacing and the same title the live navbar sets on
            the brand link: "ASTRO SIVAM - Indian Vedic Astrology". */}
        <RouteLink
          route="home"
          onNavigate={onNavigate}
          onBeforeNavigate={closeMenus}
          className="group flex min-w-0 shrink-0 items-center gap-2 py-1 text-left sm:gap-3.5"
          title={`${BRAND.name} - Indian Vedic Astrology`}
          ariaLabel={`${BRAND.name} home`}
        >
          <BrandWordmark emblemAlt="" />
        </RouteLink>

        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Primary">
          <RouteLink route="home" onNavigate={onNavigate} onBeforeNavigate={closeMenus} className={linkClass('home')}>
            Home
          </RouteLink>

          <div
            className="relative"
            onMouseEnter={() => setServicesOpen(true)}
            onMouseLeave={() => setServicesOpen(false)}
          >
            <RouteLink
              route="services"
              onNavigate={onNavigate}
              onBeforeNavigate={closeMenus}
              className={linkClass('services')}
              ariaExpanded={servicesOpen}
            >
              Services
            </RouteLink>
            {servicesOpen && (
              <div className="c-rise absolute left-0 top-full w-72 pt-2">
                <div className="overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-[var(--shadow-pop)]">
                  <RouteLink
                    route="services"
                    onNavigate={onNavigate}
                    onBeforeNavigate={closeMenus}
                    className="block w-full rounded-xl px-3 py-2 text-left text-[0.82rem] font-bold text-brand-ink hover:bg-brand-soft"
                  >
                    All Services
                  </RouteLink>
                  {NAV_LINKS.filter((link) => link.key !== 'home' && link.key !== 'team').map((link) => (
                    <RouteLink
                      key={link.key}
                      route={link.key}
                      onNavigate={onNavigate}
                      onBeforeNavigate={closeMenus}
                      className="block w-full rounded-xl px-3 py-2 text-left text-[0.82rem] font-semibold text-ink-soft hover:bg-page-soft hover:text-ink"
                    >
                      {link.label}
                    </RouteLink>
                  ))}
                </div>
              </div>
            )}
          </div>

          {NAV_LINKS.filter((link) => link.key !== 'home').map((link) => (
            <RouteLink
              key={link.key}
              route={link.key}
              onNavigate={onNavigate}
              onBeforeNavigate={closeMenus}
              className={linkClass(link.key)}
            >
              {link.label}
            </RouteLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <a
            href={accountHref('login')}
            rel={isPreviewBuild() ? 'noopener' : undefined}
            onClick={() =>
              isPreviewBuild() && notify('Log in opens the account area on the live site.')
            }
            className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-3.5 py-2 text-[0.82rem] font-bold text-ink-soft transition hover:border-brand/50 hover:text-ink"
          >
            {ACCOUNT_LINKS.login.label}
            <ExternalLink size={12} aria-hidden />
          </a>
          <a
            href={accountHref('register')}
            rel={isPreviewBuild() ? 'noopener' : undefined}
            onClick={() =>
              isPreviewBuild() && notify('Sign up opens the account area on the live site.')
            }
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
            <RouteLink route="home" onNavigate={onNavigate} onBeforeNavigate={closeMenus} className={linkClass('home')}>
              Home
            </RouteLink>
            <RouteLink
              route="services"
              onNavigate={onNavigate}
              onBeforeNavigate={closeMenus}
              className={linkClass('services')}
            >
              Services
            </RouteLink>
            {NAV_LINKS.filter((link) => link.key !== 'home').map((link) => (
              <RouteLink
                key={link.key}
                route={link.key}
                onNavigate={onNavigate}
                onBeforeNavigate={closeMenus}
                className={linkClass(link.key)}
              >
                {link.label}
              </RouteLink>
            ))}
            <RouteLink
              route={MOBILE_EXTRA_LINK.key}
              onNavigate={onNavigate}
              onBeforeNavigate={closeMenus}
              className={linkClass(MOBILE_EXTRA_LINK.key)}
            >
              {MOBILE_EXTRA_LINK.label}
            </RouteLink>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a
              href={accountHref('login')}
              className="rounded-full border border-line-strong px-3 py-2 text-center text-[0.82rem] font-bold text-ink-soft"
            >
              {ACCOUNT_LINKS.login.label}
            </a>
            <a
              href={accountHref('register')}
              className="rounded-full bg-brand px-3 py-2 text-center text-[0.82rem] font-bold text-white"
            >
              {ACCOUNT_LINKS.register.label}
            </a>
          </div>
          {isPreviewBuild() && (
            <p className="mt-3 text-[0.68rem] leading-relaxed text-muted">
              This is the layout preview of the light interface. Sign-in opens the secure account area at{' '}
              <span className="font-semibold text-ink-soft">{LIVE_SITE.replace('https://', '')}</span>.
            </p>
          )}
        </div>
      )}
    </header>
  );
};
