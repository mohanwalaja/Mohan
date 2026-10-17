import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { aiAstrologer, type ChatLanguage } from '../../services/aiAstrologerApi';
import { recoverFromChunkError, safeImport } from '../../services/routeChunks';

// The launcher is on every page; the panel it opens is not (audit PERF-1). The
// panel is ~900 lines of chat UI that most visitors never open, so it is
// fetched by the first click instead of by the first page view. The launcher
// itself (access check + the floating button) stays eager.
const AiAstrologerPanel = lazy(() =>
  safeImport(() => import('./AiAstrologerPanel'))
    .then((m) => ({ default: m.default }))
    .catch((error) => recoverFromChunkError(error)),
);

/**
 * Site-wide source-based astrologer launcher, replacing the retired canned support chat.
 * Customers only see it while the server confirms a recently delivered report
 * (paid or free-beta first report). Administrators always see it while signed
 * in.
 */
export const AiAstrologerLauncher: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const { language: appLanguage } = useLanguage();
  const [isAvailable, setIsAvailable] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  /**
   * Language of the delivered report that opened chat access. The chat speaks
   * the report's language, so the customer sees the same language here that
   * they selected when ordering the report.
   */
  const [reportLanguage, setReportLanguage] = useState<ChatLanguage | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setIsAvailable(false);
      setIsOpen(false);
      setReportLanguage(null);
      return;
    }

    if (isAdmin) {
      setIsAvailable(true);
      return;
    }

    let cancelled = false;
    const refreshAccess = async () => {
      try {
        // This endpoint uses the same server-side email-delivery and 7-day
        // entitlement gate as the chat itself, and reports which language the
        // entitled report was written in. The browser never grants access.
        const usage = await aiAstrologer.usage();
        if (!cancelled) {
          setIsAvailable(true);
          setReportLanguage(usage.language ?? null);
        }
      } catch {
        if (!cancelled) {
          setIsAvailable(false);
          setIsOpen(false);
          setReportLanguage(null);
        }
      }
    };

    void refreshAccess();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshAccess();
    }, 30_000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refreshAccess();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user?.id, isAdmin]);

  if (!user?.id || !isAvailable) return null;

  // The chat follows the language of the report that opened access — the
  // language the customer picked when ordering — so the conversation matches
  // the report. Administrators, who have no bound report, and customers with
  // no report language fall back to the site's language picker (en/ta/hi).
  // The server keeps its country-based default (India -> hi, else ta) only as
  // a fallback for clients that create a session without sending a language.
  const language: ChatLanguage = reportLanguage ?? appLanguage;

  return (
    <>
      {isOpen && (
        <div className="ai-chat-panel-frame fixed bottom-24 right-3 z-[60] w-[calc(100vw-1.5rem)] max-w-lg select-auto sm:right-5">
          <Suspense
            fallback={
              <div
                className="ai-chat-panel-fallback flex h-40 items-center justify-center rounded-2xl border border-amber-500/30 bg-slate-900/95 text-xs font-semibold text-amber-200 shadow-2xl backdrop-blur-md"
                role="status"
              >
                Opening ASTRO SIVAM…
              </div>
            }
          >
            <AiAstrologerPanel
              customerId={String(user.id)}
              customerName={user.name || (isAdmin ? 'Administrator' : 'there')}
              language={language}
              isAdmin={isAdmin}
              onClose={() => setIsOpen(false)}
            />
          </Suspense>
        </div>
      )}

      <div className="ai-chat-launcher fixed bottom-5 right-5 z-[60] flex items-center gap-3">
        {!isOpen && (
          <div className="ai-chat-launcher-pill hidden items-center gap-2 rounded-full border border-amber-500/30 bg-slate-900/95 px-3.5 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-md sm:flex">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <span>Ask ASTRO SIVAM</span>
          </div>
        )}
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          className="group relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-amber-500 via-amber-400 to-amber-500 text-slate-950 shadow-2xl transition-all hover:scale-110 active:scale-95"
          aria-label={isOpen ? 'Close ASTRO SIVAM chat' : 'Open ASTRO SIVAM chat'}
          aria-expanded={isOpen}
        >
          {isOpen ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6 transition-transform group-hover:rotate-6" />}
        </button>
      </div>
    </>
  );
};
