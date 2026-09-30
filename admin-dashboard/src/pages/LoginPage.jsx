import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ChatBubbleLeftRightIcon,
  EnvelopeIcon,
  LockClosedIcon,
  EyeIcon,
  EyeSlashIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/solid';
import useAuthStore from '../store/authStore';
import {
  requestPasswordResetOtp,
  resetPasswordWithOtp,
} from '../services/api';

const FEATURES = [
  { title: 'Real-time AI Chat', desc: 'Instant answers powered by smart AI' },
  { title: 'Live Agent Support', desc: 'Seamless human handover when needed' },
  { title: 'Smart Analytics', desc: 'Track CSAT, wait time & resolution' },
];

const BUBBLES = [
  { text: 'Where is my order?', top: '12%', left: '10%', delay: '0s' },
  { text: 'What is the return policy?', top: '28%', left: '55%', delay: '0.8s' },
  { text: 'Agent connected ✓', top: '55%', left: '18%', delay: '1.4s' },
  { text: '⭐⭐⭐⭐⭐ Thanks!', top: '72%', left: '48%', delay: '2s' },
];

const REMEMBER_KEY = 'chat_admin_remember_email';

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetStep, setResetStep] = useState(1);
  const [resetEmail, setResetEmail] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_KEY);
    if (saved) {
      setEmail(saved);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter email and password');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await login(email.trim(), password);
      if (rememberMe) localStorage.setItem(REMEMBER_KEY, email.trim());
      else localStorage.removeItem(REMEMBER_KEY);
      toast.success('Logged in successfully');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (err.response?.status === 403) {
        setError(
          err.response?.data?.message ||
            'Account suspended. Contact a SUPER_ADMIN.'
        );
      } else if (err.response?.status === 401) {
        setError('Incorrect email or password. Please check and try again.');
      } else if (err.response?.status === 429) {
        setError(
          'Too many login attempts. Please wait 15 minutes and try again.'
        );
      } else if (err.response?.status === 500) {
        setError('Server error. Please try again later.');
      } else if (!err.response) {
        setError('Cannot connect to server. Check your internet connection.');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const openForgotFlow = () => {
    setForgotOpen(true);
    setResetStep(1);
    setResetEmail(email.trim());
    setResetOtp('');
    setResetPassword('');
    setResetConfirm('');
    setResetError('');
  };

  const closeForgotFlow = () => {
    setForgotOpen(false);
    setResetStep(1);
    setResetError('');
    setResetLoading(false);
  };

  const handleForgotNext = async (e) => {
    e.preventDefault();
    setResetError('');

    if (resetStep === 1) {
      const trimmed = resetEmail.trim();
      if (!trimmed) {
        setResetError('Enter your registered email');
        return;
      }
      setResetLoading(true);
      try {
        await requestPasswordResetOtp(trimmed);
        toast.success('Verification code sent (check server logs in dev)');
        setResetStep(2);
      } catch (err) {
        setResetError(
          err.response?.data?.message || 'Could not send verification code'
        );
      } finally {
        setResetLoading(false);
      }
      return;
    }

    if (resetStep === 2) {
      if (!/^\d{6}$/.test(String(resetOtp).trim())) {
        setResetError('Enter the 6-digit verification code');
        return;
      }
      setResetStep(3);
      return;
    }

    if (resetStep === 3) {
      if (!resetPassword || resetPassword.length < 8) {
        setResetError('Password must be at least 8 characters');
        return;
      }
      if (resetPassword !== resetConfirm) {
        setResetError('Passwords do not match');
        return;
      }
      setResetLoading(true);
      try {
        await resetPasswordWithOtp({
          email: resetEmail.trim(),
          otp: resetOtp.trim(),
          new_password: resetPassword,
          confirm_password: resetConfirm,
        });
        toast.success('Password updated — sign in with your new password');
        closeForgotFlow();
        setEmail(resetEmail.trim());
        setPassword('');
      } catch (err) {
        const msg = err.response?.data?.message || 'Password reset failed';
        if (/invalid otp|expired/i.test(msg)) {
          setResetError('Invalid OTP. Request a new code and try again.');
        } else if (err.response?.status === 403) {
          setResetError('Account suspended. Contact a SUPER_ADMIN.');
        } else {
          setResetError(msg);
        }
      } finally {
        setResetLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen flex bg-white overflow-hidden">
      {/* Left panel — 60% */}
      <div className="hidden lg:flex relative w-[60%] min-h-screen flex-col justify-between overflow-hidden bg-gradient-to-br from-[#0F172A] to-[#1E293B] text-white px-12 xl:px-16 py-12">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full bg-indigo-500/10 blur-3xl" />
          {BUBBLES.map((b) => (
            <div
              key={b.text}
              className="absolute max-w-[220px] rounded-bubble px-4 py-2.5 text-sm bg-white/10 border border-white/15 backdrop-blur-md shadow-soft animate-float"
              style={{
                top: b.top,
                left: b.left,
                animationDelay: b.delay,
              }}
            >
              {b.text}
            </div>
          ))}
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center">
              <ChatBubbleLeftRightIcon className="w-7 h-7 text-primary-200" />
            </div>
            <div>
              <p className="text-xl font-bold tracking-tight">EonlineBazar</p>
              <p className="text-xs text-slate-400">Chat Platform</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 max-w-lg">
          <h2 className="text-4xl xl:text-5xl font-bold leading-tight tracking-tight">
            Conversations that
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-primary-200 to-white">
              convert customers
            </span>
          </h2>
          <p className="mt-4 text-slate-300 text-base leading-relaxed">
            AI + human support in one premium inbox — built for Bangladesh
            commerce teams.
          </p>

          <ul className="mt-10 space-y-4">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-3">
                <CheckCircleIcon className="w-6 h-6 text-success shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-white">{f.title}</p>
                  <p className="text-sm text-slate-400">{f.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-xs text-slate-500">
          © {new Date().getFullYear()} EonlineBazar · Secure agent access
        </p>
      </div>

      {/* Right panel — 40% */}
      <div className="flex-1 lg:w-[40%] min-h-screen flex items-center justify-center px-4 sm:px-8 py-10 bg-gradient-to-b from-slate-50 to-white">
        <div className="w-full max-w-md glass-card rounded-card border border-white/60 p-8 sm:p-10 animate-fadeIn">
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary-600 flex items-center justify-center mb-4 shadow-lg shadow-primary/30">
              <ChatBubbleLeftRightIcon className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-text-primary text-center">
              EonlineBazar Chat Admin
            </h1>
            <p className="text-sm text-text-secondary mt-2 text-center leading-bn">
              Welcome! Sign in to your account
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label
                htmlFor="login-email"
                className="block text-sm font-medium text-text-primary mb-1.5"
              >
                Email
              </label>
              <div className="relative">
                <EnvelopeIcon className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-btn border border-slate-200 pl-11 pr-4 py-2.5 text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition duration-200"
                  placeholder="admin@eonlinebazar.com"
                  required
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-sm font-medium text-text-primary mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <LockClosedIcon className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-btn border border-slate-200 pl-11 pr-12 py-2.5 text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition duration-200"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeSlashIcon className="w-5 h-5" />
                  ) : (
                    <EyeIcon className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <label
                htmlFor="remember-me"
                className="inline-flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none"
              >
                <input
                  id="remember-me"
                  name="remember"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary/30"
                />
                Remember me
              </label>
              <button
                type="button"
                className="text-sm font-medium text-primary hover:text-primary-600 transition"
                onClick={openForgotFlow}
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-btn btn-gradient text-white font-semibold py-3 mt-2 flex items-center justify-center gap-2 shadow-soft"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Signing in…
                </>
              ) : (
                'Login'
              )}
            </button>

            {error ? (
              <div
                role="alert"
                className="mt-3 flex items-start gap-2 rounded-btn border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
              >
                <ExclamationCircleIcon className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            ) : null}
          </form>

          <p className="mt-8 text-center text-xs text-text-secondary">
            Powered by EonlineBazar AI
          </p>
        </div>
      </div>

      {forgotOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
          role="presentation"
          onClick={closeForgotFlow}
        >
          <div
            className="w-full max-w-md rounded-card border border-slate-200 bg-white shadow-layered p-6 animate-fadeIn"
            role="dialog"
            aria-modal="true"
            aria-labelledby="forgot-password-title"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2
              id="forgot-password-title"
              className="text-lg font-semibold text-text-primary"
            >
              Reset password
            </h2>
            <p className="text-sm text-text-secondary mt-1">
              Step {resetStep} of 3
            </p>

            <form onSubmit={handleForgotNext} className="mt-5 space-y-4">
              {resetStep === 1 ? (
                <div>
                  <label
                    htmlFor="reset-email"
                    className="block text-sm font-medium text-text-primary mb-1.5"
                  >
                    Registered email
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="w-full rounded-btn border border-slate-200 px-3 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="agent@eonlinebazar.com"
                    required
                  />
                </div>
              ) : null}

              {resetStep === 2 ? (
                <div>
                  <label
                    htmlFor="reset-otp"
                    className="block text-sm font-medium text-text-primary mb-1.5"
                  >
                    Verification code
                  </label>
                  <input
                    id="reset-otp"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={resetOtp}
                    onChange={(e) =>
                      setResetOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    className="w-full rounded-btn border border-slate-200 px-3 py-2.5 tracking-[0.35em] text-center font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="000000"
                    required
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Enter the 6-digit code sent to your email.
                  </p>
                </div>
              ) : null}

              {resetStep === 3 ? (
                <>
                  <div>
                    <label
                      htmlFor="reset-new-password"
                      className="block text-sm font-medium text-text-primary mb-1.5"
                    >
                      New password
                    </label>
                    <input
                      id="reset-new-password"
                      type="password"
                      autoComplete="new-password"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      className="w-full rounded-btn border border-slate-200 px-3 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      minLength={8}
                      required
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="reset-confirm-password"
                      className="block text-sm font-medium text-text-primary mb-1.5"
                    >
                      Confirm password
                    </label>
                    <input
                      id="reset-confirm-password"
                      type="password"
                      autoComplete="new-password"
                      value={resetConfirm}
                      onChange={(e) => setResetConfirm(e.target.value)}
                      className="w-full rounded-btn border border-slate-200 px-3 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      minLength={8}
                      required
                    />
                  </div>
                </>
              ) : null}

              {resetError ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-btn border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                >
                  <ExclamationCircleIcon className="w-5 h-5 shrink-0" />
                  <span>{resetError}</span>
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeForgotFlow}
                  className="rounded-btn px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                {resetStep > 1 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setResetError('');
                      setResetStep((s) => Math.max(1, s - 1));
                    }}
                    className="rounded-btn px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
                  >
                    Back
                  </button>
                ) : null}
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="rounded-btn btn-gradient text-white text-sm font-semibold px-4 py-2 disabled:opacity-60"
                >
                  {resetLoading
                    ? 'Please wait…'
                    : resetStep === 3
                      ? 'Update password'
                      : 'Continue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
