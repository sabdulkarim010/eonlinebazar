import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeftIcon,
  CameraIcon,
  EyeIcon,
  EyeSlashIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import AgentAvatar from '../components/AgentAvatar';
import useAuthStore from '../store/authStore';
import {
  changePassword,
  fetchProfile,
  updateProfile,
  uploadAgentAvatar,
} from '../services/api';
import { toBanglaDigits } from '../utils/helpers';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ProfilePage() {
  const agent = useAuthStore((s) => s.agent);
  const setAgent = useAuthStore((s) => s.setAgent);

  const [name, setName] = useState(agent?.name || '');
  const [email, setEmail] = useState(agent?.email || '');
  const [avatar, setAvatar] = useState(agent?.avatar || '');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [stats, setStats] = useState({
    total_chats_handled: 0,
    avg_rating: null,
    avg_response_time_seconds: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (agent?.avatar || agent?.image) {
      setAvatar(agent.avatar || agent.image);
    }
  }, [agent?.avatar, agent?.image]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchProfile();
        if (cancelled) return;
        const a = data.agent;
        if (a) {
          const avatarFromApi = a.avatar || a.image || '';
          setName(a.name || '');
          setEmail(a.email || '');
          setAvatar(avatarFromApi);
          setAgent({ ...a, avatar: avatarFromApi || null });
          setStats({
            total_chats_handled: a.total_chats_handled || 0,
            avg_rating: a.avg_rating,
            avg_response_time_seconds: a.avg_response_time_seconds || 0,
          });
        }
      } catch (err) {
        toast.error(err.response?.data?.message || 'Failed to load profile');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setAgent]);

  const handleAvatarFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file (JPEG, PNG, WebP, GIF)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be 5MB or smaller');
      return;
    }

    setUploadingAvatar(true);
    try {
      const data = await uploadAgentAvatar(file);
      const nextAvatar = data.url || data.agent?.avatar || '';
      setAvatar(nextAvatar);
      if (data.agent) {
        setAgent({ ...useAuthStore.getState().agent, ...data.agent, avatar: nextAvatar });
      } else if (nextAvatar) {
        setAgent({ ...useAuthStore.getState().agent, avatar: nextAvatar });
      }
      toast.success('Profile photo updated');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Photo upload failed');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const removeAvatar = async () => {
    setSaving(true);
    try {
      const data = await updateProfile({ clear_avatar: true });
      setAvatar('');
      if (data.agent) setAgent(data.agent);
      toast.success('Profile photo removed');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove photo');
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async (e) => {
    e.preventDefault();

    const trimmedEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmedEmail)) {
      toast.error('Enter a valid email address');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        email: trimmedEmail,
      };
      if (avatarUrl.trim()) {
        payload.avatar = avatarUrl.trim();
      }

      const data = await updateProfile(payload);
      if (data.agent) {
        setAgent(data.agent);
        setAvatar(data.agent.avatar || '');
        setEmail(data.agent.email || trimmedEmail);
      }
      setAvatarUrl('');
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (currentPassword === newPassword) {
      toast.error('New password must differ from current password');
      return;
    }

    setChangingPw(true);
    try {
      await changePassword(currentPassword, newPassword, confirmPassword);
      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to change password');
    } finally {
      setChangingPw(false);
    }
  };

  const avgMins =
    stats.avg_response_time_seconds > 0
      ? (stats.avg_response_time_seconds / 60).toFixed(1)
      : null;

  const roleLabel =
    agent?.role === 'SUPER_ADMIN'
      ? 'Super Admin'
      : agent?.role === 'ADMIN'
        ? 'Admin'
        : 'Agent';

  return (
    <div className="min-h-screen bg-page dark:bg-[#0b1220]">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-primary transition mb-6"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to dashboard
        </Link>

        <div className="flex items-center justify-between gap-3 mb-6">
          <h1 className="text-2xl font-bold text-text-primary dark:text-white">
            Profile &amp; Security
          </h1>
          <Link
            to="/settings"
            className="text-sm font-medium text-primary hover:underline"
          >
            Chat settings →
          </Link>
        </div>

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
              <h2 className="font-semibold text-text-primary dark:text-white">
                Account details
              </h2>

              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="flex flex-col items-start gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={handleAvatarFile}
                  />
                  <button
                    type="button"
                    disabled={uploadingAvatar || saving}
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Change profile photo"
                    className="relative w-20 h-20 rounded-full shrink-0 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60"
                  >
                    <AgentAvatar
                      name={name}
                      avatar={avatar}
                      size="xl"
                      className="w-20 h-20 ring-2 ring-slate-100 dark:ring-slate-700 group-hover:ring-primary/40 transition"
                    />
                    {uploadingAvatar && (
                      <div className="absolute inset-0 rounded-full bg-black/45 flex items-center justify-center">
                        <span className="text-white text-xs font-medium">…</span>
                      </div>
                    )}
                    <span className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full bg-primary text-white border-2 border-white dark:border-slate-900 shadow-md flex items-center justify-center group-hover:bg-primary/90 transition">
                      <CameraIcon className="w-3.5 h-3.5" />
                    </span>
                  </button>
                  {avatar && (
                    <button
                      type="button"
                      disabled={uploadingAvatar || saving}
                      onClick={removeAvatar}
                      className="inline-flex items-center gap-1 text-xs text-danger hover:underline disabled:opacity-50"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                      Remove photo
                    </button>
                  )}
                </div>
              </div>

              <p className="text-xs text-text-secondary leading-bn">
                JPG, PNG, WebP or GIF — max 5MB. Stored securely on Cloudinary.
              </p>

              <div>
                <label
                  htmlFor="profile-name"
                  className="block text-sm font-medium text-text-primary dark:text-white mb-1.5"
                >
                  Display name
                </label>
                <input
                  id="profile-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-btn border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 dark:bg-slate-800 dark:text-white transition"
                  required
                  minLength={2}
                />
              </div>

              <div>
                <label
                  htmlFor="profile-email"
                  className="block text-sm font-medium text-text-primary dark:text-white mb-1.5"
                >
                  Email address
                </label>
                <input
                  id="profile-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="w-full rounded-btn border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 dark:bg-slate-800 dark:text-white transition"
                  required
                />
                <p className="text-xs text-text-secondary mt-1">
                  Used to sign in to the chat admin dashboard.
                </p>
              </div>

              <details className="rounded-btn border border-slate-100 dark:border-slate-800 px-3 py-2">
                <summary className="text-sm font-medium text-text-secondary cursor-pointer select-none">
                  Advanced — paste avatar URL
                </summary>
                <div className="mt-3">
                  <input
                    id="profile-avatar-url"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://…"
                    className="w-full rounded-btn border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 dark:bg-slate-800 dark:text-white transition"
                  />
                </div>
              </details>

              <div className="flex items-center gap-2 text-xs text-text-secondary">
                <span className="font-medium">{roleLabel}</span>
                <span>·</span>
                <span>{agent?.email}</span>
              </div>

              <button
                type="submit"
                disabled={saving || uploadingAvatar}
                className="rounded-btn btn-gradient text-white font-semibold px-5 py-2.5 text-sm disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save account details'}
              </button>
            </form>

            <form
              onSubmit={savePassword}
              className="rounded-card bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-soft p-5 space-y-4"
            >
              <h2 className="font-semibold text-text-primary dark:text-white">
                Change password
              </h2>
              <p className="text-xs text-text-secondary leading-bn">
                Use at least 8 characters. You will stay signed in after updating.
              </p>

              <div>
                <label
                  htmlFor="current-password"
                  className="block text-sm font-medium mb-1.5 dark:text-white"
                >
                  Current password
                </label>
                <div className="relative">
                  <input
                    id="current-password"
                    type={showCurrentPw ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                    className="w-full rounded-btn border border-slate-200 dark:border-slate-700 px-3 py-2.5 pr-10 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 dark:bg-slate-800 dark:text-white transition"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    aria-label="Toggle current password visibility"
                  >
                    {showCurrentPw ? (
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
                  New password
                </label>
                <div className="relative">
                  <input
                    id="new-password"
                    type={showNewPw ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    className="w-full rounded-btn border border-slate-200 dark:border-slate-700 px-3 py-2.5 pr-10 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 dark:bg-slate-800 dark:text-white transition"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    aria-label="Toggle new password visibility"
                  >
                    {showNewPw ? (
                      <EyeSlashIcon className="w-5 h-5" />
                    ) : (
                      <EyeIcon className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="confirm-password"
                  className="block text-sm font-medium mb-1.5 dark:text-white"
                >
                  Confirm new password
                </label>
                <input
                  id="confirm-password"
                  type={showNewPw ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
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
                {changingPw ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
