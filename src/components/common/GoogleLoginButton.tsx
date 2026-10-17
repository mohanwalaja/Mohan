import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useAuth } from '../../context/AuthContext';
import { googleIdentity, type GoogleIdentityStatus } from '../../services/googleIdentity';
import { X, ShieldAlert, Loader2 } from 'lucide-react';

interface GoogleLoginButtonProps {
  onSuccess?: () => void;
  onError?: (err: string) => void;
  mode?: 'signin' | 'register';
  className?: string;
}

/**
 * FIRST-ATTEMPT SIGN-IN (why this component waits before it lets you click)
 * ------------------------------------------------------------------------
 * A first-time visitor has neither the Google SDK nor the public settings that
 * carry the Google client id in their cache. The button used to be clickable
 * straight away and answered an early click with "could not be reached" / "not
 * configured" — "Try Again" then worked once the script/settings had landed.
 *
 * The button is now only clickable once it can really open Google:
 *   preparing  -> SDK still downloading, or the client id has not arrived yet
 *   ready      -> client id known AND SDK loaded (click opens the popup)
 * and the two failure states explain themselves and retry the *missing piece*
 * (re-download the SDK / re-fetch the settings) instead of repeating a doomed
 * click. The popup itself is still opened synchronously inside the click
 * handler: browsers only allow window.open() from a user gesture.
 */
type GooglePhase = 'preparing' | 'ready' | 'not-configured' | 'settings-unavailable' | 'sdk-unavailable';

/** Delays before each background re-fetch of the public settings (first one is immediate). */
const SETTINGS_HEAL_DELAYS_MS = [0, 2500] as const;
/** Background re-fetches may be patient; no first-paint UI is waiting on them. */
const SETTINGS_HEAL_TIMEOUT_MS = 12_000;
/** Release the button if Google never reports back (popup closed in a browser that cannot tell us). */
const POPUP_WATCHDOG_MS = 120_000;

const MESSAGE_NOT_CONFIGURED =
  'Google Sign-In is not configured for this site yet. Please sign in with your e-mail address and password, or contact support.';
const MESSAGE_SETTINGS_UNAVAILABLE =
  'We could not load the Google sign-in settings. Please check your connection and try again, or sign in with your e-mail address and password.';
const MESSAGE_SDK_UNAVAILABLE =
  'Google Sign-In could not be reached. Please check your connection and try again, or sign in with your e-mail address and password. If you use an ad-blocker or privacy extension, allow accounts.google.com.';
const MESSAGE_POPUP_BLOCKED =
  'Your browser blocked the Google sign-in window. Please allow pop-ups for astrosivam.com, then try again.';
const MESSAGE_CANCELLED =
  'Google sign-in was cancelled or blocked by your browser. Please allow pop-ups for astrosivam.com and try again.';
const MESSAGE_FLOW_FAILED =
  'Google sign-in could not be completed. Please try again, or sign in with your e-mail address and password.';

interface GoogleDialog {
  message: string;
  /** What "Try Again" does: reopen Google ('flow') or re-prepare the missing SDK/settings ('prepare'). */
  retry: 'flow' | 'prepare';
}

