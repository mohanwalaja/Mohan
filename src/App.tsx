import React, { useState, useEffect, Suspense, lazy } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { HomePage } from './pages/HomePage';
import {
  recoverFromChunkError,
  clearChunkRecoveryFlag,
  installChunkErrorRecovery,
  installRouteIntentPrefetch,
  safeImport,
} from './services/routeChunks';

// Routes are code-split (audit S1, widened by audit PERF-1): the admin portal,
// the customer dashboard and the four report pages pull in the PDF/HTML report
// builders; every other page is a chunk of its own too, because the homepage
// only needs the shell and itself. Each becomes its own chunk in the existing
// dist/assets/ folder — no new top-level folders
// (tests/dist-shape.test.ts enforces this).
//
// WHITE-SCREEN SAFETY (a previous split attempt broke production):
//   - home + the app shell stay eager, so the site always renders;
//   - every lazy route sits behind <Suspense> with a themed fallback;
//   - a failed chunk fetch reloads ONCE instead of dying blank
//     (see src/services/routeChunks.ts);
//   - a route's chunk is fetched when the visitor hovers/focuses its link
//     (intent prefetch — see routeChunks.ts), never all of them on idle;
//   - every loader goes through safeImport(): a SYNCHRONOUS throw while
//     evaluating the import() wrapper (how the __VITE_PRELOAD__ incident
//     escaped `.catch()` and landed in the ErrorBoundary) becomes a
//     rejection that recoverFromChunkError handles instead.
// The non-home page chunks: services, the static information pages, auth and
// not-found. They are small, and a visitor reading the homepage has no use for
// any of them — the first page they open is fetched then (and is prefetched on
// link hover).
const ServicesPage = lazy(() =>
  safeImport(() => import('./pages/ServicesPage'))
    .then((m) => ({ default: m.ServicesPage }))
    .catch((error) => recoverFromChunkError(error)),
);
const HowItWorksPage = lazy(() =>
  safeImport(() => import('./pages/HowItWorksPage'))
    .then((m) => ({ default: m.HowItWorksPage }))
    .catch((error) => recoverFromChunkError(error)),
);
const AboutPage = lazy(() =>
  safeImport(() => import('./pages/AboutPage'))
    .then((m) => ({ default: m.AboutPage }))
    .catch((error) => recoverFromChunkError(error)),
);
const AstrologyTeamPage = lazy(() =>
  safeImport(() => import('./pages/AstrologyTeamPage'))
    .then((m) => ({ default: m.AstrologyTeamPage }))
    .catch((error) => recoverFromChunkError(error)),
);
const ContactPage = lazy(() =>
  safeImport(() => import('./pages/ContactPage'))
    .then((m) => ({ default: m.ContactPage }))
    .catch((error) => recoverFromChunkError(error)),
);
const PoliciesPage = lazy(() =>
  safeImport(() => import('./pages/PoliciesPage'))
    .then((m) => ({ default: m.PoliciesPage }))
    .catch((error) => recoverFromChunkError(error)),
);
const LoginPage = lazy(() =>
  safeImport(() => import('./pages/LoginPage'))
    .then((m) => ({ default: m.LoginPage }))
    .catch((error) => recoverFromChunkError(error)),
);
const RegisterPage = lazy(() =>
  safeImport(() => import('./pages/RegisterPage'))
    .then((m) => ({ default: m.RegisterPage }))
    .catch((error) => recoverFromChunkError(error)),
);
const NotFoundPage = lazy(() =>
  safeImport(() => import('./pages/NotFoundPage'))
    .then((m) => ({ default: m.NotFoundPage }))
    .catch((error) => recoverFromChunkError(error)),
);

