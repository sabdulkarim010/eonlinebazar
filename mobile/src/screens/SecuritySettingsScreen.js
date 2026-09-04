import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { profileAPI } from '../api/profile';
import { useAppTheme } from '../store/useThemeStore';
import useToastStore from '../store/useToastStore';

function formatWhen(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SecuritySettingsScreen({ navigation }) {
  const { colors } = useAppTheme();
  const showToast = useToastStore((state) => state.showToast);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState('');

  const loadSessions = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await profileAPI.getSessions();
      setSessions(Array.isArray(data?.sessions) ? data.sessions : []);
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not load sessions.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useFocusEffect(
    useCallback(() => {
      loadSessions();
    }, [loadSessions])
  );

  const logoutSession = (session) => {
    const id = session.id || session.sessionId;
    Alert.alert('Log out device?', 'This device will need to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          setBusyId(String(id));
          try {
            const { data } = await profileAPI.deleteSession(id);
            showToast(data?.message || 'Device logged out.', 'success');
            await loadSessions({ silent: true });
          } catch (error) {
            showToast(error.response?.data?.message || 'Could not log out device.', 'error');
          } finally {
            setBusyId('');
          }
        },
      },
    ]);
  };

  const logoutOthers = () => {
    Alert.alert('Log out other devices?', 'All sessions except this one will be signed out.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out others',
        style: 'destructive',
        onPress: async () => {
          setBusyId('others');
          try {
            const { data } = await profileAPI.logoutOtherSessions();
            showToast(data?.message || 'Other devices logged out.', 'success');
            await loadSessions({ silent: true });
          } catch (error) {
            showToast(error.response?.data?.message || 'Could not log out other devices.', 'error');
          } finally {
            setBusyId('');
          }
        },
      },
    ]);
  };

  const otherCount = sessions.filter((s) => !s.isCurrent).length;

  const renderSession = ({ item }) => {
    const id = String(item.id || item.sessionId || '');
    const isBusy = busyId === id;
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardTop}>
          <View style={[styles.iconWrap, { backgroundColor: colors.qtyBg }]}>
            <Ionicons
              name={item.device === 'Mobile' ? 'phone-portrait-outline' : 'desktop-outline'}
              size={18}
              color={colors.accent}
            />
          </View>
          <View style={styles.cardCopy}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {[item.browser, item.device].filter(Boolean).join(' · ') || 'Unknown device'}
            </Text>
            <Text style={[styles.cardSub, { color: colors.muted }]}>
              {item.location || 'Unknown location'} • {item.ip || 'Unknown IP'}
            </Text>
            <Text style={[styles.cardMeta, { color: colors.muted }]}>
              {item.isCurrent ? 'Active now (this device)' : `Last active ${formatWhen(item.lastActiveAt)}`}
            </Text>
          </View>
        </View>
        {!item.isCurrent ? (
          <Pressable
            style={[styles.logoutBtn, { borderColor: colors.price }]}
            onPress={() => logoutSession(item)}
            disabled={isBusy}
          >
            {isBusy ? (
              <ActivityIndicator color={colors.price} />
            ) : (
              <Text style={[styles.logoutText, { color: colors.price }]}>Log out this device</Text>
            )}
          </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.bg }]}>
      <View style={[styles.headerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Security settings</Text>
        <Text style={[styles.headerSub, { color: colors.muted }]}>
          Manage active sessions and keep your account secure.
        </Text>
        <Pressable
          style={[styles.linkRow, { borderColor: colors.border }]}
          onPress={() => navigation.navigate('ChangePassword')}
        >
          <Ionicons name="lock-closed-outline" size={18} color={colors.accent} />
          <Text style={[styles.linkText, { color: colors.text }]}>Change password</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </Pressable>
      </View>

      <View style={styles.listHeader}>
        <Text style={[styles.listTitle, { color: colors.text }]}>Active sessions</Text>
        {otherCount > 0 ? (
          <Pressable onPress={logoutOthers} disabled={busyId === 'others'}>
            <Text style={[styles.logoutAll, { color: colors.price }]}>
              {busyId === 'others' ? 'Logging out…' : 'Log out others'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {loading && !sessions.length ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item, index) => String(item.id || item.sessionId || index)}
          contentContainerStyle={styles.list}
          renderItem={renderSession}
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadSessions({ silent: true });
              }}
              tintColor={colors.accent}
            />
          )}
          ListEmptyComponent={(
            <Text style={[styles.empty, { color: colors.muted }]}>No active sessions found.</Text>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerCard: {
    margin: 16,
    marginBottom: 8,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  headerSub: { fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 12 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  linkText: { flex: 1, fontSize: 15, fontWeight: '600' },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  listTitle: { fontSize: 16, fontWeight: '800' },
  logoutAll: { fontSize: 13, fontWeight: '700' },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', gap: 12 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardCopy: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardSub: { fontSize: 12 },
  cardMeta: { fontSize: 12, marginTop: 2 },
  logoutBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  logoutText: { fontSize: 14, fontWeight: '700' },
  empty: { textAlign: 'center', marginTop: 24, fontSize: 14 },
});
