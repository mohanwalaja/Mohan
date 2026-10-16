import React, { createContext, useContext, useState, useEffect } from 'react';
import { PaintThemeTemplateId, ThemeTemplateConfig } from '../types';
import { useAuth } from './AuthContext';
import { api } from '../services/api';

/**
 * The paint templates THIS bundle can apply at runtime.
 *
 * Only the classic (dark/indigo) design lives here: the light Sunrise Ivory
 * design is a separate bundle with its own stylesheet and its own prerendered
 * documents, selected by the operator in Admin → Site Design and served by
 * public/.htaccess (see src/services/designSwitch.ts). Switching to it is a
 * document load, not a class toggle — which is why it is intentionally absent
 * from this registry and from ThemeContext's state.
 */
export const THEME_TEMPLATES: Record<PaintThemeTemplateId, ThemeTemplateConfig> = {
  'classic-primary': {
    id: 'classic-primary',
    modelNumber: 0,
    modelName: 'Model 0: Standard Modern Vedic',
    name: 'Classic Astro Sivam (Active Primary)',
    subtitle: 'Balanced Vedic Astrological Heritage & Modern Precision',
    badge: 'Active Default • Model 0',
    isPrimary: true,
    tagline: 'Timeless royal gold & crimson on dark cosmic slate with crisp modern cards',
    description: 'The proven, balanced ASTRO SIVAM aesthetic designed for high legibility, clean Vedic calculations, and effortless multi-device navigation.',
    culturalOrigin: 'Traditional South Indian Vedic Jyotish paired with sleek contemporary card architecture and rich amber-gold borders.',
    highlightPills: ['Primary Default', 'Royal Crimson & Amber', 'High Contrast', 'Vedic Precision', 'Universal Clarity'],
    layoutVariant: 'standard',
    heroLayoutVariant: 'split-modern',
    fontPairing: {
      display: 'font-serif font-bold',
      body: 'font-sans'
    },
    colors: {
      primary: '#d97706',
      secondary: '#7a1f1f',
      accent: '#9333ea',
      bgPageLight: '#f8fafc',
      bgPageDark: '#0b0718',
      cardBgLight: '#ffffff',
      cardBgDark: '#120e24',
      borderColorLight: '#e2e8f0',
      borderColorDark: 'rgba(217, 119, 6, 0.25)',
      goldShimmer: 'linear-gradient(135deg, #d97706, #f59e0b, #b45309)',
      textHeadingLight: '#0f172a',
      textHeadingDark: '#ffffff'
    },
    attributes: {
      mandapamArch: false,
      kolamPattern: false,
      brassDiyaGlow: false,
      zariSilkBorder: false,
      astralRings: false,
      palmLeafTexture: false,
      waxSealEmblem: false,
      hudTelemetry: false,
      cardCornerStyle: 'rounded-2xl border border-slate-200 dark:border-slate-800',
      cardSurfaceClass: 'bg-white dark:bg-[#120e24] border-slate-200 dark:border-slate-800 shadow-md',
      buttonGradient: 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold',
      bannerGradient: 'bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900',
      sectionDividerStyle: 'subtle-line'
    }
  }
};

interface ThemeContextType {
  activeThemeId: PaintThemeTemplateId;
  previewThemeId: PaintThemeTemplateId | null;
  activeTheme: ThemeTemplateConfig;
  currentTheme: ThemeTemplateConfig;
  allThemes: ThemeTemplateConfig[];
  isLivePreviewing: boolean;
  setPreviewTheme: (id: PaintThemeTemplateId | null) => void;
  applyThemeGlobally: (id: PaintThemeTemplateId) => Promise<boolean>;
  resetPreview: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  activeThemeId: 'classic-primary',
  previewThemeId: null,
  activeTheme: THEME_TEMPLATES['classic-primary'],
  currentTheme: THEME_TEMPLATES['classic-primary'],
  allThemes: Object.values(THEME_TEMPLATES),
  isLivePreviewing: false,
  setPreviewTheme: () => {},
  applyThemeGlobally: async () => false,
  resetPreview: () => {}
});