const AdminPortal = lazy(() =>
  safeImport(() => import('./pages/AdminPortal'))
    .then((m) => ({ default: m.AdminPortal }))
    .catch((error) => recoverFromChunkError(error)),
);
const CustomerDashboard = lazy(() =>
  safeImport(() => import('./pages/CustomerDashboard'))
    .then((m) => ({ default: m.CustomerDashboard }))
    .catch((error) => recoverFromChunkError(error)),
);
const BirthJathagamPage = lazy(() =>
  safeImport(() => import('./pages/BirthJathagamPage'))
    .then((m) => ({ default: m.BirthJathagamPage }))
    .catch((error) => recoverFromChunkError(error)),
);
const MarriageCompatibilityPage = lazy(() =>
  safeImport(() => import('./pages/MarriageCompatibilityPage'))
    .then((m) => ({ default: m.MarriageCompatibilityPage }))
    .catch((error) => recoverFromChunkError(error)),
);
const BabyNamingPage = lazy(() =>
  safeImport(() => import('./pages/BabyNamingPage'))
    .then((m) => ({ default: m.BabyNamingPage }))
    .catch((error) => recoverFromChunkError(error)),
);
const MuhurthamPage = lazy(() =>
  safeImport(() => import('./pages/MuhurthamPage'))
    .then((m) => ({ default: m.MuhurthamPage }))
    .catch((error) => recoverFromChunkError(error)),
);

import { ErrorBoundary } from './components/common/ErrorBoundary';
import { AiAstrologerLauncher } from './components/ai-astrologer/AiAstrologerLauncher';
import { CosmicBackground } from './components/common/CosmicBackground';
import { CartProvider, useCart } from './context/CartContext';
import { FamilyCartFloatingBar } from './components/cart/FamilyCartFloatingBar';

// THE CART LAYER IS A FEATURE, NOT THE SHELL (audit PERF-1)
// ---------------------------------------------------------
// The family tray and the unified checkout are opened by the visitor; until
// they do, their code has no business being in the first download. Between
// them they pull the location picker, the birth date/time fields, the
// multi-person payload rules, the Subha Muhurtham scanner (astronomy engine +
// rules JSON) and the IANA timezone tables — several hundred kilobytes that a
// visitor who is only reading the homepage never uses.
//
// They were already rendered conditionally (both returned null while closed);
// what changes here is that they are now FETCHED conditionally too. The cart
// STATE stays eager in CartContext, and the floating bar (the ~4 kB trigger
// that shows whether the tray holds anything) stays eager with it, so nothing
// on the page changes until the visitor actually opens a cart surface.
const FamilyCartDrawer = lazy(() =>
  safeImport(() => import('./components/cart/FamilyCartDrawer'))
    .then((m) => ({ default: m.FamilyCartDrawer }))
    .catch((error) => recoverFromChunkError(error)),
);
const UnifiedCheckoutModal = lazy(() =>
  safeImport(() => import('./components/cart/UnifiedCheckoutModal'))
    .then((m) => ({ default: m.UnifiedCheckoutModal }))
    .catch((error) => recoverFromChunkError(error)),
);

/**
 * Mounts each cart surface only while it is open, so its chunk is fetched by
 * the open click. The brief gap while the chunk arrives shows nothing at all:
 * the drawer/modal is the only thing being drawn at that moment, and the
 * fallback is intentionally empty rather than a spinner over a page the
 * visitor is not looking at.
 */
function DeferredCartLayer({ onNavigate }: { onNavigate: (route: string) => void }) {
  const { isCartOpen, isCheckoutOpen } = useCart();
  return (
    <>
      {isCartOpen && (
        <Suspense fallback={null}>
          <FamilyCartDrawer onNavigate={onNavigate} />
        </Suspense>
      )}
      {isCheckoutOpen && (
        <Suspense fallback={null}>
          <UnifiedCheckoutModal onNavigate={onNavigate} />
        </Suspense>
      )}
    </>
  );
}

/** Themed spinner shown only in the brief moment a lazy route chunk loads. */
function RouteFallback() {
  return (
    <div
      className="min-h-[55vh] flex items-center justify-center"
      role="status"
      aria-label="Loading page"
    >
      <div className="h-12 w-12 rounded-full border-4 border-amber-400/25 border-t-amber-400 animate-spin" />
    </div>
  );
}

/**
 * Mounts only after the (possibly lazy) route content has resolved. Used to
 * clear the one-shot chunk-recovery flag at the right moment: if the flag were
 * cleared when the Suspense boundary first renders its fallback, a failing
 * chunk could reload the page in an endless loop.
 */
function RouteLoadedMarker() {
  useEffect(() => {
    clearChunkRecoveryFlag();
  }, []);
  return null;
}

