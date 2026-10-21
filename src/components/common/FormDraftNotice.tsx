import React, { useEffect, useRef, useState } from 'react';
import { History, X } from 'lucide-react';
import {
  FORM_DRAFT_TTL_MS,
  FORM_DRAFT_WRITE_DELAY_MS,
  clearFormDraft,
  refreshFormDraft,
  takeFormDraft
} from '../../services/formDraft';
import { peekPendingOrderFor } from '../../utils/birthDetails';

export interface FormDraftConfig<T extends object> {
  /** Route key that namespaces this page's draft ('baby-naming'). */
  route: string;
  /** The current form values, captured when the draft is written. */
  snapshot: () => T;
  /** Put a draft back into the form. Must sanitize — a draft is stored text. */
  restore: (draft: T) => void;
  /** True when the form holds nothing worth keeping (so the draft is dropped). */
  isEmpty: () => boolean;
  /** Values whose change should refresh the draft. Fixed length, like any deps. */
  deps: unknown[];
}

export interface FormDraftState {
  /** True while the "we kept your details" note should be shown. */
  restored: boolean;
  /** Hide the note, keeping whatever is in the form. */
  dismiss: () => void;
  /** Hide the note AND drop the stored draft — call after an order is placed. */
  discard: () => void;
}

/**
 * Keeps a visitor's half-filled order form for them across the two routes that
 * used to lose it: clicking **Login** in the navbar, and refreshing the page.
 *
 * The rules that keep this from becoming the old silent auto-fill:
 *   • only what THIS visitor typed in THIS tab is ever restored (sessionStorage,
 *     30-minute lifetime, consumed once);
 *   • it restores only into a genuinely empty form — live typing is never
 *     overwritten;
 *   • an explicit dashboard "Order for <name>" hand-off wins, so a customer who
 *     chose a person there is never given yesterday's half-typed form instead;
 *   • the visitor is told, in plain words, and can dismiss it.
 */
export function useFormDraft<T extends object>({
  route,
  snapshot,
  restore,
  isEmpty,
  deps
}: FormDraftConfig<T>): FormDraftState {
  const [restored, setRestored] = useState(false);

  // The latest closures without re-running either effect: the restore must
  // happen once on mount, and the write must not fire on every render.
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  const emptyRef = useRef(isEmpty);
  emptyRef.current = isEmpty;
  const readyRef = useRef(false);

  useEffect(() => {
    readyRef.current = false;
    // One shot, empty forms only, and never over an explicit dashboard
    // "Order for <name>" hand-off — the rules live in takeFormDraft().
    const draft = takeFormDraft<T>(route, emptyRef.current(), {
      pendingHandOff: peekPendingOrderFor()
    });
    if (draft) {
      restoreRef.current(draft);
      setRestored(true);
    }
    readyRef.current = true;
  }, [route]);

  useEffect(() => {
    if (!readyRef.current) return;
    const timer = setTimeout(() => {
      refreshFormDraft(route, emptyRef.current(), snapshotRef.current);
    }, FORM_DRAFT_WRITE_DELAY_MS);
    return () => clearTimeout(timer);
    // The page lists the form values it wants tracked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return {
    restored,
    dismiss: () => setRestored(false),
    discard: () => {
      clearFormDraft(route);
      setRestored(false);
    }
  };
}

interface FormDraftNoticeProps {
  shown: boolean;
  onDismiss: () => void;
  /** What the form is for, in the customer's own words ('baby naming form'). */
  subject?: string;
}

/**
 * The plain-language note that says the details were kept. It is deliberately
 * visible: a form that fills itself without a word is how the old saved-profile
 * auto-fill confused people.
 */
export const FormDraftNotice: React.FC<FormDraftNoticeProps> = ({
  shown,
  onDismiss,
  subject = 'form'
}) => {
  if (!shown) return null;
  const minutes = Math.round(FORM_DRAFT_TTL_MS / 60000);
  return (
    <div
      data-testid="form-draft-restored"
      className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2.5"
    >
      <History className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
      <div className="flex-1 leading-relaxed">
        We kept the details you entered in this {subject}, so you do not have to type them again.
        They stay on this device for {minutes} minutes and you can change any field.
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="p-1 rounded-lg text-amber-500 hover:text-amber-700 dark:hover:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