export const GoogleLoginButton: React.FC<GoogleLoginButtonProps> = ({
  onSuccess,
  onError,
  mode = 'signin',
  className = ''
}) => {
  const { settings, settingsResolved, googleLogin, refreshSettings } = useAuth();
  const sdkStatus = useSyncExternalStore<GoogleIdentityStatus>(
    googleIdentity.subscribe,
    googleIdentity.getStatus,
    () => 'idle'
  );
  const [isLoading, setIsLoading] = useState(false);
  const [dialog, setDialog] = useState<GoogleDialog | null>(null);
  const [healRound, setHealRound] = useState(0);
  const loginInFlight = useRef(false);
  const watchdog = useRef<number | undefined>(undefined);

  const isEnabled = settings?.googleLoginEnabled !== false;
  const clientId = settings?.googleClientId?.trim() || '';
  // The API always sends googleClientId (possibly ''), so a string means the
  // settings really arrived; null/undefined means they never did.
  const settingsLoaded = typeof settings?.googleClientId === 'string';
  const settingsMissing = isEnabled && !clientId && settingsResolved && !settingsLoaded;

  let phase: GooglePhase;
  if (!clientId) {
    if (!settingsResolved) phase = 'preparing';
    else if (settingsLoaded) phase = 'not-configured';
    else phase = healRound < SETTINGS_HEAL_DELAYS_MS.length ? 'preparing' : 'settings-unavailable';
  } else if (sdkStatus === 'ready') {
    phase = 'ready';
  } else {
    phase = sdkStatus === 'failed' ? 'sdk-unavailable' : 'preparing';
  }

  // Keep the freshest callbacks for the asynchronous Google callbacks below.
  const latest = useRef({ googleLogin, onSuccess, onError });
  useEffect(() => {
    latest.current = { googleLogin, onSuccess, onError };
  });

  // Start downloading the Google SDK as soon as the button exists — not at
  // click time. One shared <script>, retried automatically if it fails.
  useEffect(() => {
    if (isEnabled) googleIdentity.start();
  }, [isEnabled]);

  // No cached settings and the first request failed or timed out: nothing else
  // asks again, so "Try Again" could never succeed until a full page reload.
  // Re-fetch (patiently) until the client id arrives.
  useEffect(() => {
    if (!settingsMissing || healRound >= SETTINGS_HEAL_DELAYS_MS.length) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      Promise.resolve(refreshSettings({ timeoutMs: SETTINGS_HEAL_TIMEOUT_MS }))
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setHealRound(round => round + 1);
        });
    }, SETTINGS_HEAL_DELAYS_MS[healRound]);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [settingsMissing, healRound]);

  useEffect(() => () => window.clearTimeout(watchdog.current), []);

  if (!isEnabled) {
    return null;
  }

  const finishFlow = () => {
    window.clearTimeout(watchdog.current);
    setIsLoading(false);
  };

  const openDialog = (message: string, retry: GoogleDialog['retry']) => setDialog({ message, retry });

  const handleTokenResponse = async (tokenResponse: any) => {
    if (!tokenResponse || tokenResponse.error || !tokenResponse.access_token) {
      finishFlow();
      openDialog(MESSAGE_CANCELLED, 'flow');
      return;
    }
    // One verification at a time: a second token for the same page must not
    // start a second request that could race the first on the server.
    if (loginInFlight.current) return;
    loginInFlight.current = true;
    try {
      // Send ONLY the access token. The server calls Google's
      // userinfo endpoint itself, so the identity cannot be spoofed.
      const res = await latest.current.googleLogin({ accessToken: tokenResponse.access_token });

      if (res.success) {
        latest.current.onSuccess?.();
      } else {
        const message = res.message || 'Google sign in failed.';
        openDialog(message, 'flow');
        latest.current.onError?.(message);
      }
    } catch (e: any) {
      const message = e?.message || 'Error processing Google profile data.';
      openDialog(message, 'flow');
      latest.current.onError?.(message);
    } finally {
      loginInFlight.current = false;
      finishFlow();
    }
  };

  // Google's non-OAuth failures. Without this the button stayed on
  // "Connecting to Google..." forever after a blocked or closed popup.
  const handleTokenError = (error?: { type?: string }) => {
    if (loginInFlight.current) return; // a token already arrived; verification owns the button
    finishFlow();
    if (error?.type === 'popup_closed') return; // the visitor closed the window: not an error
    openDialog(error?.type === 'popup_failed_to_open' ? MESSAGE_POPUP_BLOCKED : MESSAGE_FLOW_FAILED, 'flow');
  };

  // Everything from the click to requestAccessToken() is synchronous on purpose:
  // browsers only open the Google popup from inside the user's click.
  const startGoogleFlow = () => {
    const oauth2 = window.google?.accounts?.oauth2;
    if (!clientId || typeof oauth2?.initTokenClient !== 'function') {
      // Raced a settings/SDK change between render and click: explain, then re-prepare.
      openDialog(clientId ? MESSAGE_SDK_UNAVAILABLE : MESSAGE_NOT_CONFIGURED, 'prepare');
      return;
    }
    setIsLoading(true);
    window.clearTimeout(watchdog.current);
    watchdog.current = window.setTimeout(() => setIsLoading(false), POPUP_WATCHDOG_MS);
    try {
      const tokenClient = oauth2.initTokenClient({
        client_id: clientId,
        scope: 'email profile openid',
        callback: handleTokenResponse,
        error_callback: handleTokenError
      });
      tokenClient.requestAccessToken();
    } catch (err: any) {
      console.warn('Google GIS error:', err);
      finishFlow();
      openDialog(MESSAGE_FLOW_FAILED, 'flow');
    }
  };

  /** Re-fetch whichever piece is missing (SDK script and/or the public settings). */
  const prepareAgain = () => {
    googleIdentity.start();
    if (clientId) return;
    if (settingsMissing) setHealRound(0);
    else void refreshSettings({ timeoutMs: SETTINGS_HEAL_TIMEOUT_MS });
  };

  const handleGoogleClick = () => {
    if (isLoading) return;
    switch (phase) {
      case 'ready':
        startGoogleFlow();
        return;
      case 'not-configured':
        openDialog(MESSAGE_NOT_CONFIGURED, 'prepare');
        return;
      case 'settings-unavailable':
        openDialog(MESSAGE_SETTINGS_UNAVAILABLE, 'prepare');
        return;
      case 'sdk-unavailable':
        openDialog(MESSAGE_SDK_UNAVAILABLE, 'prepare');
        return;
      default:
        return; // preparing: the button is disabled, nothing to do yet
    }
  };

  const handleRetry = () => {
    const retry = dialog?.retry;
    setDialog(null);
    if (retry === 'flow' && phase === 'ready') {
      startGoogleFlow();
    } else {
      prepareAgain();
    }
  };

  const isBusy = isLoading || phase === 'preparing';

  return (
    <>
      <button
        type="button"
        id="google-login-btn"
        onClick={handleGoogleClick}
        disabled={isBusy}
        aria-busy={isBusy}
        className={`w-full py-3 px-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-slate-800 dark:text-slate-100 font-bold text-xs rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-all flex items-center justify-center gap-3 active:scale-98 disabled:opacity-50 cursor-pointer ${className}`}
      >
        {/* Official Multi-Color Google G Logo (a spinner while Google is being prepared / contacted) */}
        {isBusy ? (
          <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden="true" />
        ) : (
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              fill="#EA4335"
            />
          </svg>
        )}

        <span className="whitespace-nowrap">
          {isLoading
            ? 'Connecting to Google...'
            : phase === 'preparing'
            ? 'Preparing Google sign-in...'
            : mode === 'signin'
            ? 'Continue with Google'
            : 'Sign Up with Google'}
        </span>
      </button>

      {/* Seamless Google Sign-In & Verification Dialog */}
      {dialog && (
        <div role="alertdialog" aria-modal="true" aria-label="Sign in with Google" className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 shadow-xs">
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      fill="#EA4335"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Sign in with Google
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    ASTRO SIVAM User Portal
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDialog(null)}
                aria-label="Close"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-start gap-2.5 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl">
              <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {dialog.message || MESSAGE_FLOW_FAILED}
              </p>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              For your security, ASTRO SIVAM only accepts sign-ins verified directly by Google.
              An account can never be accessed by simply typing in an e-mail address.
            </p>

            <div className="pt-1 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDialog(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleRetry}
                className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-black rounded-xl shadow-md shadow-amber-500/20 transition-all cursor-pointer"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