const THEME_STORAGE_KEY = 'astrosivam_active_theme_template';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings, refreshSettings } = useAuth();

  /**
   * The stored setting may name either shipped design; only a design THIS
   * bundle can paint is applied here. 'sunrise-ivory' intentionally resolves to
   * the classic paint because the light design ships as its own document set
   * (see the THEME_TEMPLATES note above and src/services/designSwitch.ts).
   */
  const paintTemplateOf = (value?: string | null): PaintThemeTemplateId | null =>
    value && THEME_TEMPLATES[value as PaintThemeTemplateId] ? (value as PaintThemeTemplateId) : null;

  const getInitialTheme = (): PaintThemeTemplateId => {
    try {
      const stored = paintTemplateOf(localStorage.getItem(THEME_STORAGE_KEY));
      if (stored) return stored;
      const fromSettings = paintTemplateOf(settings?.activeThemeTemplate);
      if (fromSettings) return fromSettings;
    } catch (e) {}
    return 'classic-primary';
  };

  const [activeThemeId, setActiveThemeId] = useState<PaintThemeTemplateId>(getInitialTheme());
  const [previewThemeId, setPreviewThemeId] = useState<PaintThemeTemplateId | null>(null);

  // Sync if settings load from backend
  useEffect(() => {
    const fromSettings = paintTemplateOf(settings?.activeThemeTemplate);
    if (fromSettings) {
      setActiveThemeId(fromSettings);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, fromSettings);
      } catch (e) {}
    }
  }, [settings?.activeThemeTemplate]);

  const effectiveThemeId = previewThemeId || activeThemeId;
  const currentTheme = THEME_TEMPLATES[effectiveThemeId] || THEME_TEMPLATES['classic-primary'];
  const activeTheme = THEME_TEMPLATES[activeThemeId] || THEME_TEMPLATES['classic-primary'];

  // Apply CSS custom attributes and data-theme to HTML root
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('dark');
    document.body.classList.add('dark');
    root.setAttribute('data-theme', effectiveThemeId);

    // Set custom CSS variables for themes
    root.style.setProperty('--theme-primary', currentTheme.colors.primary);
    root.style.setProperty('--theme-secondary', currentTheme.colors.secondary);
    root.style.setProperty('--theme-accent', currentTheme.colors.accent);
    root.style.setProperty('--theme-bg-light', currentTheme.colors.bgPageLight);
    root.style.setProperty('--theme-bg-dark', currentTheme.colors.bgPageDark);
    root.style.setProperty('--theme-card-light', currentTheme.colors.cardBgLight);
    root.style.setProperty('--theme-card-dark', currentTheme.colors.cardBgDark);
    root.style.setProperty('--theme-border-light', currentTheme.colors.borderColorLight);
    root.style.setProperty('--theme-border-dark', currentTheme.colors.borderColorDark);

    return () => {
      root.removeAttribute('data-theme');
    };
  }, [effectiveThemeId, currentTheme]);

  const setPreviewTheme = (id: PaintThemeTemplateId | null) => {
    setPreviewThemeId(id);
  };

  const resetPreview = () => {
    setPreviewThemeId(null);
  };

  const applyThemeGlobally = async (id: PaintThemeTemplateId): Promise<boolean> => {
    if (!THEME_TEMPLATES[id]) return false;
    try {
      setActiveThemeId(id);
      setPreviewThemeId(null);
      localStorage.setItem(THEME_STORAGE_KEY, id);

      // Attempt to persist to admin backend settings
      await api.updateAdminSettings({ activeThemeTemplate: id });
      await refreshSettings();
      return true;
    } catch (err) {
      console.warn('Persisted theme locally:', id);
      return true;
    }
  };

  return (
    <ThemeContext.Provider
      value={{
        activeThemeId,
        previewThemeId,
        activeTheme,
        currentTheme,
        allThemes: Object.values(THEME_TEMPLATES),
        isLivePreviewing: previewThemeId !== null,
        setPreviewTheme,
        applyThemeGlobally,
        resetPreview
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