function AppContent() {
  const getInitialRoute = () => {
    try {
      // 1. Check query parameter first if explicitly provided (e.g. /?route=muhurtham)
      const params = new URLSearchParams(window.location.search);
      const queryRoute = params.get('route');
      if (queryRoute) {
        if (queryRoute === 'admin' || queryRoute === 'admin-portal') return 'admin';
        if (queryRoute === 'eclipse-guide' || queryRoute === 'eclipse' || queryRoute === 'kiraganam') return 'services';
        if (queryRoute === 'logos' || queryRoute === 'brand-logos' || queryRoute === 'logo-concepts') return 'home';
        const validRoutes = [
          'home', 'services', 'birth-jathagam', 'marriage-compatibility', 'baby-naming', 'muhurtham',
          'how-it-works', 'about', 'team', 'contact', 'dashboard', 'login', 'register',
          'policy-privacy', 'policy-terms', 'policy-payment', 'policy-refund'
        ];
        if (validRoutes.includes(queryRoute)) return queryRoute;
      }

      // 2. Check path name for clean URL routing
      const rawPath = window.location.pathname.toLowerCase().replace(/\/+$/, '');
      const pathname = rawPath === '' ? '/' : rawPath;
      if (pathname === '/' || pathname === '/home') return 'home';

      if (
        pathname === '/admin' ||
        pathname === '/admin-portal' ||
        pathname === '/admin.php' ||
        pathname.endsWith('/admin') ||
        pathname.endsWith('/admin-portal')
      ) {
        return 'admin';
      }
      if (pathname === '/login') return 'login';
      if (pathname === '/register') return 'register';
      if (pathname === '/dashboard') return 'dashboard';
      if (pathname === '/services') return 'services';
      if (pathname === '/birth-jathagam') return 'birth-jathagam';
      if (pathname === '/marriage-compatibility') return 'marriage-compatibility';
      if (pathname === '/baby-naming') return 'baby-naming';
      if (pathname === '/muhurtham' || pathname === '/subha-muhurtham' || pathname === '/muhurtha') return 'muhurtham';
      if (pathname === '/how-it-works') return 'how-it-works';
      if (pathname === '/about') return 'about';
      if (pathname === '/team') return 'team';
      if (pathname === '/contact') return 'contact';
      if (pathname === '/privacy' || pathname === '/privacy-policy' || pathname === '/policy-privacy') return 'policy-privacy';
      if (pathname === '/terms' || pathname === '/terms-and-conditions' || pathname === '/policy-terms') return 'policy-terms';
      if (pathname === '/payment-policy' || pathname === '/policy-payment') return 'policy-payment';
      if (pathname === '/refund-policy' || pathname === '/policy-refund') return 'policy-refund';

      if (
        pathname === '/eclipse-guide' ||
        pathname === '/eclipse' ||
        pathname === '/kiraganam' ||
        pathname.endsWith('/eclipse-guide') ||
        pathname.endsWith('/eclipse')
      ) {
        window.history.replaceState({}, '', '/services');
        return 'services';
      }

      if (
        pathname === '/logos' ||
        pathname === '/brand-logos' ||
        pathname === '/logo-concepts' ||
        pathname.endsWith('/logo-concepts')
      ) {
        window.history.replaceState({}, '', '/');
        return 'home';
      }

      // If a non-root path is reached and is not in the recognized list, check if valid
      if (pathname !== '/') {
        return 'not-found';
      }
    } catch (e) {
      // window/URLSearchParams unavailable (SSR safety), ignore
    }
    return 'home';
  };

  const [currentRoute, setCurrentRoute] = useState<string>(getInitialRoute());
  const { user, birthProfile } = useAuth();

  // Handle browser back/forward buttons and programmatic app:navigate events
  useEffect(() => {
    const handlePopState = () => {
      setCurrentRoute(getInitialRoute());
    };
    const handleAppNavigate = (e: any) => {
      if (e?.detail) {
        handleNavigate(e.detail);
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('app:navigate', handleAppNavigate);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('app:navigate', handleAppNavigate);
    };
  }, []);

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentRoute]);

  // Code-splitting support (audit S1) + intent prefetch (audit PERF-1):
  // install the one-shot chunk-failure recovery here, and let hover/focus on a
  // navigation link fetch that route's chunk. Nothing is fetched speculatively
  // for a visitor who never reaches for a link.
  useEffect(() => {
    installChunkErrorRecovery();
    return installRouteIntentPrefetch();
  }, []);

  const handleNavigate = (route: string) => {
    const targetRoute = route === 'admin-portal' ? 'admin' : route;
    setCurrentRoute(targetRoute);
    try {
      if (targetRoute === 'not-found') {
        // preserve current URL
        return;
      }
      const cleanPath = targetRoute === 'home' ? '/' : `/${targetRoute}`;
      const url = new URL(cleanPath, window.location.origin);
      if (targetRoute === 'dashboard') {
        const currentParams = new URLSearchParams(window.location.search);
        const order = currentParams.get('order');
        if (order) url.searchParams.set('order', order);
      }
      window.history.pushState({}, '', url.pathname + url.search);
    } catch (e) {
      // Ignore if History API unavailable
    }
  };

  const renderRoute = () => {
    switch (currentRoute) {
      case 'home':
        return <HomePage onNavigate={handleNavigate} />;
      case 'services':
        return <ServicesPage onNavigate={handleNavigate} />;
      case 'birth-jathagam':
        return <BirthJathagamPage onNavigate={handleNavigate} />;
      case 'marriage-compatibility':
        return <MarriageCompatibilityPage onNavigate={handleNavigate} />;
      case 'baby-naming':
        return <BabyNamingPage onNavigate={handleNavigate} />;
      case 'muhurtham':
        return <MuhurthamPage onNavigate={handleNavigate} />;
      case 'how-it-works':
        return <HowItWorksPage onNavigate={handleNavigate} />;
      case 'about':
        return <AboutPage onNavigate={handleNavigate} />;
      case 'team':
        return <AstrologyTeamPage onNavigate={handleNavigate} />;
      case 'contact':
        return <ContactPage />;
      case 'dashboard':
        return <CustomerDashboard onNavigate={handleNavigate} />;
      case 'admin':
      case 'admin-portal':
        return (
          <ErrorBoundary>
            <AdminPortal onNavigate={handleNavigate} />
          </ErrorBoundary>
        );
      case 'login':
        return <LoginPage onNavigate={handleNavigate} />;
      case 'register':
        return <RegisterPage onNavigate={handleNavigate} />;
      case 'policy-privacy':
        return <PoliciesPage type="privacy" onNavigate={handleNavigate} />;
      case 'policy-terms':
        return <PoliciesPage type="terms" onNavigate={handleNavigate} />;
      case 'policy-payment':
        return <PoliciesPage type="payment" onNavigate={handleNavigate} />;
      case 'policy-refund':
        return <PoliciesPage type="refund" onNavigate={handleNavigate} />;
      case 'not-found':
        return <NotFoundPage onNavigate={handleNavigate} />;
      default:
        return <NotFoundPage onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0718] dark:bg-[#0b0718] text-[#fffdfa] font-sans antialiased selection:bg-amber-500 selection:text-slate-950 relative">
      {/* Cosmic Constellations Background Canvas */}
      <CosmicBackground />

      <Navbar currentRoute={currentRoute} onNavigate={handleNavigate} />
      <main className="flex-grow relative z-10">
        <Suspense fallback={<RouteFallback />}>
          {renderRoute()}
          <RouteLoadedMarker />
        </Suspense>
      </main>
      <Footer onNavigate={handleNavigate} />

      {/* Family order tray trigger (eager) + the deferred cart surfaces. */}
      <FamilyCartFloatingBar onNavigate={handleNavigate} />
      <DeferredCartLayer onNavigate={handleNavigate} />
      <AiAstrologerLauncher />

    </div>
  );
}

export default function App() {
  return (
    <HelmetProvider>
      <LanguageProvider>
        <AuthProvider>
          <ThemeProvider>
            <CartProvider>
              <ErrorBoundary title="ASTRO SIVAM failed to load">
                <AppContent />
              </ErrorBoundary>
            </CartProvider>
          </ThemeProvider>
        </AuthProvider>
      </LanguageProvider>
    </HelmetProvider>
  );
}
