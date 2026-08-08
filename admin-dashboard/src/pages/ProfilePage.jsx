import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeftIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline';
import useAuthStore from '../store/authStore';
import {
  changePassword,
  fetchProfile,
  updateProfile,
} from '../services/api';
import {
  avatarColor,
  getInitials,
  toBanglaDigits,
} from '../utils/helpers';

export default function ProfilePage() {
  const agent = useAuthStore((s) => s.agent);
  const setAgent = useAuthStore((s) => s.setAgent);

  const [name, setName] = useState(agent?.name || '');
  const [avatar, setAvatar] = useState(agent?.avatar || '');
  const [stats, setStats] = useState({
    total_chats_handled: 0,
    avg_rating: null,
    avg_response_time_seconds: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchProfile();
        if (cancelled) return;
        const a = data.agent;
        if (a) {
          setName(a.name || '');
          setAvatar(a.avatar || '');
          setAgent(a);
          setStats({
            total_chats_handled: a.total_chats_handled || 0,
            avg_rating: a.avg_rating,
            avg_response_time_seconds: a.avg_response_time_seconds || 0,
          });
        }
      } catch (err) {
        toast.error(err.response?.data?.message || 'প্রোফাইল লোড ব্যর্থ');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setAgent]);

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = await updateProfile({
        name: name.trim(),
        avatar: avatar.trim() || null,
      });
      if (data.agent) setAgent(data.agent);
      toast.success('প্রোফাইল আপডেট হয়েছে');
    } catch (err) {
      toast.error(err.response?.data?.message || 'সেভ ব্যর্থ');
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('নতুন পাসওয়ার্ড মিলছে না');
      return;
    }
    setChangingPw(true);
    try {
      await changePassword(currentPassword, newPassword);
      toast.success('পাসওয়ার্ড পরিবর্তন হয়েছে');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'পাসওয়ার্ড পরিবর্তন ব্যর্থ');
    } finally {
      setChangingPw(false);
    }
  };

  const avgMins =
    stats.avg_response_time_seconds > 0
      ? (stats.avg_response_time_seconds / 60).toFixed(1)
      : null;

  return (
    <div className="min-h-screen bg-page dark:bg-[#0b1220]">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-primary transition mb-6"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          ড্যাশবোর্ডে ফিরে যান
        </Link>

        <h1 className="text-2xl font-bold text-text-primary dark:text-white mb-6">
          Agent Profile
        </h1>

        {loading ? (
          <div className="space-y-3">
            <div className="skeleton h-28" />
            <div className="skeleton h-40" />
            <div className="skeleton h-40" />
          </div>
        ) : (
          <div className="space-y-5 animate-fadeIn">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-card bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-soft p-4 text-center">
                <p className="text-2xl font-bold text-primary tabular-nums">
                  {toBanglaDigits(stats.total_chats_handled)}
                </p>
                <p className="text-xs text-text-secondary mt-1 leading-bn">
                  Total handled
                </p>
              </div>
              <div className="rounded-card bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-soft p-4 text-center">
                <p className="text-2xl font-bold text-amber-500 tabular-nums">
                  {stats.avg_rating != null
                    ? toBanglaDigits(Number(stats.avg_rating).toFixed(1))
                    : '—'}
                </p>
                <p className="text-xs text-text-secondary mt-1 leading-bn">
                  Avg rating
                </p>
              </div>
              <div className="rounded-card bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-soft p-4 text-center">
                <p className="text-2xl font-bold text-success tabular-nums">
                  {avgMins != null ? `${toBanglaDigits(avgMins)}m` : '—'}
                </p>
                <p className="text-xs text-text-secondary mt-1 leading-bn">
                  Avg response
                </p>
              </div>
            </div>

            <form
              onSubmit={saveProfile}
              className="rounded-card bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-soft p-5 space-y-4"
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-16 h-16 rounded-full ${avatarColor(
                    name || 'A'
                  )} flex items-center justify-center text-white text-xl font-bold overflow-hidden`}
                >
                  {avatar ? (
                    <img
                      src={avatar}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    getInitials(name || 'A')
                  )}
                </div>
                <div>
                  <p className="font-semibold text-text-primary dark:text-white">
                    {agent?.email}
                  </p>
                  <p className="text-xs text-text-secondary">{agent?.role}</p>
                </div>
              </div>

              <div>
                <label
                  htmlFor="profile-name"
                  className="block text-sm font-medium text-text-primary dark:text-white mb-1.5"
                >
                  নাম
                </label>
                <input
                  id="profile-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-btn border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 dark:bg-slate-800 dark:text-white transition"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="profile-avatar"
                  className="block text-sm font-medium text-text-primary dark:text-white mb-1.5"
                >
                  Avatar URL
                </label>
                <input
                  id="profile-avatar"
                  value={avatar}
                  onChange={(e) => setAvatar(e.target.value)}
                  placeholder="https://…"
                  className="w-full rounded-btn border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 dark:bg-slate-800 dark:text-white transition"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="rounded-btn btn-gradient text-white font-semibold px-5 py-2.5 text-sm disabled:opacity-50"
              >
                {saving ? 'সেভ হচ্ছে…' : 'প্রোফাইল সেভ'}
              </button>
            </form>

            <form
              onSubmit={savePassword}
              className="rounded-card bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-soft p-5 space-y-4"
            >
              <h2 className="font-semibold text-text-primary dark:text-white">
                পাসওয়ার্ড পরিবর্তন
              </h2>

              <div>
                <label
                  htmlFor="current-password"
                  className="block text-sm font-medium mb-1.5 dark:text-white"
                >
                  বর্তমান পাসওয়ার্ড
                </label>
                <div className="relative">
                  <input
                    id="current-password"
                    type={showPw ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full rounded-btn border border-slate-200 dark:border-slate-700 px-3 py-2.5 pr-10 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 dark:bg-slate-800 dark:text-white transition"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  >
                    {showPw ? (
                      <EyeSlashIcon className="w-5 h-5" />
                    ) : (
                      <EyeIcon className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="new-password"
                  className="block text-sm font-medium mb-1.5 dark:text-white"
                >
                  নতুন পাসওয়ার্ড
                </label>
                <input
                  id="new-password"
                  type={showPw ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-btn border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 dark:bg-slate-800 dark:text-white transition"
                  required
                  minLength={8}
                />
              </div>

              <div>
                <label
                  htmlFor="confirm-password"
                  className="block text-sm font-medium mb-1.5 dark:text-white"
                >
                  কনফার্ম পাসওয়ার্ড
                </label>
                <input
                  id="confirm-password"
                  type={showPw ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-btn border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 dark:bg-slate-800 dark:text-white transition"
                  required
                  minLength={8}
                />
              </div>

              <button
                type="submit"
                disabled={changingPw}
                className="rounded-btn bg-slate-800 hover:bg-slate-900 text-white font-semibold px-5 py-2.5 text-sm disabled:opacity-50 transition"
              >
                {changingPw ? 'আপডেট হচ্ছে…' : 'পাসওয়ার্ড আপডেট'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
