import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { XMarkIcon } from '@heroicons/react/24/outline';
import useChatStore from '../store/chatStore';

const PRESET_TAGS = [
  { id: 'refund', label: 'refund', color: 'bg-rose-100 text-rose-700 border-rose-200' },
  { id: 'defective', label: 'defective', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { id: 'shipping', label: 'shipping', color: 'bg-sky-100 text-sky-700 border-sky-200' },
  { id: 'payment', label: 'payment', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { id: 'complaint', label: 'complaint', color: 'bg-violet-100 text-violet-700 border-violet-200' },
];

export const TAG_COLORS = {
  refund: 'bg-rose-500/15 text-rose-600 border-rose-300/40',
  defective: 'bg-amber-500/15 text-amber-700 border-amber-300/40',
  shipping: 'bg-sky-500/15 text-sky-700 border-sky-300/40',
  payment: 'bg-emerald-500/15 text-emerald-700 border-emerald-300/40',
  complaint: 'bg-violet-500/15 text-violet-700 border-violet-300/40',
};

export function tagChipClass(tag) {
  return (
    TAG_COLORS[String(tag).toLowerCase()] ||
    'bg-primary/10 text-primary border-primary/20'
  );
}

export default function TagModal({ roomId, open, onClose, existing = [] }) {
  const persistTag = useChatStore((s) => s.persistTag);
  const [custom, setCustom] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    setCustom('');
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const addTag = async (tag) => {
    const value = String(tag || '').trim().toLowerCase();
    if (!value || !roomId) return;
    if (existing.map((t) => String(t).toLowerCase()).includes(value)) {
      toast('Tag already exists', { icon: '🏷️' });
      return;
    }
    setSaving(true);
    try {
      await persistTag(roomId, value);
      toast.success(`Tag added: ${value}`);
      setCustom('');
      onClose?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save tag');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-card bg-white dark:bg-slate-900 shadow-layered border border-slate-200 dark:border-slate-700 animate-fadeIn"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tag-title"
      >
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3
            id="tag-title"
            className="text-base font-semibold text-text-primary dark:text-white"
          >
            Tag chat
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-btn hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {PRESET_TAGS.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={saving}
                onClick={() => addTag(t.id)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition duration-200 hover:scale-[1.03] ${t.color}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div>
            <label
              htmlFor="custom-tag-input"
              className="block text-xs font-medium text-text-secondary mb-1.5"
            >
              Custom tag
            </label>
            <div className="flex gap-2">
              <input
                id="custom-tag-input"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag(custom);
                  }
                }}
                placeholder="e.g. urgent"
                className="flex-1 rounded-btn border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 dark:bg-slate-800 dark:text-white transition"
              />
              <button
                type="button"
                disabled={saving || !custom.trim()}
                onClick={() => addTag(custom)}
                className="rounded-btn btn-gradient px-3 text-sm font-semibold text-white disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
