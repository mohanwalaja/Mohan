import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { User, CustomerBirthProfile, SystemSettings } from '../types';
import { api, getAuthToken, setAuthToken, clearAuthToken } from '../services/api';
import { cleanDisplayName, providerFallbackName, resolveDisplayName } from '../utils/displayName';

interface AuthContextType {
  user: User | null;
  birthProfile: CustomerBirthProfile | null;
  settings: SystemSettings | null;
  /** True once a valid public design is cached, settings load, or the bounded fallback fires. */
  settingsResolved: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  login: (email: string, pass: string) => Promise<{ success: boolean; message?: string; user?: User }>;
  adminLogin: (email: string, pass: string) => Promise<{ success: boolean; message?: string; user?: User }>;
  register: (data: any) => Promise<{ success: boolean; message?: string; user?: User; status?: string; email?: string }>;
  verifyRegisterOtp: (email: string, otp: string, password: string) => Promise<{ success: boolean; message?: string; user?: User }>;
  resendRegisterOtp: (email: string) => Promise<{ success: boolean; message?: string }>;
  googleLogin: (googleData: { id?: string; sub?: string; name?: string; email?: string; credential?: string; accessToken?: string }) => Promise<{ success: boolean; message?: string; user?: User }>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  updateBirthProfile: (profile: Partial<CustomerBirthProfile>) => Promise<{ success: boolean; message?: string }>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  birthProfile: null,
  settings: null,
  settingsResolved: false,
  isLoading: true,
  isAdmin: false,
  login: async () => ({ success: false }),
  adminLogin: async () => ({ success: false }),
  register: async () => ({ success: false }),
  verifyRegisterOtp: async () => ({ success: false }),
  resendRegisterOtp: async () => ({ success: false }),
  googleLogin: async () => ({ success: false }),
  logout: () => {},
  refreshProfile: async () => {},
  refreshSettings: async () => {},
  updateBirthProfile: async () => ({ success: false })
});

const SETTINGS_CACHE_KEY = 'astrosivam_settings';

/** Cached settings contain only the redacted public response, never admin secrets. */
function readCachedSettings(): SystemSettings | null {
  try {
    const cached = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as SystemSettings
      : null;
  } catch {
    return null;
  }
}

/**
 * PHP API responses and older saved records may return birth profiles in
 * slightly different shapes (SQL snake_case columns versus the client
 * camelCase model). Normalize
 * at the auth boundary so every screen receives safe, numeric coordinates.
 */
