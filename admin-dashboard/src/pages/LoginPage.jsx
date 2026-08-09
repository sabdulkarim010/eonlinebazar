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
      const serverMessage = err.response?.data?.message;
      if (err.response?.status === 401) {
        setError(
          serverMessage || 'Incorrect email or password. Please try again.'
        );
      } else if (err.response?.status === 429) {
        setError(
          serverMessage || 'Too many attempts. Please wait 15 minutes.'
        );
      } else if (err.response?.status === 404) {
        setError(
          serverMessage || 'Account not found. Check your email address.'
        );
      } else {
        setError(serverMessage || 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
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
                onClick={() =>
                  toast('Password reset coming soon', { icon: '🔐' })
                }
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
    </div>
  );
}
