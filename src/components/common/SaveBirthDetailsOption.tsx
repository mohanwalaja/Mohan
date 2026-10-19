import React from 'react';

interface SaveBirthDetailsOptionProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  helperText?: string;
  children?: React.ReactNode;
}

/** Optional, explicit consent before birth details are stored for reuse. */
export const SaveBirthDetailsOption: React.FC<SaveBirthDetailsOptionProps> = ({
  id,
  checked,
  onChange,
  label = 'Save these birth details for next time',
  helperText = 'Optional. Leave unchecked if you prefer not to save these details.',
  children
}) => (
  <section className="rounded-xl border border-white/10 bg-slate-900/40 p-3.5">
    <div className="flex items-start gap-2.5">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        aria-describedby={`${id}-hint`}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-400"
      />
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-xs font-semibold text-slate-200">
          {label}
        </label>
        <p id={`${id}-hint`} className="mt-1 text-[11px] leading-relaxed text-slate-400">
          {helperText}
        </p>
      </div>
    </div>
    {checked && children && <div className="ml-6 mt-3">{children}</div>}
  </section>
);
