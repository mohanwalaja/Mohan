import React, { Suspense, lazy, useCallback, useState } from 'react';
import { AlertCircle, Eye, Loader2 } from 'lucide-react';
import { AppLanguage, ServiceType } from '../../types';
import {
  SAMPLE_BIRTH_LABEL,
  SampleServiceType
} from '../../services/sampleReportInfo';

/**
 * The sample viewer is a DEFERRED feature (audit PERF-1): this button sits on
 * every service page, and the modal behind it pulls in the report builders and
 * (until the download click) nothing else. Fetching it when the visitor asks to
 * see a sample — instead of when the page loads — keeps the preview code out of
 * the initial navigation even for the visitors who never click.
 */
const LivePdfPreviewModal = lazy(() =>
  import('./LivePdfPreviewModal').then((m) => ({ default: m.LivePdfPreviewModal }))
);

/** Shown for the moment the sample viewer chunk is being fetched. */
function SamplePreviewLoading() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
      <div
        role="status"
        aria-label="Downloading sample report"
        className="flex flex-col items-center gap-3 rounded-3xl border border-slate-700 bg-slate-900 px-8 py-6 shadow-2xl"
      >
        <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
        <p className="text-xs font-bold text-slate-200">Downloading the sample viewer…</p>
      </div>
    </div>
  );
}

export interface SampleReportButtonProps {
  /** Which fixed sample report to open. */
  serviceType: SampleServiceType;
  /** Initial PDF language; the visitor can still switch in the viewer. */
  language?: AppLanguage;
  /** Extra classes for the button (each service page styles it to match). */
  className?: string;
  /** Button text — defaults to "View Sample Report (PDF)". */
  label?: string;
  /** Text shown while the fixed sample is being calculated. */
  loadingLabel?: string;
  /** Optional short helper line rendered under the button. */
  helperText?: string;
}

/**
 * "See the report before you order" button.
 *
 * It calculates the ONE fixed sample report for the service (01 Jan 2000,
 * 2:00 AM, Chennai — no user choice anywhere), then opens the same
 * high-resolution live preview + download modal the real reports use.
 * Every page carries a light "SAMPLE" watermark.
 */
export const SampleReportButton: React.FC<SampleReportButtonProps> = ({
  serviceType,
  language = 'en',
  className,
  label = 'View Sample Report (PDF)',
  loadingLabel = 'Downloading sample…',
  helperText
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const openSample = useCallback(async () => {
    setError('');
    // The fixed sample is cached after the first calculation — reopen instantly.
    if (result) {
      setIsOpen(true);
      return;
    }
    setIsLoading(true);
    try {
      // Import the engine only after this click, never with a service page.
      const { calculateSampleResult } = await import('../../services/sampleReports');
      const sample = await calculateSampleResult(serviceType);
      setResult(sample);
      setIsOpen(true);
    } catch (sampleError: any) {
      // Keep the technical reason in the console; show the visitor a calm note.
      console.error('[ASTRO SIVAM] Sample report could not be prepared:', sampleError);
      setError('The sample report is temporarily unavailable. Please try again in a moment.');
    } finally {
      setIsLoading(false);
    }
  }, [result, serviceType]);

  return (
    <>
      <button
        type="button"
        onClick={openSample}
        disabled={isLoading}
        title={`Open a full sample report built from fixed example details (${SAMPLE_BIRTH_LABEL}) — no customer data is used`}
        className={
          className ||
          'inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-2.5 text-xs font-bold text-amber-700 dark:text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-60 cursor-pointer'
        }
      >
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
        <span>{isLoading ? loadingLabel : label}</span>
      </button>

      {helperText && !error && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{helperText}</p>
      )}

      {error && (
        <p className="text-[11px] text-rose-600 dark:text-rose-400 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </p>
      )}

      {/* Mounted only while open, so the lazy chunk is fetched on the first
          click and never during the page's initial load. */}
      {isOpen && (
        <Suspense fallback={<SamplePreviewLoading />}>
          <LivePdfPreviewModal
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            serviceType={serviceType as ServiceType}
            result={result}
            initialLang={language}
            sourceContext="user_testing"
            sampleMode
          />
        </Suspense>
      )}
    </>
  );
};
