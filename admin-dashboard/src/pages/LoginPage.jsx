import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/solid';

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('admin@yourshop.com');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error('ইমেইল ও পাসওয়ার্ড দিন');
      return;
    }

    setLoading(true);
    try {
      await login(email.trim(), password);
      toast.success('সফলভাবে লগইন হয়েছে');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const msg =
        err.response?.data?.message || err.message || 'লগইন ব্যর্থ হয়েছে';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-[#4A3FBF] via-[#6C63FF] to-[#8B7CFF]">
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl p-8 transition-shadow">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
            <ChatBubbleLeftRightIcon className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Chat Admin</h1>
          <p className="text-sm text-slate-500 mt-1">এজেন্ট ড্যাশবোর্ডে প্রবেশ করুন</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
              ইমেইল
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
              placeholder="admin@yourshop.com"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
              পাসওয়ার্ড
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-primary hover:bg-primary-600 disabled:opacity-60 text-white font-semibold py-2.5 transition shadow-sm"
          >
            {loading ? 'লগইন হচ্ছে…' : 'লগইন'}
          </button>
        </form>
      </div>
    </div>
  );
}
