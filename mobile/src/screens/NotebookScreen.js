import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { extractNotes, notesAPI } from '../api/notes';
import useAuthStore from '../store/useAuthStore';
import { useAppTheme } from '../store/useThemeStore';
import useToastStore from '../store/useToastStore';
import { useProfileModuleTokens } from '../theme/profileModuleTokens';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'note', label: 'Note' },
  { key: 'expense', label: 'Expense' },
  { key: 'income', label: 'Income' },
  { key: 'shopping', label: 'Shopping' },
  { key: 'pinned', label: 'Pinned' },
];

const TYPE_OPTIONS = [
  { key: 'note', label: 'Note' },
  { key: 'expense', label: 'Expense' },
  { key: 'income', label: 'Income' },
  { key: 'shopping', label: 'Shopping' },
];

const NOTE_LIKE = new Set(['note', 'general']);

const EMPTY_FORM = {
  title: '',
  content: '',
  type: 'note',
  amount: '',
  pinned: false,
};

function formatBdt(value) {
  return `৳${Number(value || 0).toLocaleString('en-US')}`;
}

function noteKind(note) {
  return NOTE_LIKE.has(note?.type) ? 'note' : note?.type;
}

function typeLabel(type) {
  if (type === 'expense') return 'Expense';
  if (type === 'income') return 'Income';
  if (type === 'shopping') return 'Shopping';
  return 'Note';
}

function computeSummary(notes) {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const monthNotes = notes.filter((note) => {
    const d = new Date(note.date || note.createdAt);
    return d.getMonth() === month && d.getFullYear() === year;
  });
  const income = monthNotes
    .filter((n) => n.type === 'income')
    .reduce((sum, n) => sum + (Number(n.amount) || 0), 0);
  const expense = monthNotes
    .filter((n) => n.type === 'expense')
    .reduce((sum, n) => sum + (Number(n.amount) || 0), 0);
  const savings = income - expense;
  const usagePct = income > 0 ? Math.min((expense / income) * 100, 100) : 0;
  return { income, expense, savings, usagePct };
}

function SpringCard({ children, onPress, style }) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 50 }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50 }).start()}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

function SummaryCard({ label, value, tint, tintBg, T }) {
  return (
    <View style={[styles.summaryCard, { backgroundColor: T.card, borderColor: T.border }]}>
      <View style={[styles.summaryBadge, { backgroundColor: tintBg }]}>
        <Text style={[styles.summaryBadgeText, { color: tint }]}>{label}</Text>
      </View>
      <Text style={[styles.summaryValue, { color: T.text }]}>{value}</Text>
    </View>
  );
}

