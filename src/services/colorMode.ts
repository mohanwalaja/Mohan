export type ColorMode = 'light' | 'dark';

// A visitor's display preference is local to their browser, not an admin
// setting. No saved choice (or unavailable storage) always means light mode.
export const COLOR_MODE_STORAGE_KEY = 'astrosivam_color_mode';

export function getSavedColorMode(): ColorMode {
  try {
    return window.localStorage.getItem(COLOR_MODE_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function saveColorMode(mode: ColorMode): void {
  try {
    window.localStorage.setItem(COLOR_MODE_STORAGE_KEY, mode);
  } catch {
    // Browsers with blocked storage still let visitors switch for this visit.
  }
}
