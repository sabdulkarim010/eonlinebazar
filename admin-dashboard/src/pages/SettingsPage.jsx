import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeftIcon,
  Bars3Icon,
  EyeIcon,
  EyeSlashIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import useAuthStore from '../store/authStore';
import {
  avatarColor,
  getInitials,
  highlightMatch,
  relativeTimeBnShort,
} from '../utils/helpers';
import {
  fetchConfig,
  updateConfig,
  fetchKnowledge,
  createKnowledge,
  updateKnowledge,
  deleteKnowledge,
  checkKnowledgeEmpty,
  seedKnowledgeDefaults,
  fetchAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  resetAgentPassword,
} from '../services/api';

const TABS = [
  { id: 'store', label: '🏪 Store & AI Config' },
  { id: 'knowledge', label: '📚 Knowledge Base' },
  { id: 'staff', label: '👥 Staff Accounts' },
];

const CATEGORY_META = [
  { value: 'SHIPPING', icon: '🚚', label: '🚚 SHIPPING — Delivery & shipping', color: 'bg-sky-100 text-sky-700' },
  { value: 'RETURN', icon: '🔄', label: '🔄 RETURN — Returns & exchange', color: 'bg-amber-100 text-amber-700' },
  { value: 'PAYMENT', icon: '💳', label: '💳 PAYMENT — Payment methods', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'ORDER', icon: '📦', label: '📦 ORDER — Order tracking', color: 'bg-violet-100 text-violet-700' },
  { value: 'PRODUCT', icon: '👕', label: '👕 PRODUCT — About products', color: 'bg-pink-100 text-pink-700' },
  { value: 'SIZE_GUIDE', icon: '📏', label: '📏 SIZE_GUIDE — Size guide', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'CONTACT', icon: '📞', label: '📞 CONTACT — Contact', color: 'bg-cyan-100 text-cyan-700' },
  { value: 'GENERAL', icon: '❓', label: '❓ GENERAL — General questions', color: 'bg-slate-100 text-slate-700' },
];

const TAG_CHIP_COLORS = [
  'bg-rose-100 text-rose-700 border-rose-200',
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-emerald-100 text-emerald-700 border-emerald-200',
  'bg-sky-100 text-sky-700 border-sky-200',
  'bg-violet-100 text-violet-700 border-violet-200',
  'bg-pink-100 text-pink-700 border-pink-200',
  'bg-cyan-100 text-cyan-700 border-cyan-200',
];

const ROLE_OPTIONS = [
  {
    value: 'SUPER_ADMIN',
    label: '👑 SUPER_ADMIN',
    badge: 'bg-amber-100 text-amber-800 border border-amber-300 shadow-sm shadow-amber-200/60',
  },
  {
    value: 'ADMIN',
    label: '🛡️ ADMIN',
    badge: 'bg-blue-100 text-blue-800 border border-blue-200',
  },
  {
    value: 'AGENT',
    label: '💬 AGENT',
    badge: 'bg-slate-100 text-slate-600 border border-slate-200',
  },
];

function roleBadgeClass(role) {
  return (
    ROLE_OPTIONS.find((r) => r.value === role)?.badge ||
    'bg-slate-100 text-slate-700'
  );
}

function roleLabel(role) {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label || role;
}

function agentId(a) {
  return String(a?._id || a?.id || '');
}

const DEFAULT_CONFIG = {
  store_name: 'EonlineBazar',
  ai_persona_name: 'Aria',
  ai_language: 'auto',
  contact_phone: '01XXXXXXXXX',
  contact_email: 'support@eonlinebazar.com',
  address: '',
  business_hours: 'Sat–Thu: 9AM–9PM, Fri: 2PM–8PM',
  shipping_policy:
    'Inside Dhaka: 60 BDT, 1–2 days.\nOutside Dhaka: 120 BDT, 3–5 days.\nFree delivery on orders over 1000 BDT.',
  return_policy: '',
  delivery_time: '',
  handover_keywords: [
    'angry',
    'fraud',
    'manager',
    'human',
    'refund now',
  ],
  canned_responses: [
    { shortcut: '/thanks', text: 'Thank you for shopping with us! 😊' },
    { shortcut: '/wait', text: 'Please hold on — I will resolve this right away.' },
    { shortcut: '/sorry', text: 'We sincerely apologize for this inconvenience.' },
    {
      shortcut: '/bye',
      text: 'Thank you! Contact us anytime if you need help. 🙏',
    },
  ],
};

const EMPTY_KB = {
  category: 'GENERAL',
  question: '',
  answer: '',
  keywords: [],
  is_active: true,
};

const inputClass =
  'w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition bg-white';

function parseTags(value) {
  if (Array.isArray(value)) {
    return value.map((t) => String(t).trim()).filter(Boolean);
  }
  return String(value || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function truncate(text, n = 60) {
  const s = String(text || '');
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}

function formatLastSavedBn(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;

  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  const hours = d.getHours();
  const mins = d.getMinutes();
  const period = hours < 12 ? 'morning' : hours < 17 ? 'afternoon' : 'evening';
  let h12 = hours % 12;
  if (h12 === 0) h12 = 12;
  const time = `${h12}:${String(mins).padStart(2, '0')}`;

  if (sameDay) return `Last saved: today ${period} ${time}`;
  return `Last saved: ${d.getDate()}/${d.getMonth() + 1} ${period} ${time}`;
}

function formatLastSeen(value) {
  return relativeTimeBnShort(value);
}

function categoryMeta(category) {
  return (
    CATEGORY_META.find((c) => c.value === category) || {
      icon: '❓',
      color: 'bg-slate-100 text-slate-700',
      value: category,
    }
  );
}

function HighlightedText({ text, query, className = '' }) {
  const parts = highlightMatch(text, query);
  if (typeof parts === 'string') {
    return <span className={className}>{parts}</span>;
  }
  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.toLowerCase() === String(query || '').trim().toLowerCase() ? (
          <mark key={`${part}-${i}`} className="search-hit">
            {part}
          </mark>
        ) : (
          <span key={`${part}-${i}`}>{part}</span>
        )
      )}
    </span>
  );
}