export default function NotebookScreen() {
  const insets = useSafeAreaInsets();
  const { isDark, colors } = useAppTheme();
  const T = useProfileModuleTokens(isDark);
  const token = useAuthStore((state) => state.token);
  const showToast = useToastStore((state) => state.showToast);

  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState('');
  const [saving, setSaving] = useState(false);

  const loadNotes = useCallback(async ({ silent = false } = {}) => {
    if (!token) {
      setNotes([]);
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const { data } = await notesAPI.list();
      setNotes(extractNotes(data));
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not load notebook.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast, token]);

  useFocusEffect(
    useCallback(() => {
      loadNotes();
    }, [loadNotes])
  );

  const summary = useMemo(() => computeSummary(notes), [notes]);

  const filteredNotes = useMemo(() => notes
    .filter((note) => {
      const kind = noteKind(note);
      if (filter === 'all') return true;
      if (filter === 'pinned') return Boolean(note.pinned);
      if (filter === 'note') return NOTE_LIKE.has(note.type);
      return kind === filter;
    })
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt);
    }), [filter, notes]);

  const openForm = (type = 'note', note = null) => {
    if (note) {
      setEditId(note._id || note.id || '');
      setForm({
        title: note.title || '',
        content: note.content || '',
        type: noteKind(note),
        amount: note.amount != null ? String(note.amount) : '',
        pinned: Boolean(note.pinned),
      });
    } else {
      setEditId('');
      setForm({ ...EMPTY_FORM, type });
    }
    setFormOpen(true);
  };

  const saveNote = async () => {
    const title = form.title.trim();
    if (!title) {
      showToast('Title is required.', 'error');
      return;
    }
    const payload = {
      title,
      content: form.content.trim(),
      type: form.type,
      pinned: Boolean(form.pinned),
    };
    if (form.type === 'expense' || form.type === 'income') {
      const amount = Number(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        showToast('Enter a valid amount.', 'error');
        return;
      }
      payload.amount = amount;
    }

    setSaving(true);
    try {
      const { data } = editId
        ? await notesAPI.update(editId, payload)
        : await notesAPI.create(payload);
      if (data?.success === false) {
        showToast(data.message || 'Could not save note.', 'error');
        return;
      }
      showToast(data?.message || 'Saved successfully.');
      setFormOpen(false);
      loadNotes({ silent: true });
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not save note.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteNote = (note) => {
    const id = note._id || note.id;
    Alert.alert('Delete entry?', note.title || 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { data } = await notesAPI.remove(id);
            if (data?.success === false) {
              showToast(data.message || 'Could not delete.', 'error');
              return;
            }
            showToast(data?.message || 'Deleted.');
            loadNotes({ silent: true });
          } catch (error) {
            showToast(error.response?.data?.message || 'Could not delete.', 'error');
          }
        },
      },
    ]);
  };

  const renderNote = ({ item }) => {
    const kind = noteKind(item);
    const dateStr = new Date(item.date || item.createdAt).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    return (
      <SpringCard
        style={styles.noteCardWrap}
        onPress={() => openForm(kind, item)}
      >
        <View
          style={[
            styles.noteCard,
            {
              backgroundColor: item.color || T.card,
              borderColor: T.border,
            },
          ]}
        >
          <View style={styles.noteCardTop}>
            <Text style={[styles.noteType, { color: T.accent }]}>{typeLabel(kind)}</Text>
            {item.pinned ? <Ionicons name="pin" size={14} color={T.accent} /> : null}
          </View>
          <Text style={[styles.noteTitle, { color: T.text }]} numberOfLines={2}>
            {item.title || 'Untitled'}
          </Text>
          {(kind === 'expense' || kind === 'income') && item.amount != null ? (
            <Text style={[styles.noteAmount, { color: kind === 'income' ? T.success : T.expense }]}>
              {formatBdt(item.amount)}
            </Text>
          ) : null}
          {item.content ? (
            <Text style={[styles.noteBody, { color: T.sub }]} numberOfLines={3}>
              {item.content}
            </Text>
          ) : null}
          <View style={styles.noteFooter}>
            <Text style={[styles.noteDate, { color: T.muted }]}>{dateStr}</Text>
            <Pressable onPress={() => deleteNote(item)} hitSlop={8}>
              <Ionicons name="trash-outline" size={16} color={T.danger} />
            </Pressable>
          </View>
        </View>
      </SpringCard>
    );
  };

  const ListHeader = (
    <View style={styles.headerWrap}>
      <View style={[styles.banner, { backgroundColor: T.card, borderColor: T.border, shadowColor: T.shadow }]}>
        <View style={[styles.bannerIcon, { backgroundColor: T.accentBg }]}>
          <Ionicons name="book-outline" size={24} color="#8b5cf6" />
        </View>
        <View style={styles.bannerCopy}>
          <Text style={[styles.bannerTitle, { color: T.text }]}>My Notebook</Text>
          <Text style={[styles.bannerSub, { color: T.sub }]}>
            Personal notes & expense tracking
          </Text>
        </View>
      </View>

      <View style={styles.quickActions}>
        <Pressable
          style={[styles.quickBtn, { backgroundColor: colors.primaryBtn }]}
          onPress={() => openForm('note')}
        >
          <Ionicons name="add" size={18} color={colors.primaryBtnText} />
          <Text style={[styles.quickBtnText, { color: colors.primaryBtnText }]}>New Note</Text>
        </Pressable>
        <Pressable
          style={[styles.quickBtn, { backgroundColor: T.expenseBg, borderColor: T.expense, borderWidth: 1 }]}
          onPress={() => openForm('expense')}
        >
          <Ionicons name="remove-circle-outline" size={18} color={T.expense} />
          <Text style={[styles.quickBtnText, { color: T.expense }]}>Add Expense</Text>
        </Pressable>
      </View>

      <View style={styles.summaryGrid}>
        <SummaryCard label="TOTAL INCOME" value={formatBdt(summary.income)} tint={T.success} tintBg={T.successBg} T={T} />
        <SummaryCard label="TOTAL EXPENSE" value={formatBdt(summary.expense)} tint={T.expense} tintBg={T.expenseBg} T={T} />
        <View style={[styles.summaryCardWide, { backgroundColor: T.card, borderColor: T.border }]}>
          <View style={[styles.summaryBadge, { backgroundColor: T.savingsBg }]}>
            <Text style={[styles.summaryBadgeText, { color: T.savings }]}>SAVINGS</Text>
          </View>
          <Text style={[styles.summaryValue, { color: summary.savings >= 0 ? T.success : T.danger }]}>
            {formatBdt(summary.savings)}
          </Text>
          <View style={[styles.progressTrack, { backgroundColor: T.border }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${summary.usagePct}%`,
                  backgroundColor: summary.usagePct > 85 ? T.danger : T.savings,
                },
              ]}
            />
          </View>
          <Text style={[styles.progressLabel, { color: T.muted }]}>
            {Math.round(summary.usagePct)}% of income spent this month
          </Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
        {FILTERS.map((item) => {
          const active = filter === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setFilter(item.key)}
              style={[
                styles.filterPill,
                {
                  backgroundColor: active ? T.chipSelected : T.card,
                  borderColor: active ? T.chipSelected : T.border,
                },
              ]}
            >
              <Text style={[styles.filterText, { color: active ? T.chipSelectedText : T.text }]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  if (!token) {
    return (
      <View style={[styles.centered, { backgroundColor: T.bg }]}>
        <Text style={[styles.emptyTitle, { color: T.text }]}>Sign in to use your notebook</Text>
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: T.bg }]}>
      {loading && !notes.length ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={T.accent} />
        </View>
      ) : (
        <FlatList
          data={filteredNotes}
          keyExtractor={(item, index) => String(item._id || item.id || index)}
          renderItem={renderNote}
          numColumns={1}
          contentContainerStyle={styles.list}
          ListHeaderComponent={ListHeader}
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadNotes({ silent: true });
              }}
              tintColor={T.accent}
            />
          )}
          ListEmptyComponent={(
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIcon, { backgroundColor: T.iconBg, borderColor: T.border }]}>
                <Ionicons name="journal-outline" size={42} color={T.muted} />
              </View>
              <Text style={[styles.emptyTitle, { color: T.text }]}>No notes yet</Text>
              <Text style={[styles.emptySub, { color: T.muted }]}>
                Write your first note or expense to start tracking.
              </Text>
            </View>
          )}
        />
      )}

      <Modal visible={formOpen} animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <View style={[styles.modal, { backgroundColor: T.bg, paddingTop: insets.top + 12 }]}>
          <Text style={[styles.modalTitle, { color: T.text }]}>
            {editId ? 'Edit entry' : 'New entry'}
          </Text>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalScroll}>
            <View style={styles.typeRow}>
              {TYPE_OPTIONS.map((opt) => {
                const active = form.type === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setForm((prev) => ({ ...prev, type: opt.key }))}
                    style={[
                      styles.typeChip,
                      {
                        backgroundColor: active ? T.chipSelected : T.card,
                        borderColor: active ? T.chipSelected : T.border,
                      },
                    ]}
                  >
                    <Text style={{ color: active ? T.chipSelectedText : T.text, fontWeight: '700', fontSize: 12 }}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: T.border, color: T.text }]}
              placeholder="Title"
              placeholderTextColor={T.muted}
              value={form.title}
              onChangeText={(title) => setForm((prev) => ({ ...prev, title }))}
            />

            {(form.type === 'expense' || form.type === 'income') ? (
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: T.border, color: T.text }]}
                placeholder="Amount (৳)"
                placeholderTextColor={T.muted}
                value={form.amount}
                onChangeText={(amount) => setForm((prev) => ({ ...prev, amount }))}
                keyboardType="decimal-pad"
              />
            ) : null}

            <TextInput
              style={[
                styles.input,
                styles.textArea,
                { backgroundColor: colors.inputBg, borderColor: T.border, color: T.text },
              ]}
              placeholder="Details…"
              placeholderTextColor={T.muted}
              value={form.content}
              onChangeText={(content) => setForm((prev) => ({ ...prev, content }))}
              multiline
              textAlignVertical="top"
            />

            <Pressable
              style={styles.pinRow}
              onPress={() => setForm((prev) => ({ ...prev, pinned: !prev.pinned }))}
            >
              <Ionicons
                name={form.pinned ? 'pin' : 'pin-outline'}
                size={18}
                color={form.pinned ? T.accent : T.muted}
              />
              <Text style={[styles.pinText, { color: T.text }]}>Pin to top</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.saveBtn,
                { backgroundColor: colors.primaryBtn },
                pressed && { backgroundColor: colors.primaryBtnPressed },
                saving && styles.disabled,
              ]}
              onPress={saveNote}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={colors.primaryBtnText} />
              ) : (
                <Text style={[styles.saveBtnText, { color: colors.primaryBtnText }]}>Save</Text>
              )}
            </Pressable>

            <Pressable onPress={() => setFormOpen(false)} hitSlop={8}>
              <Text style={[styles.cancel, { color: colors.link }]}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingBottom: 28 },
  headerWrap: { paddingTop: 8, paddingBottom: 8 },
  banner: {
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 3,
  },
  bannerIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerCopy: { flex: 1 },
  bannerTitle: { fontSize: 20, fontWeight: '800' },
  bannerSub: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  quickActions: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  quickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    paddingVertical: 12,
  },
  quickBtnText: { fontSize: 14, fontWeight: '700' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  summaryCard: {
    width: '48%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    minWidth: 140,
  },
  summaryCardWide: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  summaryBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 8,
  },
  summaryBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  summaryValue: { fontSize: 20, fontWeight: '800' },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 999 },
  progressLabel: { fontSize: 11, marginTop: 6, fontWeight: '600' },
  filtersRow: { gap: 8, paddingBottom: 8 },
  filterPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterText: { fontSize: 13, fontWeight: '700' },
  noteCardWrap: { marginBottom: 10 },
  noteCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  noteCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  noteType: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  noteTitle: { fontSize: 16, fontWeight: '800', marginTop: 6 },
  noteAmount: { fontSize: 18, fontWeight: '800', marginTop: 6 },
  noteBody: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  noteFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  noteDate: { fontSize: 12, fontWeight: '600' },
  emptyWrap: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24 },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginTop: 6 },
  modal: { flex: 1, paddingHorizontal: 20 },
  modalTitle: { fontSize: 22, fontWeight: '800', marginBottom: 12 },
  modalScroll: { paddingBottom: 32 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  typeChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 10,
  },
  textArea: { minHeight: 140 },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  pinText: { fontSize: 15, fontWeight: '600' },
  saveBtn: { borderRadius: 24, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.7 },
  cancel: { textAlign: 'center', marginTop: 16, fontSize: 14, fontWeight: '600' },
});
