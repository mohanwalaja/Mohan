import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Light UI shell state — notices only.
 *
 * The light UI is a re-skin of the existing site: it has no theme switcher and
 * no second palette, so the only thing this provider owns is the small
 * self-dismissing notices the interactive panels use.
 */
interface Notice {
  id: number;
  text: string;
  tone: 'info' | 'good';
}

interface LightUiContextValue {
  notices: Notice[];
  notify: (text: string, tone?: 'info' | 'good') => void;
}

const LightUiContext = createContext<LightUiContextValue>({
  notices: [],
  notify: () => {},
});

export const LightUiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notices, setNotices] = useState<Notice[]>([]);

  // The light surfaces are the document's own background: paint it once here so
  // the page colour is right before any component mounts.
  useEffect(() => {
    document.documentElement.style.setProperty('background-color', 'var(--c-page)');
  }, []);

  const notify = useCallback((text: string, tone: 'info' | 'good' = 'info') => {
    const id = Date.now() + Math.random();
    setNotices((current) => [...current.slice(-2), { id, text, tone }]);
    window.setTimeout(() => {
      setNotices((current) => current.filter((notice) => notice.id !== id));
    }, 4200);
  }, []);

  const value = useMemo(() => ({ notices, notify }), [notices, notify]);

  return <LightUiContext.Provider value={value}>{children}</LightUiContext.Provider>;
};

export const useLightUi = () => useContext(LightUiContext);

/** Small self-dismissing notices, top-centre. */
export const Notices: React.FC = () => {
  const { notices } = useLightUi();
  if (!notices.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[70] flex flex-col items-center gap-2 px-4">
      {notices.map((notice) => (
        <div
          key={notice.id}
          role="status"
          className={`c-rise max-w-md rounded-2xl border px-4 py-2.5 text-[0.82rem] font-semibold shadow-[var(--shadow-pop)] ${
            notice.tone === 'good'
              ? 'border-leaf/30 bg-leaf-soft text-leaf'
              : 'border-line bg-surface text-ink'
          }`}
        >
          {notice.text}
        </div>
      ))}
    </div>
  );
};
