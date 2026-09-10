import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import api from '../services/api';

export default function ChatSettingsPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [botName, setBotName] = useState('');
  const [welcomeMsg, setWelcomeMsg] = useState('');
  const [quickReplies, setQuickReplies] = useState([]);
  const [avatarUploading, setAvatarUploading] = useState(false);

  useEffect(() => {
    api
      .get('/admin/settings/chat')
      .then((r) => {
        const s = r.data.settings;
        setSettings(s);
        setBotName(s.botName || 'Aria');
        setWelcomeMsg(s.welcomeMessage || '');
        setQuickReplies(s.quickReplies || []);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch('/admin/settings/chat', {
        botName,
        welcomeMessage: welcomeMsg,
        quickReplies,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const r = await api.post('/admin/settings/chat/bot-avatar', fd);
      setSettings((prev) => ({
        ...prev,
        botAvatar: r.data.url,
      }));
    } finally {
      setAvatarUploading(false);
    }
  };

  const toggleQR = (id) => {
    setQuickReplies((prev) =>
      prev.map((qr) =>
        qr.id === id ? { ...qr, isVisible: !qr.isVisible } : qr
      )
    );
  };

  const updateQRLabel = (id, label) => {
    setQuickReplies((prev) =>
      prev.map((qr) => (qr.id === id ? { ...qr, label } : qr))
    );
  };

  const addQR = () => {
    setQuickReplies((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        label: 'New Option',
        value: 'new_option',
        isVisible: true,
        order: prev.length,
      },
    ]);
  };

  const removeQR = (id) => {
    setQuickReplies((prev) => prev.filter((qr) => qr.id !== id));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard"
            className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition"
          >
            <ArrowLeftIcon className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          </Link>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">
            Chat Settings
          </h1>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
          <h2 className="font-semibold text-sm text-slate-700 dark:text-slate-300">
            AI Bot Profile
          </h2>

          <div className="flex items-center gap-4">
            <div className="relative">
              {settings?.botAvatar ? (
                <img
                  src={settings.botAvatar}
                  alt="Bot avatar"
                  className="w-16 h-16 rounded-full object-cover ring-2 ring-orange-400"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-2xl">
                  🤖
                </div>
              )}
            </div>
            <div>
              <label className="cursor-pointer px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors">
                {avatarUploading ? 'Uploading...' : 'Change Photo'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
              </label>
              <p className="text-xs text-slate-400 mt-1">
                JPG, PNG, WebP — max 5MB
              </p>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">
              Bot Name
            </label>
            <input
              value={botName}
              onChange={(e) => setBotName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white text-sm outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">
              Welcome Message
            </label>
            <textarea
              value={welcomeMsg}
              onChange={(e) => setWelcomeMsg(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white text-sm outline-none resize-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm text-slate-700 dark:text-slate-300">
              Quick Reply Options
            </h2>
            <button
              type="button"
              onClick={addQR}
              className="text-xs px-3 py-1.5 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 font-medium transition-colors"
            >
              + Add Option
            </button>
          </div>

          {quickReplies.map((qr) => (
            <div
              key={qr.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            >
              <button
                type="button"
                onClick={() => toggleQR(qr.id)}
                className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ${
                  qr.isVisible ? 'bg-orange-500' : 'bg-slate-300 dark:bg-slate-600'
                }`}
              >
                <span
                  className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-1 ${
                    qr.isVisible ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>

              <input
                value={qr.label}
                onChange={(e) => updateQRLabel(qr.id, e.target.value)}
                className="flex-1 bg-transparent text-sm text-slate-800 dark:text-white outline-none border-b border-slate-300 dark:border-slate-600 focus:border-orange-400 py-0.5"
              />

              <button
                type="button"
                onClick={() => removeQR(qr.id)}
                className="text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-medium transition-colors text-sm"
        >
          {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