function ConfigCard({ title, subtitle, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {subtitle ? (
          <p className="text-xs text-slate-500 mt-0.5 leading-bn">{subtitle}</p>
        ) : null}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function CharCount({ value, max }) {
  const len = String(value || '').length;
  return (
    <div className="flex justify-end mt-1">
      <span
        className={`text-[11px] tabular-nums ${
          max && len > max ? 'text-danger' : 'text-slate-400'
        }`}
      >
        {len}
        {max ? ` / ${max}` : ''} chars
      </span>
    </div>
  );
}

function TagInput({ value, onChange, placeholder, colorful = false }) {
  const [draft, setDraft] = useState('');
  const tags = Array.isArray(value) ? value : [];

  const commitDraft = () => {
    const next = parseTags(draft);
    if (!next.length) return;
    const merged = [...tags];
    next.forEach((t) => {
      if (!merged.includes(t)) merged.push(t);
    });
    onChange(merged);
    setDraft('');
  };

  return (
    <div className="rounded-xl border border-slate-200 px-3 py-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition bg-white">
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {tags.map((tag, idx) => (
          <span
            key={tag}
            className={`inline-flex items-center gap-1 rounded-full text-xs font-medium px-2.5 py-1 border ${
              colorful
                ? TAG_CHIP_COLORS[idx % TAG_CHIP_COLORS.length]
                : 'bg-primary/10 text-primary border-primary/15'
            }`}
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              className="opacity-70 hover:opacity-100"
              aria-label={`Remove ${tag}`}
            >
              <XMarkIcon className="w-3.5 h-3.5" />
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commitDraft();
          } else if (e.key === 'Backspace' && !draft && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={commitDraft}
        placeholder={placeholder}
        className="w-full text-sm outline-none text-slate-900 placeholder:text-slate-400"
      />
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-slate-400 mt-1">{hint}</p> : null}
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
        checked ? 'bg-primary' : 'bg-slate-300'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function Spinner({ className = 'w-4 h-4' }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

export default function SettingsPage() {
  const agent = useAuthStore((s) => s.agent);
  const canEditConfig = agent?.role === 'SUPER_ADMIN';
  const canManageStaff =
    agent?.role === 'SUPER_ADMIN' || agent?.role === 'ADMIN';
  const canDeleteKb =
    agent?.role === 'SUPER_ADMIN' || agent?.role === 'ADMIN';

  const [tab, setTab] = useState('store');
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [configLoading, setConfigLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [serverConnected, setServerConnected] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);

  const [entries, setEntries] = useState([]);
  const [kbLoading, setKbLoading] = useState(true);
  const [kbFilter, setKbFilter] = useState('');
  const [kbSearch, setKbSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [kbForm, setKbForm] = useState(EMPTY_KB);
  const [savingKb, setSavingKb] = useState(false);

  const [agents, setAgents] = useState([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffModal, setStaffModal] = useState(null); // 'create' | 'edit' | 'password' | null
  const [staffForm, setStaffForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'AGENT',
    max_concurrent_chats: 5,
  });
  const [editingAgentId, setEditingAgentId] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [savingStaff, setSavingStaff] = useState(false);

  const seededRef = useRef(false);

  const configSnapshot = useMemo(() => JSON.stringify(config), [config]);
  const isDirty = Boolean(savedSnapshot) && configSnapshot !== savedSnapshot;

  const applyConfig = useCallback((c) => {
    const next = {
      store_name: c.store_name || DEFAULT_CONFIG.store_name,
      ai_persona_name: c.ai_persona_name || DEFAULT_CONFIG.ai_persona_name,
      ai_language: c.ai_language || 'auto',
      contact_phone: c.contact_phone || '',
      contact_email: c.contact_email || '',
      address: c.address || '',
      business_hours: c.business_hours || '',
      shipping_policy: c.shipping_policy || '',
      return_policy: c.return_policy || '',
      delivery_time: c.delivery_time || '',
      handover_keywords: Array.isArray(c.handover_keywords)
        ? c.handover_keywords
        : DEFAULT_CONFIG.handover_keywords,
      canned_responses:
        Array.isArray(c.canned_responses) && c.canned_responses.length
          ? c.canned_responses.map((r) => ({
              shortcut: r.shortcut || '',
              text: r.text || '',
            }))
          : DEFAULT_CONFIG.canned_responses,
    };
    setConfig(next);
    setSavedSnapshot(JSON.stringify(next));
    if (c.updatedAt) setLastSavedAt(new Date(c.updatedAt));
  }, []);

  const isProductionApi = String(import.meta.env.VITE_API_URL || '').includes(
    'eonlinebazar.com'
  );

  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      const data = await fetchConfig();
      setServerConnected(true);
      applyConfig(data?.config || DEFAULT_CONFIG);
      return true;
    } catch (err) {
      applyConfig(DEFAULT_CONFIG);
      const status = err.response?.status;
      // Banner only for server errors (500+); hide entirely in production.
      // 404 = route mismatch (different issue) — do not show connection banner.
      if (!isProductionApi && status >= 500) {
        setServerConnected(false);
      } else {
        setServerConnected(true);
      }
      const isNetwork =
        !err.response ||
        err.code === 'ERR_NETWORK' ||
        err.message?.includes('Network');
      if (!isNetwork && status !== 404) {
        toast.error(
          err.response?.data?.message ||
            'Failed to load config'
        );
      }
      return false;
    } finally {
      setConfigLoading(false);
    }
  }, [applyConfig, isProductionApi]);

  const loadKnowledge = useCallback(async () => {
    setKbLoading(true);
    try {
      const params = {};
      if (kbFilter) params.category = kbFilter;
      if (kbSearch.trim()) params.q = kbSearch.trim();
      const data = await fetchKnowledge(
        Object.keys(params).length ? params : undefined
      );
      setEntries(data?.entries || []);
      setServerConnected(true);
    } catch (err) {
      const status = err.response?.status;
      if (!isProductionApi && status >= 500) setServerConnected(false);
      else if (status) {
        toast.error(
          err.response?.data?.message ||
            'Failed to load knowledge base'
        );
      }
    } finally {
      setKbLoading(false);
    }
  }, [kbFilter, kbSearch, isProductionApi]);

  const ensureKbSeed = useCallback(async () => {
    if (seededRef.current) return;
    seededRef.current = true;
    try {
      const check = await checkKnowledgeEmpty();
      if (check?.isEmpty) {
        const result = await seedKnowledgeDefaults();
        if (result?.seeded) {
          toast.success(
            'Default FAQs seeded'
          );
        }
      }
    } catch {
      // seed is best-effort; ADMIN role required — ignore for AGENT
    }
  }, []);

  const loadAgents = useCallback(async () => {
    if (!canManageStaff) return;
    setStaffLoading(true);
    try {
      const data = await fetchAgents();
      setAgents(data?.agents || []);
      setServerConnected(true);
    } catch (err) {
      const status = err.response?.status;
      if (!isProductionApi && status >= 500) setServerConnected(false);
      toast.error(
        err.response?.data?.message ||
          'Failed to load staff'
      );
    } finally {
      setStaffLoading(false);
    }
  }, [canManageStaff, isProductionApi]);

  // Connection check on mount: GET /admin/config
  useEffect(() => {
    (async () => {
      const ok = await loadConfig();
      if (!ok) return;
      await ensureKbSeed();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only connection check
  }, []);

  useEffect(() => {
    if (serverConnected !== true) return;
    loadKnowledge();
  }, [kbFilter, kbSearch, serverConnected, loadKnowledge]);

  // Staff Accounts: GET /admin/agents when tab mounts
  useEffect(() => {
    if (tab === 'staff' && serverConnected === true) loadAgents();
  }, [tab, serverConnected, loadAgents]);

  const retryConnection = async () => {
    const ok = await loadConfig();
    if (ok) {
      await ensureKbSeed();
      await loadKnowledge();
      if (tab === 'staff') await loadAgents();
      toast.success('Connected to chat server');
    }
  };

  const reorderCanned = (from, to) => {
    if (from === to || from == null || to == null) return;
    setConfig((prev) => {
      const list = [...(prev.canned_responses || [])];
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      return { ...prev, canned_responses: list };
    });
  };

  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const confirmLeave = () => {
    if (!isDirty) return true;
    return window.confirm(
      'Leave without saving changes?'
    );
  };

  const handleTabChange = (next) => {
    if (next === tab) return;
    if (tab === 'store' && isDirty && !confirmLeave()) return;
    setTab(next);
  };

  const setField = (key, value) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveConfig = async (e) => {
    e?.preventDefault?.();
    if (!canEditConfig) {
      toast.error(
        'Only SUPER_ADMIN can save'
      );
      return;
    }

    const canned = (config.canned_responses || [])
      .map((r) => ({
        shortcut: String(r.shortcut || '').trim(),
        text: String(r.text || '').trim(),
      }))
      .filter((r) => r.shortcut && r.text);

    setSavingConfig(true);
    try {
      const data = await updateConfig({
        store_name: config.store_name.trim(),
        ai_persona_name: config.ai_persona_name.trim(),
        ai_language: config.ai_language || 'auto',
        contact_phone: config.contact_phone.trim(),
        contact_email: config.contact_email.trim(),
        address: config.address.trim(),
        business_hours: config.business_hours.trim(),
        shipping_policy: config.shipping_policy.trim(),
        return_policy: config.return_policy.trim(),
        delivery_time: config.delivery_time.trim(),
        handover_keywords: config.handover_keywords,
        canned_responses: canned,
      });
      applyConfig(data?.config || { ...config, canned_responses: canned });
      setLastSavedAt(new Date());
      toast.success('Settings saved!');
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
          'Failed to save'
      );
    } finally {
      setSavingConfig(false);
    }
  };

  const openCreateKb = () => {
    setEditingId(null);
    setKbForm(EMPTY_KB);
    setModalOpen(true);
  };

  const openEditKb = (entry) => {
    setEditingId(entry._id);
    setKbForm({
      category: entry.category || 'GENERAL',
      question: entry.question || '',
      answer: entry.answer || '',
      keywords: Array.isArray(entry.keywords) ? entry.keywords : [],
      is_active: entry.is_active !== false,
    });
    setModalOpen(true);
  };

  const handleSaveKb = async (e) => {
    e.preventDefault();
    if (!kbForm.question.trim() || !kbForm.answer.trim()) {
      toast.error('Question & answer required');
      return;
    }

    const payload = {
      category: kbForm.category,
      question: kbForm.question.trim(),
      answer: kbForm.answer.trim(),
      keywords: kbForm.keywords,
      is_active: Boolean(kbForm.is_active),
    };

    setSavingKb(true);
    try {
      if (editingId) {
        await updateKnowledge(editingId, payload);
        toast.success('Updated');
      } else {
        await createKnowledge(payload);
        toast.success('Created');
      }
      setModalOpen(false);
      await loadKnowledge();
    } catch (err) {
      toast.error(
        err.response?.data?.message || 'Failed to save'
      );
    } finally {
      setSavingKb(false);
    }
  };

  const handleDeleteKb = async (id) => {
    if (!canDeleteKb) {
      toast.error('Only ADMIN+ can delete');
      return;
    }
    if (
      !window.confirm(
        'Delete this knowledge entry?'
      )
    ) {
      return;
    }
    try {
      await deleteKnowledge(id);
      toast.success('Deleted');
      await loadKnowledge();
    } catch (err) {
      toast.error(
        err.response?.data?.message || 'Failed to delete'
      );
    }
  };

  const handleToggleActive = async (entry) => {
    try {
      await updateKnowledge(entry._id, { is_active: !entry.is_active });
      setEntries((prev) =>
        prev.map((e) =>
          e._id === entry._id ? { ...e, is_active: !e.is_active } : e
        )
      );
    } catch (err) {
      toast.error(
        err.response?.data?.message || 'Failed to update'
      );
    }
  };

  const openCreateStaff = () => {
    setEditingAgentId(null);
    setStaffForm({
      name: '',
      email: '',
      password: '',
      role: 'AGENT',
      max_concurrent_chats: 5,
    });
    setShowPassword(false);
    setStaffModal('create');
  };

  const openEditStaff = (a) => {
    setEditingAgentId(agentId(a));
    setStaffForm({
      name: a.name || '',
      email: a.email || '',
      password: '',
      role: a.role || 'AGENT',
      max_concurrent_chats: a.max_concurrent_chats ?? 5,
    });
    setShowPassword(false);
    setStaffModal('edit');
  };

  const openResetPassword = (a) => {
    setEditingAgentId(agentId(a));
    setStaffForm((f) => ({ ...f, password: '' }));
    setShowPassword(false);
    setStaffModal('password');
  };

  const handleSaveStaff = async (e) => {
    e.preventDefault();

    if (staffModal === 'create') {
      if (!staffForm.name.trim() || !staffForm.email.trim()) {
        toast.error('Name & email required');
        return;
      }
      if (!staffForm.password || staffForm.password.length < 8) {
        toast.error(
          'Password must be at least 8 characters'
        );
        return;
      }
    }

    if (staffModal === 'password') {
      if (!staffForm.password || staffForm.password.length < 8) {
        toast.error(
          'Password must be at least 8 characters'
        );
        return;
      }
    }

    if (
      staffModal === 'edit' &&
      staffForm.password &&
      staffForm.password.length < 8
    ) {
      toast.error(
        'Password must be at least 8 characters'
      );
      return;
    }

    setSavingStaff(true);
    try {
      if (staffModal === 'create') {
        await createAgent({
          name: staffForm.name.trim(),
          email: staffForm.email.trim(),
          password: staffForm.password,
          role: staffForm.role,
          max_concurrent_chats: Number(staffForm.max_concurrent_chats) || 5,
        });
        toast.success('Staff created');
      } else if (staffModal === 'edit') {
        const payload = {
          name: staffForm.name.trim(),
          max_concurrent_chats: Number(staffForm.max_concurrent_chats) || 5,
        };
        const selfId = String(agent?.id || agent?._id || '');
        if (editingAgentId !== selfId) {
          payload.role = staffForm.role;
        }
        await updateAgent(editingAgentId, payload);
        if (staffForm.password) {
          if (agent?.role !== 'SUPER_ADMIN') {
            toast.success(
              'Updated (password unchanged — SUPER_ADMIN only)'
            );
          } else {
            await resetAgentPassword(editingAgentId, staffForm.password);
            toast.success('Staff updated');
          }
        } else {
          toast.success('Staff updated');
        }
      } else if (staffModal === 'password') {
        await resetAgentPassword(editingAgentId, staffForm.password);
        toast.success('Password reset');
      }
      setStaffModal(null);
      await loadAgents();
    } catch (err) {
      toast.error(
        err.response?.data?.message || 'Staff action failed'
      );
    } finally {
      setSavingStaff(false);
    }
  };

  const handleDeleteStaff = async (a) => {
    const id = agentId(a);
    if (id === String(agent?.id || agent?._id || '')) {
      toast.error(
        'Cannot delete your own account'
      );
      return;
    }
    if (!window.confirm(`Are you sure you want to delete ${a.name}?`)) {
      return;
    }
    try {
      await deleteAgent(id);
      toast.success('Staff deleted');
      await loadAgents();
    } catch (err) {
      toast.error(
        err.response?.data?.message || 'Failed to delete'
      );
    }
  };

  const lastSavedLabel = formatLastSavedBn(lastSavedAt);

  return (
    <div className="min-h-screen bg-page pb-24">
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              onClick={(e) => {
                if (isDirty && !confirmLeave()) e.preventDefault();
              }}
              className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-primary transition"
            >
              <ArrowLeftIcon className="w-4 h-4" />
              Dashboard
            </Link>
            <div className="h-5 w-px bg-slate-200" />
            <h1 className="text-lg font-semibold text-slate-900">Settings ⚙️</h1>
          </div>
          <div className="flex items-center gap-3">
            {lastSavedLabel ? (
              <span className="text-xs text-slate-500 hidden sm:inline">
                {lastSavedLabel}
              </span>
            ) : null}
            <span className="text-xs text-slate-500">
              {agent?.name} · {agent?.role}
            </span>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 pb-3 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleTabChange(t.id)}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition whitespace-nowrap ${
                  tab === t.id
                    ? 'bg-primary text-white shadow-sm shadow-primary/20'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        {serverConnected === false && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm text-amber-800 leading-bn">
              Chat server connection failed. Please refresh the page.
            </p>
            <button
              type="button"
              onClick={retryConnection}
              className="shrink-0 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-2 transition"
            >
              Retry
            </button>
          </div>
        )}

        {/* TAB 1: Store & AI Config */}
        {tab === 'store' && (
          <div className="space-y-4">
            {configLoading ? (
              <div className="bg-white rounded-2xl border border-slate-100 px-5 py-12 flex items-center justify-center gap-2 text-sm text-slate-400">
                <Spinner /> Loading…
              </div>
            ) : (
              <form onSubmit={handleSaveConfig} className="space-y-4">
                <ConfigCard
                  title="🤖 AI Personality"
                  subtitle="Store and AI agent name & language"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Store Name">
                      <input
                        className={inputClass}
                        value={config.store_name}
                        onChange={(e) => setField('store_name', e.target.value)}
                        required
                      />
                    </Field>
                    <Field label="AI Agent Name">
                      <input
                        className={inputClass}
                        value={config.ai_persona_name}
                        onChange={(e) =>
                          setField('ai_persona_name', e.target.value)
                        }
                        placeholder="Aria"
                        required
                      />
                    </Field>
                    <Field label="AI Language">
                      <select
                        className={inputClass}
                        value={config.ai_language || 'auto'}
                        onChange={(e) => setField('ai_language', e.target.value)}
                      >
                        <option value="auto">
                          Auto (match customer language)
                        </option>
                        <option value="bn">Always Bangla</option>
                        <option value="en">Always English</option>
                      </select>
                    </Field>
                  </div>
                </ConfigCard>

                <ConfigCard
                  title="📞 Contact Info"
                  subtitle="Customer support contact details"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Phone">
                      <input
                        className={inputClass}
                        value={config.contact_phone}
                        onChange={(e) =>
                          setField('contact_phone', e.target.value)
                        }
                      />
                    </Field>
                    <Field label="Email">
                      <input
                        type="email"
                        className={inputClass}
                        value={config.contact_email}
                        onChange={(e) =>
                          setField('contact_email', e.target.value)
                        }
                      />
                    </Field>
                    <Field label="Business Hours">
                      <input
                        className={inputClass}
                        value={config.business_hours}
                        onChange={(e) =>
                          setField('business_hours', e.target.value)
                        }
                        placeholder="Sat–Thu: 9AM–9PM, Fri: 2PM–8PM"
                      />
                    </Field>
                  </div>
                  <div className="mt-4">
                    <Field label="Address">
                      <textarea
                        rows={2}
                        className={`${inputClass} leading-bn`}
                        value={config.address}
                        onChange={(e) => setField('address', e.target.value)}
                      />
                    </Field>
                  </div>
                </ConfigCard>

                <ConfigCard
                  title="📋 Policies"
                  subtitle="AI will answer customers from these policies"
                >
                  <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 leading-bn">
                    ⚠️ Whatever you write here is what AI will tell customers.
                    You can write in any language.
                  </div>
                  <div className="space-y-4">
                    <Field label="Shipping Policy">
                      <textarea
                        rows={5}
                        className={`${inputClass} leading-bn`}
                        value={config.shipping_policy}
                        onChange={(e) =>
                          setField('shipping_policy', e.target.value)
                        }
                        placeholder={
                          'Inside Dhaka: 60 BDT, 1–2 days.\nOutside Dhaka: 120 BDT, 3–5 days.\nFree delivery on orders over 1000 BDT.'
                        }
                      />
                      <CharCount value={config.shipping_policy} />
                    </Field>
                    <Field label="Return Policy">
                      <textarea
                        rows={5}
                        className={`${inputClass} leading-bn`}
                        value={config.return_policy}
                        onChange={(e) =>
                          setField('return_policy', e.target.value)
                        }
                      />
                      <CharCount value={config.return_policy} />
                    </Field>
                    <Field label="Delivery Time">
                      <textarea
                        rows={3}
                        className={`${inputClass} leading-bn`}
                        value={config.delivery_time}
                        onChange={(e) =>
                          setField('delivery_time', e.target.value)
                        }
                      />
                      <CharCount value={config.delivery_time} />
                    </Field>
                  </div>
                </ConfigCard>

                <ConfigCard
                  title="🔴 Handover Keywords"
                  subtitle="When these words appear, AI will hand over to a live agent"
                >
                  <TagInput
                    value={config.handover_keywords}
                    onChange={(tags) => setField('handover_keywords', tags)}
                    placeholder="Type a word and press Enter…"
                    colorful
                  />
                </ConfigCard>

                <ConfigCard
                  title="⚡ Canned Responses"
                  subtitle="Drag to reorder — shown when typing /"
                >
                  <div className="flex items-center justify-end mb-3">
                    <button
                      type="button"
                      onClick={() =>
                        setField('canned_responses', [
                          ...(config.canned_responses || []),
                          { shortcut: '/', text: '' },
                        ])
                      }
                      className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-600"
                    >
                      <PlusIcon className="w-3.5 h-3.5" />
                      Add new
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(config.canned_responses || []).map((row, idx) => (
                      <div
                        key={`canned-${idx}`}
                        draggable
                        onDragStart={() => setDragIndex(idx)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          reorderCanned(dragIndex, idx);
                          setDragIndex(null);
                        }}
                        onDragEnd={() => setDragIndex(null)}
                        className={`flex flex-col sm:flex-row gap-2 items-stretch rounded-xl border border-slate-100 bg-slate-50/50 p-2 transition ${
                          dragIndex === idx ? 'opacity-50 ring-2 ring-primary/30' : ''
                        }`}
                      >
                        <button
                          type="button"
                          className="shrink-0 self-center p-2 text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing"
                          title="Drag to reorder"
                          aria-label="Drag to reorder"
                        >
                          <Bars3Icon className="w-5 h-5" />
                        </button>
                        <input
                          className={`${inputClass} sm:w-36 shrink-0 font-mono`}
                          value={row.shortcut}
                          onChange={(e) => {
                            const next = [...config.canned_responses];
                            next[idx] = {
                              ...next[idx],
                              shortcut: e.target.value,
                            };
                            setField('canned_responses', next);
                          }}
                          placeholder="/shortcut"
                        />
                        <input
                          className={`${inputClass} flex-1 leading-bn`}
                          value={row.text}
                          onChange={(e) => {
                            const next = [...config.canned_responses];
                            next[idx] = { ...next[idx], text: e.target.value };
                            setField('canned_responses', next);
                          }}
                          placeholder="Full reply text"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setField(
                              'canned_responses',
                              config.canned_responses.filter((_, i) => i !== idx)
                            )
                          }
                          className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-slate-400 hover:text-danger hover:border-red-200 transition"
                          aria-label="Delete canned response"
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                </ConfigCard>

                {!canEditConfig ? (
                  <p className="text-xs text-amber-600 leading-bn">
                    Read-only — SUPER_ADMIN required to save
                  </p>
                ) : null}
              </form>
            )}
          </div>
        )}

        {/* TAB 2: Knowledge Base */}
        {tab === 'knowledge' && (
          <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 space-y-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  📚 Knowledge Base
                </h2>
                <p className="text-sm text-slate-600 mt-2 leading-bn">
                  Whatever you write here is used by AI to answer customer
                  questions. You can write in any language.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={openCreateKb}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary hover:bg-primary-600 text-white text-sm font-semibold px-3 py-2 transition"
                >
                  <PlusIcon className="w-4 h-4" />
                  Add new Q&A
                </button>
                <div className="relative flex-1">
                  <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={kbSearch}
                    onChange={(e) => setKbSearch(e.target.value)}
                    placeholder="🔍 Search question/answer…"
                    className={`${inputClass} pl-9`}
                  />
                </div>
                <select
                  value={kbFilter}
                  onChange={(e) => setKbFilter(e.target.value)}
                  className={`${inputClass} sm:w-52`}
                >
                  <option value="">All categories</option>
                  {CATEGORY_META.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.value}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {!kbLoading && entries.length === 0 ? (
              <div className="px-5 py-16 flex flex-col items-center text-center animate-fadeIn">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-3xl mb-4">
                  📚
                </div>
                <p className="text-sm font-semibold text-slate-700 leading-bn">
                  No FAQs yet
                </p>
                <p className="text-xs text-slate-400 mt-1 leading-bn">
                  Add your first Q&A to train the AI
                </p>
                <button
                  type="button"
                  onClick={openCreateKb}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary hover:bg-primary-600 text-white text-sm font-semibold px-4 py-2.5 transition"
                >
                  <PlusIcon className="w-4 h-4" />
                  Add new Q&A
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3 font-semibold">Category</th>
                      <th className="px-4 py-3 font-semibold">Question</th>
                      <th className="px-4 py-3 font-semibold">Answer</th>
                      <th className="px-4 py-3 font-semibold">Active</th>
                      <th className="px-4 py-3 font-semibold text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {kbLoading ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-10 text-center text-slate-400"
                        >
                          <span className="inline-flex items-center gap-2">
                            <Spinner /> Loading…
                          </span>
                        </td>
                      </tr>
                    ) : (
                      entries.map((entry, rowIdx) => {
                        const cat = categoryMeta(entry.category);
                        return (
                          <tr
                            key={entry._id}
                            className={`border-t border-slate-100 align-top transition ${
                              rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'
                            } hover:bg-primary/5`}
                          >
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center gap-1 rounded-lg text-[11px] font-semibold px-2 py-1 ${cat.color}`}
                              >
                                <span aria-hidden>{cat.icon}</span>
                                {entry.category}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-800 max-w-[220px] leading-bn">
                              <HighlightedText
                                text={entry.question}
                                query={kbSearch}
                              />
                            </td>
                            <td className="px-4 py-3 text-slate-600 max-w-[260px] leading-bn">
                              <HighlightedText
                                text={truncate(entry.answer, 60)}
                                query={kbSearch}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <Toggle
                                checked={!!entry.is_active}
                                onChange={() => handleToggleActive(entry)}
                                label="Toggle active"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEditKb(entry)}
                                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-primary transition"
                                  title="Edit"
                                >
                                  ✏️
                                </button>
                                {canDeleteKb && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteKb(entry._id)}
                                    className="p-2 rounded-lg text-slate-500 hover:bg-red-50 hover:text-danger transition"
                                    title="Delete"
                                  >
                                    🗑️
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* TAB 3: Staff Accounts */}
        {tab === 'staff' && (
          <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  👥 Staff Accounts
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 leading-bn">
                  Manage agents who handle live chat
                </p>
              </div>
              {canManageStaff ? (
                <button
                  type="button"
                  onClick={openCreateStaff}
                  disabled={serverConnected === false}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary hover:bg-primary-600 disabled:opacity-50 text-white text-sm font-semibold px-3 py-2 transition"
                >
                  + Add new staff
                </button>
              ) : (
                <p className="text-xs text-amber-600">
                  ADMIN access required
                </p>
              )}
            </div>

            {!canManageStaff ? (
              <p className="px-5 py-10 text-center text-sm text-slate-400">
                You don&apos;t have permission to view staff accounts.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[880px]">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3 font-semibold">Avatar</th>
                      <th className="px-4 py-3 font-semibold">Name</th>
                      <th className="px-4 py-3 font-semibold">Email</th>
                      <th className="px-4 py-3 font-semibold">Role</th>
                      <th className="px-4 py-3 font-semibold">Online</th>
                      <th className="px-4 py-3 font-semibold">Last Seen</th>
                      <th className="px-4 py-3 font-semibold text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffLoading ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-10 text-center text-slate-400"
                        >
                          <span className="inline-flex items-center gap-2">
                            <Spinner /> Loading…
                          </span>
                        </td>
                      </tr>
                    ) : agents.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-10 text-center text-slate-400 leading-bn"
                        >
                          No staff yet
                        </td>
                      </tr>
                    ) : (
                      agents.map((a, rowIdx) => {
                        const id = agentId(a);
                        const isSelf =
                          id === String(agent?.id || agent?._id || '');
                        return (
                          <tr
                            key={id}
                            className={`border-t border-slate-100 transition ${
                              rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'
                            } hover:bg-primary/5`}
                          >
                            <td className="px-4 py-3">
                              <span className="relative inline-flex">
                                <span
                                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white ${avatarColor(
                                    id || a.email || a.name
                                  )}`}
                                >
                                  {getInitials(a.name)}
                                </span>
                                {a.is_online ? (
                                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-success ring-2 ring-white animate-pulseDot" />
                                ) : null}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-800">
                              {a.name}
                              {isSelf ? (
                                <span className="ml-1 text-[10px] text-primary">
                                  (you)
                                </span>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {a.email}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex rounded-lg text-[11px] font-semibold px-2 py-1 ${roleBadgeClass(
                                  a.role
                                )}`}
                              >
                                {roleLabel(a.role)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className="inline-flex items-center gap-1.5 text-xs"
                                title={a.is_online ? 'Online' : 'Offline'}
                              >
                                <span
                                  className={`w-2.5 h-2.5 rounded-full ${
                                    a.is_online
                                      ? 'bg-success animate-pulseDot'
                                      : 'bg-slate-300'
                                  }`}
                                />
                                <span
                                  className={
                                    a.is_online
                                      ? 'text-success font-medium'
                                      : 'text-slate-400'
                                  }
                                >
                                  {a.is_online ? 'Online' : 'Offline'}
                                </span>
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-500 text-xs leading-bn">
                              {a.is_online
                                ? 'Online now'
                                : formatLastSeen(a.last_seen)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => openEditStaff(a)}
                                  className="rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                                >
                                  Edit
                                </button>
                                {agent?.role === 'SUPER_ADMIN' ? (
                                  <button
                                    type="button"
                                    onClick={() => openResetPassword(a)}
                                    className="rounded-lg px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50"
                                  >
                                    Reset Password
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteStaff(a)}
                                  className={`rounded-lg px-2 py-1 text-xs font-medium ${
                                    isSelf
                                      ? 'text-slate-400 hover:bg-slate-100'
                                      : 'text-danger hover:bg-red-50'
                                  }`}
                                  title={
                                    isSelf
                                      ? 'Cannot delete your own account'
                                      : 'Delete'
                                  }
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Sticky save for Store tab */}
      {tab === 'store' && !configLoading && (
        <div className="fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur px-4 py-3 shadow-[0_-4px_20px_rgba(15,23,42,0.06)]">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-500 leading-bn">
              {savingConfig ? (
                <span className="text-primary font-medium">Saving...</span>
              ) : isDirty ? (
                <span className="text-amber-600 font-medium">
                  Unsaved changes
                </span>
              ) : lastSavedLabel ? (
                lastSavedLabel
              ) : (
                'Ready'
              )}
            </div>
            <button
              type="button"
              onClick={handleSaveConfig}
              disabled={
                savingConfig || !canEditConfig || serverConnected === false
              }
              className="inline-flex items-center gap-2 rounded-xl bg-primary hover:bg-primary-600 disabled:opacity-50 text-white font-semibold text-sm px-5 py-2.5 transition shadow-lg shadow-primary/20"
            >
              {savingConfig ? <Spinner className="w-4 h-4 text-white" /> : '💾'}
              {savingConfig ? 'Saving...' : 'Save All Settings'}
            </button>
          </div>
        </div>
      )}

      {/* KB modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">
                {editingId
                  ? 'Edit'
                  : 'Add new Q&A'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveKb} className="p-5 space-y-4">
              <Field label="Category">
                <select
                  className={inputClass}
                  value={kbForm.category}
                  onChange={(e) =>
                    setKbForm((f) => ({ ...f, category: e.target.value }))
                  }
                >
                  {CATEGORY_META.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Question">
                <input
                  className={inputClass}
                  value={kbForm.question}
                  onChange={(e) =>
                    setKbForm((f) => ({ ...f, question: e.target.value }))
                  }
                  placeholder="e.g. What are delivery charges?"
                  required
                />
              </Field>
              <Field label="Answer">
                <textarea
                  rows={6}
                  className={inputClass}
                  value={kbForm.answer}
                  onChange={(e) =>
                    setKbForm((f) => ({ ...f, answer: e.target.value }))
                  }
                  placeholder="Write a detailed answer in any language."
                  required
                />
              </Field>
              <Field
                label="Keywords"
                hint="AI uses these words to find the matching question"
              >
                <TagInput
                  value={kbForm.keywords}
                  onChange={(tags) =>
                    setKbForm((f) => ({ ...f, keywords: tags }))
                  }
                  placeholder="Type related words and press Enter"
                />
              </Field>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">
                  Active
                </span>
                <Toggle
                  checked={!!kbForm.is_active}
                  onChange={() =>
                    setKbForm((f) => ({ ...f, is_active: !f.is_active }))
                  }
                  label="Active"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingKb}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary hover:bg-primary-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2"
                >
                  {savingKb ? <Spinner className="w-4 h-4 text-white" /> : null}
                  Save ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Staff modal */}
      {staffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div
            className={`w-full bg-white rounded-xl shadow-xl border border-slate-100 max-h-[90vh] overflow-y-auto ${
              staffModal === 'password' ? 'max-w-sm' : 'max-w-md'
            }`}
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">
                {staffModal === 'create' && 'Add new staff'}
                {staffModal === 'edit' && 'Edit staff'}
                {staffModal === 'password' && 'Reset Password'}
              </h3>
              <button
                type="button"
                onClick={() => setStaffModal(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveStaff} className="p-5 space-y-4">
              {staffModal !== 'password' && (
                <>
                  <Field label="Name (required)">
                    <input
                      className={inputClass}
                      value={staffForm.name}
                      onChange={(e) =>
                        setStaffForm((f) => ({ ...f, name: e.target.value }))
                      }
                      required
                    />
                  </Field>
                  {staffModal === 'create' ? (
                    <Field label="Email (required)">
                      <input
                        type="email"
                        className={inputClass}
                        value={staffForm.email}
                        onChange={(e) =>
                          setStaffForm((f) => ({
                            ...f,
                            email: e.target.value,
                          }))
                        }
                        required
                      />
                    </Field>
                  ) : (
                    <Field label="Email">
                      <input
                        type="email"
                        className={`${inputClass} bg-slate-50 text-slate-500`}
                        value={staffForm.email}
                        disabled
                        readOnly
                      />
                    </Field>
                  )}
                  <Field
                    label={
                      staffModal === 'create'
                        ? 'Password (required, min 8 chars)'
                        : 'Password'
                    }
                    hint={
                      staffModal === 'edit'
                        ? 'Leave blank to keep current'
                        : undefined
                    }
                  >
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className={`${inputClass} pr-11`}
                        value={staffForm.password}
                        onChange={(e) =>
                          setStaffForm((f) => ({
                            ...f,
                            password: e.target.value,
                          }))
                        }
                        minLength={staffModal === 'create' ? 8 : undefined}
                        required={staffModal === 'create'}
                        placeholder={
                          staffModal === 'edit'
                            ? 'leave blank to keep current'
                            : ''
                        }
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        aria-label="Toggle password visibility"
                      >
                        {showPassword ? (
                          <EyeSlashIcon className="w-5 h-5" />
                        ) : (
                          <EyeIcon className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </Field>
                  <Field label="Role">
                    <select
                      className={inputClass}
                      value={staffForm.role}
                      onChange={(e) =>
                        setStaffForm((f) => ({ ...f, role: e.target.value }))
                      }
                      disabled={
                        staffModal === 'edit' &&
                        editingAgentId ===
                          String(agent?.id || agent?._id || '')
                      }
                    >
                      {ROLE_OPTIONS.filter(
                        (r) =>
                          agent?.role === 'SUPER_ADMIN' ||
                          r.value !== 'SUPER_ADMIN'
                      ).map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    {staffModal === 'edit' &&
                    editingAgentId ===
                      String(agent?.id || agent?._id || '') ? (
                      <p className="text-xs text-amber-600 mt-1">
                        Cannot change your own role
                      </p>
                    ) : null}
                  </Field>
                  <Field label="Max Chats">
                    <input
                      type="number"
                      min={1}
                      max={50}
                      className={inputClass}
                      value={staffForm.max_concurrent_chats}
                      onChange={(e) =>
                        setStaffForm((f) => ({
                          ...f,
                          max_concurrent_chats: e.target.value,
                        }))
                      }
                    />
                  </Field>
                </>
              )}

              {staffModal === 'password' && (
                <Field label="New Password (min 8 chars)">
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className={`${inputClass} pr-11`}
                      value={staffForm.password}
                      onChange={(e) =>
                        setStaffForm((f) => ({
                          ...f,
                          password: e.target.value,
                        }))
                      }
                      minLength={8}
                      required
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      aria-label="Toggle password visibility"
                    >
                      {showPassword ? (
                        <EyeSlashIcon className="w-5 h-5" />
                      ) : (
                        <EyeIcon className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </Field>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStaffModal(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingStaff}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary hover:bg-primary-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2"
                >
                  {savingStaff ? (
                    <Spinner className="w-4 h-4 text-white" />
                  ) : null}
                  {staffModal === 'create' && 'Create Staff ✓'}
                  {staffModal === 'edit' && 'Save Changes ✓'}
                  {staffModal === 'password' && 'Reset Password ✓'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
