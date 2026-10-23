import type { AppLanguage } from '../types';

export const SUPPORTED_REPORT_LANGUAGES = ['en', 'ta', 'hi'] as const satisfies readonly AppLanguage[];

/** Treat API/database values as untrusted even when their TypeScript type is a union. */
export function normalizeReportLanguage(value: unknown): AppLanguage {
  if (typeof value !== 'string') return 'en';
  const normalized = value.trim().toLowerCase();
  if ((SUPPORTED_REPORT_LANGUAGES as readonly string[]).includes(normalized)) {
    return normalized as AppLanguage;
  }
  if (normalized === 'tamil' || normalized === 'tam' || normalized === 'தமிழ்' || normalized.startsWith('ta-') || normalized.startsWith('ta_')) {
    return 'ta';
  }
  if (normalized === 'hindi' || normalized === 'hin' || normalized === 'हिन्दी' || normalized === 'हिंदी' || normalized.startsWith('hi-') || normalized.startsWith('hi_')) {
    return 'hi';
  }
  return 'en';
}
