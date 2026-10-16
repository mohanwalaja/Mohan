import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Palette + toast state for the Daylight UI.
 *
 * The palette is the one piece of visitor preference this design persists: the
 * three light palettes are all legitimate brand surfaces, so remembering the
 * choice costs nothing and spares a returning visitor a re-pick.
 */
export type PaletteId = 'sunrise' | 'mist' | 'lotus';

export interface PaletteOption {
  id: PaletteId;
  name: string;
  tagline: string;
  swatch: [string, string, string];
  glyph: string;
}

export const PALETTES: PaletteOption[] = [
  {
    id: 'sunrise',
    name: 'Sunrise Ivory',
    tagline: 'Warm paper, temple gold',
    swatch: ['#fffbf3', '#d99a2b', '#0e7c7b'],
    glyph: '☀'
  },
  {
    id: 'mist',
    name: 'Monsoon Mist',
    tagline: 'Cool teal on rain light',
    swatch: ['#f6fafb', '#0e7490', '#c2831b'],
    glyph: '☂'
  },
  {
    id: 'lotus',
    name: 'Lotus Blush',
    tagline: 'Soft pink, deep lotus',
    swatch: ['#fff7fa', '#c2185b', '#6d4ac4'],
    glyph: '❋'
  }
];

const STORAGE_KEY = 'astrosivam_daylight_palette';

interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'good';
}

interface LightUiContextValue {
  palette: PaletteId;
  setPalette: (id: PaletteId) => void;
  toasts: Toast[];
  notify: (text: string, tone?: 'info' | 'good') => void;
}

const LightUiContext = createContext<LightUiContextValue>({
  palette: 'sunrise',
  setPalette: () => {},
  toasts: [],
  notify: () => {},
});

export const LightUiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [palette, setPaletteState] = useState<PaletteId>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as PaletteId | null;
      if (stored && PALETTES.some((entry) => entry.id === stored)) return stored;
    } catch {
      /* storage unavailable — the default palette is fine */
    }
    return 'sunrise';
  });
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    document.documentElement.setAttribute('data-palette', palette);
    document.documentElement.setAttribute('lang', document.documentElement.getAttribute('lang') || 'en');
    try {
      localStorage.setItem(STORAGE_KEY, palette);
    } catch {
      /* ignore */
    }
  }, [palette]);

  const notify = useCallback((text: string, tone: 'info' | 'good' = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-2), { id, text, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
  }, []);

  const value = useMemo(
    () => ({ palette, setPalette: setPaletteState, toasts, notify }),
    [palette, toasts, notify],
  );

  return <LightUiContext.Provider value={value}>{children}</LightUiContext.Provider>;
};

export const useLightUi = () => useContext(LightUiContext);
