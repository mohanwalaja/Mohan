import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { GoogleLoginButton } from './GoogleLoginButton';
import {
  X,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  ArrowLeft
} from 'lucide-react';
import { PersonNameField } from './PersonNameField';
import { normalizePersonName } from '../../utils/birthDetails';
import { ForgotPasswordForm } from './ForgotPasswordForm';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: () => void;
  title?: string;
  description?: string;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthenticated,
  title = 'Sign In to Complete Your Order',
  description = 'Sign in with your Google or Email account to preserve your birth chart, generate your certified report, and track your orders.'
}) => {
  const { login, register, verifyRegisterOtp, resendRegisterOtp } = useAuth();
  const [tab, setTab] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpPendingEmail, setOtpPendingEmail] = useState('');
  const [resendingOtp, setResendingOtp] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [view, setView] = useState<'auth' | 'forgot' | 'otp'>('auth');
  const [notice, setNotice] = useState('');

  if (!isOpen) return null;

  if (view === 'forgot') {
    return (
      <div role="dialog" aria-modal="true" aria-label="Forgot password" className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl">
          <ForgotPasswordForm
            initialEmail={email}
            onBackToSignIn={msg => {
              setView('auth');
              setError('');
              setNotice(msg || '');
            }}
          />
        </div>
      </div>
    );
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = otpCode.replace(/\D/g, '').slice(0, 6);
    if (cleaned.length !== 6) {
      setError('Please enter the 6-digit verification code from your inbox.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      const targetEmail = otpPendingEmail || email.trim().toLowerCase();
      const res = await verifyRegisterOtp(targetEmail, cleaned, password);
      if (res.success) {
        onClose();
        onAuthenticated();
      } else {
        setError(res.message || 'Verification failed. Check your code or request a fresh one.');
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendOtp = async () => {
    const targetEmail = otpPendingEmail || email.trim().toLowerCase();
    if (!targetEmail) return;
    setError('');
    setResendingOtp(true);
    try {
      const res = await resendRegisterOtp(targetEmail);
      if (res.success) {
        setNotice(res.message || `A fresh 6-digit code was sent to ${targetEmail}.`);
      } else {
        setError(res.message || 'Could not resend verification code.');
      }
    } catch (err: any) {
      setError(err.message || 'Could not resend verification code.');
    } finally {
      setResendingOtp(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setIsSubmitting(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (tab === 'signin') {
        const res = await login(normalizedEmail, password);
        if (res.success) {
          onClose();
          onAuthenticated();
        } else if (res.status === 'otp_required') {
          setOtpPendingEmail(res.email || normalizedEmail);
          setOtpCode('');
          setNotice(res.message || `Enter the 6-digit verification code sent to ${normalizedEmail}.`);
          setView('otp');
        } else {
          setError(res.message || 'Login failed. Please check your credentials.');
        }
      } else {
        const normalizedName = normalizePersonName(name);
        const normalizedMobile = mobile.trim();
        if (!normalizedName || !normalizedEmail || !normalizedMobile || !password) {
          setError('Please fill in your full name, email, mobile number, and password.');
          return;
        }
        if (password.length < 10) {
          setError('Password must be at least 10 characters.');
          return;
        }
        const res = await register({
          name: normalizedName,
          email: normalizedEmail,
          password,
          mobile: normalizedMobile,
          country: 'India'
        });
        if (res.status === 'otp_required') {
          setOtpPendingEmail(res.email || normalizedEmail);
          setOtpCode('');
          setNotice(res.message || `We sent a 6-digit verification code to ${normalizedEmail}.`);
          setView('otp');
        } else if (res.success) {
          onClose();
          onAuthenticated();
        } else {
          setError(res.message || 'Registration failed.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Sign in to continue your order" className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 my-auto">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[11px] font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{view === 'otp' ? 'Email Verification' : 'User Authentication'}</span>
            </div>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
              {view === 'otp' ? 'Enter Your 6-Digit Code' : title}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {view === 'otp'
                ? `Enter the 6-digit verification code sent to ${otpPendingEmail || email} to complete your order immediately.`
                : description}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Notice */}
        {notice && !error && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed">
            {notice}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {view === 'otp' ? (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label htmlFor="auth-modal-otp" className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                6-Digit Verification Code *
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="auth-modal-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono tracking-[0.35em] text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-black rounded-xl shadow-md shadow-amber-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Verifying...' : 'Verify Email & Continue Order'}
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-between text-xs pt-1">
              <button
                type="button"
                onClick={() => {
                  setView('auth');
                  setError('');
                  setNotice('');
                }}
                className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 dark:hover:text-white font-semibold"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
              <button
                type="button"
                disabled={resendingOtp}
                onClick={handleResendOtp}
                className="inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400 hover:underline disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${resendingOtp ? 'animate-spin' : ''}`} />
                <span>{resendingOtp ? 'Sending...' : 'Resend Code'}</span>
              </button>
            </div>
          </form>
        ) : (
          <>
            {/* 1-Click Google Sign In */}
            <div className="space-y-2.5">
              <GoogleLoginButton
                mode={tab === 'signin' ? 'signin' : 'register'}
                onSuccess={() => {
                  onClose();
                  onAuthenticated();
                }}
                onError={err => setError(err)}
              />
            </div>

            {/* Divider */}
            <div className="relative flex items-center justify-center">
              <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
              <span className="bg-white dark:bg-slate-900 px-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider absolute">
                Or with email
              </span>
            </div>

            {/* Tab Toggle */}
            <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => { setTab('signin'); setError(''); }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  tab === 'signin'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setTab('register'); setError(''); }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  tab === 'register'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                New Account
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleEmailAuth} className="space-y-3.5">
              {tab === 'register' && (
                <>
                  <PersonNameField
                    id="auth-register-name"
                    label="Full name"
                    value={name}
                    onChange={setName}
                    placeholder="e.g. Ramesh Kumar"
                    size="sm"
                  />
                  <div>
                    <label htmlFor="auth-register-mobile" className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Mobile Number *
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="auth-register-mobile"
                        type="tel"
                        required
                        autoComplete="tel"
                        value={mobile}
                        onChange={e => setMobile(e.target.value)}
                        placeholder="+91 98765 43210"
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Email Address *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="e.g. yourname@gmail.com"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Password *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={tab === 'register' ? 'Minimum 10 characters' : 'Enter password'}
                    className="w-full pl-9 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {tab === 'signin' && (
                <div className="flex justify-end -mt-1">
                  <button
                    type="button"
                    onClick={() => { setError(''); setNotice(''); setView('forgot'); }}
                    className="text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-black rounded-xl shadow-md shadow-amber-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Authenticating...' : tab === 'signin' ? 'Sign In & Continue Order' : 'Create Account & Continue'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </>
        )}

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>256-bit SSL Protected. Your data is strictly private.</span>
        </div>
      </div>
    </div>
  );
};
