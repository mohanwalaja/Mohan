import React, { useEffect, useMemo, useRef } from 'react';
import { UserRound, Users, PenLine } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  buildSavedPeople,
  consumePendingOrderFor,
  type SavedPerson
} from '../../utils/birthDetails';

/** Everyone the signed-in customer may explicitly pick for an order form. */
export const useSavedPeople = (): SavedPerson[] => {
  const { birthProfile, familyMembers } = useAuth();
  return useMemo(
    () => buildSavedPeople(birthProfile, familyMembers),
    [birthProfile, familyMembers]
  );
};

/**
 * Applies the dashboard's explicit "Order for <name>" hand-off exactly once:
 * the customer chose that person in their profile, so starting the form with
 * them picked is their action — never a silent default. A plain visit has
 * no hand-off and the form stays blank.
 */
export const useDashboardOrderFor = (
  people: SavedPerson[],
  onPick: (person: SavedPerson) => void
) => {
  const handled = useRef(false);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  useEffect(() => {
    if (handled.current || people.length === 0) return;
    const key = consumePendingOrderFor();
    handled.current = true;
    if (!key) return;
    const person = people.find(candidate => candidate.key === key);
    if (person) pickRef.current(person);
  }, [people]);
};

interface SavedPersonPickerProps {
  /** Picked saved-person key; '' means "enter new details" (the default). */
  value: string;
  onPick: (person: SavedPerson | null, key: string) => void;
  label?: string;
  theme?: 'dark' | 'light';
}

/**
 * "Who is this report for?" — the ONLY way saved birth details enter an
 * order form. The default is always "Enter new details" (a blank form);
 * the account holder's own profile and every saved family member are one
 * explicit tap away, which then fills the whole form with no typing.
 */
export const SavedPersonPicker: React.FC<SavedPersonPickerProps> = ({
  value,
  onPick,
  label = 'Who is this report for?',
  theme = 'dark'
}) => {
  const { user } = useAuth();
  const people = useSavedPeople();

  if (!user) return null;

  const isDark = theme === 'dark';
  const shell = isDark
    ? 'bg-slate-900/60 border-slate-700/70'
    : 'bg-amber-50 dark:bg-slate-800/50 border-amber-200 dark:border-slate-700';
  const labelClass = isDark ? 'text-slate-200' : 'text-slate-800 dark:text-slate-100';
  const hintClass = isDark ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400';
  const chipBase = isDark
    ? 'border-slate-600 bg-slate-800 text-slate-200 hover:border-amber-400/70'
    : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-amber-500';
  const chipActive = isDark
    ? 'border-amber-400 bg-amber-500/15 text-amber-200'
    : 'border-amber-500 bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-200';

  return (
    <div className={`rounded-2xl border p-3.5 space-y-2.5 ${shell}`} data-saved-person-picker>
      <div className={`text-xs font-bold flex items-center gap-1.5 ${labelClass}`}>
        <Users className="w-3.5 h-3.5 text-amber-500" />
        <span>{label}</span>
      </div>

      {people.length === 0 ? (
        <p className={`text-[11px] leading-relaxed ${hintClass}`}>
          No saved birth details yet. Enter the details below — you can save family
          members in <strong>Dashboard → Family Members</strong> and pick them here
          next time with no form filling.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onPick(null, '')}
            className={`px-3 py-2 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${value === '' ? chipActive : chipBase}`}
            aria-pressed={value === ''}
          >
            <PenLine className="w-3.5 h-3.5" />
            <span>Enter new details</span>
          </button>
          {people.map(person => (
            <button
              key={person.key}
              type="button"
              onClick={() => onPick(person, person.key)}
              className={`px-3 py-2 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${value === person.key ? chipActive : chipBase}`}
              aria-pressed={value === person.key}
              title={`${person.name} • ${person.dob} • ${person.birthPlace}`}
            >
              <UserRound className="w-3.5 h-3.5" />
              <span>
                {person.source === 'self' ? `Myself — ${person.name}` : `${person.name} (${person.relationLabel})`}
              </span>
            </button>
          ))}
        </div>
      )}
      {value !== '' && (
        <p className={`text-[11px] ${hintClass}`}>
          Details filled from the saved profile. You can still correct any field —
          corrections apply to this order only unless you save them.
        </p>
      )}
    </div>
  );
};
