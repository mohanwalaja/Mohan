import React, { useState } from 'react';
import { Shield, Lock, KeyRound, AlertCircle, ArrowRight, ShieldCheck, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { BrandLockup } from '../common/BrandLockup';
import { RouteLink } from '../common/RouteLink';

interface AdminLoginProps {
  onNavigate: (route: string) => void;
  onLoginSuccess?: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onNavigate, onLoginSuccess }) => {
  const { user, adminLogin } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    try {
      const res = await adminLogin(email.trim().toLowerCase(), password);
      if (res.success) {
        if (onLoginSuccess) {
          onLoginSuccess();
        }
      } else {
        setErrorMessage(res.message || 'Invalid administrative credentials');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication error. Please verify administrative credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6 select-none">
      <div className="w-full max-w-md space-y-6">

        {/* Gateway Badge & Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-500/20 border border-purple-300 dark:border-purple-500/30 text-purple-800 dark:text-purple-300 text-xs font-bold tracking-wide uppercase">
            <ShieldCheck className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            <span>Restricted Gateway</span>
          </div>

          <BrandLockup emblemClassName="w-24 h-24 shadow-2xl" />

          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Admin Portal
            </h1>
            <p className="text-xs text-amber-600 dark:text-amber-400 font-bold uppercase tracking-widest mt-0.5">
              ASTRO SIVAM Control Center
            </p>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-xs mx-auto">
            Authorized ASTRO SIVAM administrative personnel, astrologers, and order verification management.
          </p>
        </div>

        {/* Admin Login Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-slate-900 dark:text-white relative overflow-hidden">

          {/* Subtle Top Accent Glow */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-amber-500 to-purple-600" />

          {user && user.role !== 'admin' && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 rounded-xl text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
              Signed in as customer <strong>{user.email}</strong>. Enter provisioned administrator credentials below to switch into the Admin Control Center.
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 rounded-xl text-xs flex items-start gap-2.5 animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold block">
                  {(errorMessage || '').toLowerCase().includes('denied') || (errorMessage || '').toLowerCase().includes('restricted')
                    ? 'Access Restricted'
                    : 'Sign In Notice'}
                </span>
                <span className="text-[11px] text-rose-700 dark:text-rose-300 leading-relaxed">{errorMessage}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="admin-login-email" className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                <span>Administrator Email</span>
                <span className="text-[10px] text-slate-500 font-normal">Registered Admin ID</span>
              </label>
              <div className="relative">
                <Shield className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                <input
                  id="admin-login-email"
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@astrosivam.com"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent font-medium"
                />
              </div>
            </div>

            <div>
              <label htmlFor="admin-login-password" className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                <span>Master Security Password</span>
                <span className="text-[10px] text-slate-500 font-normal">Encrypted</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                <input
                  id="admin-login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50 cursor-pointer"
            >
              <KeyRound className="w-4 h-4 text-slate-950" />
              <span>{isLoading ? 'Verifying Credentials...' : 'Authorize & Enter Portal'}</span>
              {!isLoading && <ArrowRight className="w-4 h-4 text-slate-950" />}
            </button>
          </form>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <RouteLink
              route="home"
              onNavigate={onNavigate}
              className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white font-semibold transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Website</span>
            </RouteLink>
            <span className="text-[11px] text-slate-400">Role-verified session</span>
          </div>

        </div>
      </div>
    </div>
  );
};
