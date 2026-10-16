import React from 'react';
import { LightUiProvider, Notices } from './lightContext';
import { useLightRoute } from './router';
import { Navbar } from './components/shell/Navbar';
import { Footer } from './components/shell/Footer';
import { PAGE_TITLES, type PageKey } from './appConfig';

import { HomePage } from './pages/HomePage';
import { ServicesPage } from './pages/ServicesPage';
import { BirthJathagamPage } from './pages/BirthJathagamPage';
import { MarriageCompatibilityPage } from './pages/MarriageCompatibilityPage';
import { BabyNamingPage } from './pages/BabyNamingPage';
import { MuhurthamPage } from './pages/MuhurthamPage';
import { HowItWorksPage } from './pages/HowItWorksPage';
import { TeamPage } from './pages/TeamPage';
import { AboutPage } from './pages/AboutPage';
import { ContactPage } from './pages/ContactPage';
import { PoliciesPage } from './pages/PoliciesPage';
import { NotFoundPage } from './pages/NotFoundPage';

const KNOWN_ROUTES = Object.keys(PAGE_TITLES) as PageKey[];

function isPageKey(route: string): route is PageKey {
  return (KNOWN_ROUTES as string[]).includes(route);
}

function RouteView({ route, onNavigate }: { route: string; onNavigate: (key: PageKey) => void }) {
  if (!isPageKey(route)) return <NotFoundPage route={route} onNavigate={onNavigate} />;

  switch (route) {
    case 'home':
      return <HomePage onNavigate={onNavigate} />;
    case 'services':
      return <ServicesPage onNavigate={onNavigate} />;
    case 'birth-jathagam':
      return <BirthJathagamPage onNavigate={onNavigate} />;
    case 'marriage-compatibility':
      return <MarriageCompatibilityPage onNavigate={onNavigate} />;
    case 'baby-naming':
      return <BabyNamingPage onNavigate={onNavigate} />;
    case 'muhurtham':
      return <MuhurthamPage onNavigate={onNavigate} />;
    case 'how-it-works':
      return <HowItWorksPage onNavigate={onNavigate} />;
    case 'team':
      return <TeamPage onNavigate={onNavigate} />;
    case 'about':
      return <AboutPage onNavigate={onNavigate} />;
    case 'contact':
      return <ContactPage onNavigate={onNavigate} />;
    case 'policy-privacy':
      return <PoliciesPage type="privacy" onNavigate={onNavigate} />;
    case 'policy-terms':
      return <PoliciesPage type="terms" onNavigate={onNavigate} />;
    case 'policy-payment':
      return <PoliciesPage type="payment" onNavigate={onNavigate} />;
    case 'policy-refund':
      return <PoliciesPage type="refund" onNavigate={onNavigate} />;
    default:
      return <NotFoundPage route={route} onNavigate={onNavigate} />;
  }
}

/**
 * ASTRO SIVAM — light interface.
 *
 * The same site: same brand lock-up, same navigation, same fourteen pages under
 * the same names, same wording, same engine. Only the surface is new — warm
 * paper and temple gold instead of the dark theme the main application keeps.
 */
export default function App() {
  const [route, navigate] = useLightRoute();

  // The live pages set their own <SEO> title; the light pages carry the same
  // strings, so the document title is applied here from the shared table (the
  // prerendered light documents ship a real <title> too — see
  // scripts/prerender-light.mjs).
  React.useEffect(() => {
    document.title = isPageKey(route) ? PAGE_TITLES[route] : 'Page not found | ASTRO SIVAM';
  }, [route]);

  const activeKey: PageKey = isPageKey(route) ? route : 'home';

  return (
    <LightUiProvider>
      <div className="flex min-h-screen flex-col bg-page">
        <Navbar current={activeKey} onNavigate={navigate} />
        <main id="main" className="flex-1">
          <RouteView route={route} onNavigate={navigate} />
        </main>
        <Footer onNavigate={navigate} />
        <Notices />
      </div>
    </LightUiProvider>
  );
}