const normalizeBirthProfile = (value: any): CustomerBirthProfile | null => {
  if (!value || typeof value !== 'object') return null;

  const toFiniteNumber = (candidate: unknown, fallback: number) => {
    if (candidate === null || candidate === undefined || candidate === '') return fallback;
    const parsed = Number(candidate);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  return {
    userId: String(value.userId ?? value.user_id ?? ''),
    name: cleanDisplayName(String(value.name ?? '')),
    dob: String(value.dob ?? ''),
    tob: String(value.tob ?? ''),
    birthPlace: String(value.birthPlace ?? value.birth_place ?? ''),
    country: String(value.country ?? ''),
    latitude: toFiniteNumber(value.latitude, 0),
    longitude: toFiniteNumber(value.longitude, 0),
    timezoneOffsetHours: toFiniteNumber(value.timezoneOffsetHours ?? value.timezone_offset_hours, 0),
    gender: value.gender === 'F' ? 'F' : 'M',
    updatedAt: String(value.updatedAt ?? value.updated_at ?? '')
  };
};

/**
 * Normalizes a user at the auth boundary: the shown name is always the plain
 * name saved in the website profile — never a "(Google)" tag, never a
 * provider placeholder like "Google User", and never a stale name once the
 * profile name is known.
 */
const normalizeUser = (value: any, profileName?: string | null): User => {
  if (!value || typeof value !== 'object') return value;
  return {
    ...value,
    name: resolveDisplayName(profileName, value.name, value.email)
  };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  // Mirrors `user` synchronously so auth-dependent helpers (refreshSettings)
  // never act on a stale closure right after a sign-in/out.
  const userRef = useRef<User | null>(null);
  const applyUser = (next: User | null) => {
    userRef.current = next;
    setUser(next);
  };
  const [birthProfile, setBirthProfile] = useState<CustomerBirthProfile | null>(null);
  const [settings, setSettings] = useState<SystemSettings | null>(() => readCachedSettings());
  const [isLoading, setIsLoading] = useState(true);
  // A cached, accepted public design is available synchronously on reload. If
  // no such value exists, customer pages remain behind the boot splash until
  // the public settings request settles or the bounded fallback fires.
  const [settingsResolved, setSettingsResolved] = useState(() =>
    settings?.userDesign === 'original' || settings?.userDesign === 'ivory'
  );

  // Never let an unavailable settings API hold customer pages behind the splash indefinitely.
  useEffect(() => {
    if (settingsResolved) return;
    const fallback = window.setTimeout(() => setSettingsResolved(true), 4500);
    return () => window.clearTimeout(fallback);
  }, [settingsResolved]);

  const refreshSettings = async () => {
    const hasSession = Boolean(getAuthToken() || userRef.current);
    let publicSettingsLoaded = false;
    try {
      // Load redacted public settings before the authenticated/admin payload;
      // customer settings must not queue behind a slower admin request.
      const res = await api.getSettings();
      if (res.success && res.settings) {
        setSettings(prev => ({ ...prev, ...res.settings }));
        publicSettingsLoaded = true;
        // Only public (already redacted) settings are cached offline.
        try {
          localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(res.settings));
        } catch (e) {}
      }
      if (publicSettingsLoaded) setSettingsResolved(true);

      // Admin payloads contain SMTP/payment/social secrets. Keep them memory-only;
      // never cache them alongside the redacted public settings.
      if (hasSession) {
        try {
          const adminRes = await api.getAdminSettings();
          if (adminRes.success && adminRes.settings) {
            setSettings(adminRes.settings);
            localStorage.removeItem(SETTINGS_CACHE_KEY);
          }
        } catch (e) {}
      }
    } catch (e) {
      console.error('Failed to load settings', e);
    } finally {
      setSettingsResolved(true);
    }
  };

  const refreshProfile = async () => {
    try {
      const res = await api.getProfile();
      if (res.success) {
        setBirthProfile(normalizeBirthProfile(res.profile));
      }
    } catch (e) {
      console.error('Failed to refresh profile', e);
    }
  };

  const initAuth = async () => {
    setIsLoading(true);
    // Fetch public settings in parallel with auth/session lookup. On a first
    // visit the customer shell stays behind the splash until this design is
    // known; a valid cached design is already available on the initial render.
    const settingsRequest = refreshSettings();
    // H3: the session lives in an httpOnly cookie, not in localStorage, so a
    // reload must ask the server who it is instead of inspecting stored
    // tokens. GET /api/auth/me is anonymous-safe: 401 simply means "signed
    // out" and also purges any legacy stored token.
    try {
      const res = await api.getMe();
      if (res.success && res.user) {
        const profile = normalizeBirthProfile(res.birthProfile);
        applyUser(normalizeUser(res.user, profile?.name));
        setBirthProfile(profile);
      } else {
        clearAuthToken();
      }
    } catch (e) {
      clearAuthToken();
    }
    await settingsRequest;
    // A cookie-authenticated administrator is discovered only after /me. Fetch
    // the unredacted admin settings separately; admin startup stays dark.
    if (userRef.current?.role === 'admin') await refreshSettings();
    setIsLoading(false);
  };

  useEffect(() => {
    initAuth();
  }, []);

  const login = async (email: string, pass: string) => {
    const res = await api.login(email, pass);
    if (res.success && res.token && res.user) {
      const userObj = res.user;
      setAuthToken(res.token);
      const profile = normalizeBirthProfile(res.birthProfile);
      applyUser(normalizeUser(userObj, profile?.name));
      setBirthProfile(profile);
      await refreshSettings();
      return { success: true, message: res.message || 'Login successful', user: normalizeUser(userObj) };
    }
    // Propagate OTP-required status so the UI can offer to verify/resend
    // instead of just showing a generic "invalid credentials" error.
    return { success: false, message: res.message || 'Login failed', status: (res as any).status, email: (res as any).email };
  };

  const adminLogin = async (email: string, pass: string) => {
    const res = await api.adminLogin(email, pass);
    if (res.success && res.token && res.user && String(res.user.role).toLowerCase() === 'admin') {
      const adminUser = res.user;
      setAuthToken(res.token);
      applyUser(normalizeUser(adminUser));
      setBirthProfile(null);
      await refreshSettings();
      return { success: true, message: res.message || 'Admin authorization granted', user: normalizeUser(adminUser) };
    }
    return { success: false, message: res.message || 'Admin login failed' };
  };

  const register = async (data: any) => {
    const res: any = await api.register(data);
    if (res.success && res.status === 'otp_required') {
      // Registration created a pending account - do NOT log in yet. The
      // caller (RegisterPage) shows an OTP entry screen and only calls
      // verifyRegisterOtp() once the code is confirmed.
      return { success: true, status: 'otp_required', message: res.message, email: res.email || data.email };
    }
    if (res.success && res.token && res.user) {
      const userObj = res.user;
      setAuthToken(res.token);
      const profile = normalizeBirthProfile(res.birthProfile);
      applyUser(normalizeUser(userObj, profile?.name));
      setBirthProfile(profile);
      await refreshSettings();
      return { success: true, message: res.message || 'Registration successful', user: normalizeUser(userObj) };
    }
    return { success: false, message: res.message || 'Registration failed' };
  };

  const verifyRegisterOtp = async (email: string, otp: string, password: string) => {
    const res = await api.verifyRegisterOtp(email, otp, password);
    if (res.success && res.token && res.user) {
      const userObj = res.user;
      setAuthToken(res.token);
      const profile = normalizeBirthProfile(res.birthProfile);
      applyUser(normalizeUser(userObj, profile?.name));
      setBirthProfile(profile);
      await refreshSettings();
      return { success: true, message: res.message || 'Email verified', user: normalizeUser(userObj) };
    }
    return { success: false, message: res.message || 'Verification failed' };
  };

  const resendRegisterOtp = async (email: string) => {
    const res = await api.resendRegisterOtp(email);
    return { success: res.success, message: res.message };
  };

  const googleLogin = async (googleData: { id?: string; sub?: string; name?: string; email?: string; credential?: string; accessToken?: string }) => {
    const res = await api.googleLogin(googleData);
    if (res.success && res.user && res.token) {
      const userObj: User = res.user;
      setAuthToken(res.token);
      const profile = normalizeBirthProfile(res.birthProfile);
      applyUser(normalizeUser(userObj, profile?.name));
      setBirthProfile(profile);
      await refreshSettings();
      return { success: true, message: res.message || 'Google login successful', user: normalizeUser(userObj) };
    }
    return { success: false, message: res.message || 'Google login failed' };
  };

  const logout = () => {
    // H3: the session lives in an httpOnly cookie, so signing out must also
    // clear it server-side - otherwise the next page load's GET /me would
    // silently sign the user back in. Local state is dropped immediately.
    api.logout().catch(() => {});
    clearAuthToken();
    applyUser(null);
    setBirthProfile(null);
    // Drop admin-only secrets immediately, but retain the already-known public
    // design in memory so sign-out cannot flash the customer site to a default.
    try {
      localStorage.removeItem(SETTINGS_CACHE_KEY);
    } catch (e) {}
    setSettings(settings?.userDesign ? ({ userDesign: settings.userDesign } as SystemSettings) : null);
    refreshSettings();
  };

  const updateBirthProfile = async (profile: Partial<CustomerBirthProfile>) => {
    const res = await api.saveProfile(profile);
    if (res.success && res.profile) {
      setBirthProfile(normalizeBirthProfile(res.profile));
      return { success: true, message: res.message };
    }
    return { success: false, message: res.message || 'Failed to update profile' };
  };

  // The backend's persisted role is the only source of administrator status.
  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        birthProfile,
        settings,
        settingsResolved,
        isLoading,
        isAdmin,
        login,
        adminLogin,
        register,
        verifyRegisterOtp,
        resendRegisterOtp,
        googleLogin,
        logout,
        refreshProfile,
        refreshSettings,
        updateBirthProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
