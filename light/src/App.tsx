import React, { useMemo } from 'react';
import { LightNavbar } from './components/shell/LightNavbar';
import { LightFooter } from './components/shell/LightFooter';
import { PaletteDock, Toasts } from './components/shell/PaletteDock';
import { LightUiProvider } from './lightContext';
import { useHashRoute } from './router';
import { ALL_ROUTES } from './appConfig';

import { HomePage } from './pages/HomePage';
import { ServicesPage } from './pages/ServicesPage';
import { JathagamPage } from './pages/JathagamPage';
import { PoruthamPage } from './pages/PoruthamPage';
import { NamingPage } from './pages/NamingPage';
import { MuhurthamPage } from './pages/MuhurthamPage';
import { PreviewLabPage } from './pages/PreviewLabPage';
import { HowItWorksPage } from './pages/HowItWorksPage';
import { TeamPage } from './pages/TeamPage';
import { AboutPage } from './pages/AboutPage';
import { ContactPage } from './pages/ContactPage';
import { NotFoundPage } from './pages/NotFoundPage';

function RouteView({ route, onNavigate }: { route: string; onNavigate: (next: string) => void }) {
  switch (route) {
    case 'home':
      return <HomePage onNavigate={onNavigate} />;
    case 'services':
      return <ServicesPage onNavigate={onNavigate} />;
    case 'jathagam':
      return <JathagamPage onNavigate={onNavigate} />;
    case 'porutham':
      return <PoruthamPage onNavigate={onNavigate} />;
    case 'naming':
      return <NamingPage onNavigate={onNavigate} />;
    case 'muhurtham':
      return <MuhurthamPage onNavigate={onNavigate} />;
    case 'studio':
      return <PreviewLabPage onNavigate={onNavigate} />;
    case 'how-it-works':
      return <HowItWorksPage onNavigate={onNavigate} />;
    case 'team':
      return <TeamPage onNavigate={onNavigate} />;
    case 'about':
      return <AboutPage onNavigate={onNavigate} />;
    case 'contact':
      return <ContactPage onNavigate={onNavigate} />;
    default:
      return <NotFoundPage route={route} onNavigate={onNavigate} />;
  }
}

function DaylightApp() {
  const [route, navigate] = useHashRoute();

  // Keep the document title in step with the previewed page — the preview is
  // hash-routed, so this is the only place a title can be set.
  React.useEffect(() => {
    const match = ALL_ROUTES.find((entry) => entry.key === route);
    const label = route === 'studio' ? 'Free Preview Lab' : match?.label ?? 'Page not found';
    document.title = `${label} · ASTRO SIVAM — Daylight preview`;
  }, [route]);

  const known = useMemo(() => ALL_ROUTES.some((entry) => entry.key === route), [route]);

  return (
    <LightUiProvider>
      <div className="flex min-h-screen flex-col bg-page">
        <LightNavbar route={route} onNavigate={navigate} />
        <main id="main" className="flex-1">
          <RouteView route={known ? route : 'not-found'} onNavigate={navigate} />
        </main>
        <LightFooter onNavigate={navigate} />
        <PaletteDock />
        <Toasts />
      </div>
    </LightUiProvider>
  );
}

export default function App() {
  return <DaylightApp />;
}
