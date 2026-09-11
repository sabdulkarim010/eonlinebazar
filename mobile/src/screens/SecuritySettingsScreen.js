import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { profileAPI } from '../api/profile';
import useAuthStore from '../store/useAuthStore';
import { useAppTheme } from '../store/useThemeStore';
import useToastStore from '../store/useToastStore';

const BD_MOBILE_RE = /^01[3-9]\d{8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function ContactInput({ icon, value, onChangeText, placeholder, keyboardType, colors }) {
  return (
    <View style={[styles.contactInputWrap, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
      <Ionicons name={icon} size={18} color={colors.muted} style={styles.contactInputIcon} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.contactInput, { color: colors.text }]}
      />
    </View>
  );
}

export default function SecuritySettingsScreen({ navigation }) {
  const { colors } = useAppTheme();
  const user = useAuthStore((state) => state.user);
  const requestContactOtp = useAuthStore((state) => state.requestContactOtp);
  const verifyContactOtp = useAuthStore((state) => state.verifyContactOtp);
  const showToast = useToastStore((state) => state.showToast);

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState('');

  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [emailOtp, setEmailOtp] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(false);

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

  const handleSendEmailOtp = async () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      showToast('Please enter a valid email address.', 'error');
      return;
    }
    setEmailLoading(true);
    const result = await requestContactOtp('email', trimmed);
    setEmailLoading(false);
    if (!result.success) {
      showToast(result.message || 'Could not send code.', 'error');
      return;
    }
    setEmailOtpSent(true);
    setEmailOtp('');
    showToast(result.message || 'Verification code sent.', 'success');
  };

  const handleVerifyEmail = async () => {
    if (emailOtp.length !== 6) {
      showToast('Enter the 6-digit verification code.', 'error');
      return;
    }
    setEmailLoading(true);
    const result = await verifyContactOtp(emailOtp);
    setEmailLoading(false);
    if (!result.success) {
      showToast(result.message || 'Verification failed.', 'error');
      return;
    }
    showToast('Email updated successfully', 'success');
    setNewEmail('');
    setEmailOtp('');
    setEmailOtpSent(false);
  };

  const handleSendPhoneOtp = async () => {
    const digits = newPhone.replace(/\D/g, '');
    if (!BD_MOBILE_RE.test(digits)) {
      showToast('Please enter a valid Bangladesh mobile number (01XXXXXXXXX).', 'error');
      return;
    }
    setPhoneLoading(true);
    const result = await requestContactOtp('mobile', digits);
    setPhoneLoading(false);
    if (!result.success) {
      showToast(result.message || 'Could not send code.', 'error');
      return;
    }
    setPhoneOtpSent(true);
    setPhoneOtp('');
    showToast(result.message || 'Verification code sent.', 'success');
  };

  const handleVerifyPhone = async () => {
    if (phoneOtp.length !== 6) {
      showToast('Enter the 6-digit verification code.', 'error');
      return;
    }
    setPhoneLoading(true);
    const result = await verifyContactOtp(phoneOtp);
    setPhoneLoading(false);
    if (!result.success) {
      showToast(result.message || 'Verification failed.', 'error');
      return;
    }
    showToast('Phone number updated successfully', 'success');
    setNewPhone('');
    setPhoneOtp('');
    setPhoneOtpSent(false);
  };

  const otherCount = sessions.filter((s) => !s.isCurrent).length;

  return (
    <View style={[styles.flex, { backgroundColor: colors.bg }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
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
      >
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

        <View style={styles.verificationCard}>
          <View style={styles.verificationHeader}>
            <View style={styles.verificationIconWrap}>
              <Text style={styles.verificationEmoji}>🔐</Text>
            </View>
            <View style={styles.verificationHeaderCopy}>
              <Text style={styles.verificationTitle}>Email & Phone Verification</Text>
              <Text style={styles.verificationSub}>
                Sensitive contact changes require a one-time 6-digit code (valid 5 mins).
              </Text>
            </View>
          </View>

          <View style={styles.verificationDivider} />

          <Text style={styles.fieldLabel}>NEW EMAIL ADDRESS</Text>
          <ContactInput
            icon="mail-outline"
            value={newEmail}
            onChangeText={setNewEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            colors={colors}
          />
          <TouchableOpacity
            style={[styles.sendOtpBtn, emailLoading && styles.btnDisabled]}
            onPress={handleSendEmailOtp}
            disabled={emailLoading}
            activeOpacity={0.88}
          >
            {emailLoading && !emailOtpSent ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.sendOtpText}>✈ Send OTP</Text>
            )}
          </TouchableOpacity>
          <Text style={styles.currentHint}>
            Current: {user?.email || '—'}
          </Text>

          {emailOtpSent ? (
            <>
              <TextInput
                value={emailOtp}
                onChangeText={(value) => setEmailOtp(value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                maxLength={6}
                style={styles.otpInput}
              />
              <TouchableOpacity
                style={[styles.verifyBtn, emailLoading && styles.btnDisabled]}
                onPress={handleVerifyEmail}
                disabled={emailLoading}
                activeOpacity={0.88}
              >
                {emailLoading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.verifyText}>Verify</Text>
                )}
              </TouchableOpacity>
            </>
          ) : null}

          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>NEW PHONE NUMBER</Text>
          <ContactInput
            icon="call-outline"
            value={newPhone}
            onChangeText={setNewPhone}
            placeholder="01XXXXXXXXX"
            keyboardType="phone-pad"
            colors={colors}
          />
          <TouchableOpacity
            style={[styles.sendOtpBtn, phoneLoading && styles.btnDisabled]}
            onPress={handleSendPhoneOtp}
            disabled={phoneLoading}
            activeOpacity={0.88}
          >
            {phoneLoading && !phoneOtpSent ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.sendOtpText}>💬 Send OTP</Text>
            )}
          </TouchableOpacity>
          <Text style={styles.currentHint}>
            Current: {user?.mobile || '—'}
          </Text>

          {phoneOtpSent ? (
            <>
              <TextInput
                value={phoneOtp}
                onChangeText={(value) => setPhoneOtp(value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                maxLength={6}
                style={styles.otpInput}
              />
              <TouchableOpacity
                style={[styles.verifyBtn, phoneLoading && styles.btnDisabled]}
                onPress={handleVerifyPhone}
                disabled={phoneLoading}
                activeOpacity={0.88}
              >
                {phoneLoading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.verifyText}>Verify</Text>
                )}
              </TouchableOpacity>
            </>
          ) : null}
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
        ) : sessions.length ? (
          sessions.map((item, index) => {
            const id = String(item.id || item.sessionId || index);
            const isBusy = busyId === id;
            return (
              <View
                key={id}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
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
          })
        ) : (
          <Text style={[styles.empty, { color: colors.muted }]}>No active sessions found.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: {
    paddingBottom: 24,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
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
  verificationCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  verificationHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  verificationIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#FFF3E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verificationEmoji: {
    fontSize: 20,
  },
  verificationHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  verificationTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  verificationSub: {
    fontSize: 13,
    lineHeight: 18,
    color: '#64748b',
  },
  verificationDivider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginVertical: 16,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  fieldLabelSpaced: {
    marginTop: 20,
  },
  contactInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    height: 48,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  contactInputIcon: {
    marginRight: 8,
  },
  contactInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  sendOtpBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 10,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  sendOtpText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  currentHint: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 4,
    marginBottom: 4,
  },
  otpInput: {
    marginTop: 12,
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: 8,
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    height: 52,
    backgroundColor: '#ffffff',
  },
  verifyBtn: {
    backgroundColor: '#f97316',
    borderRadius: 10,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  verifyText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.7,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  listTitle: { fontSize: 16, fontWeight: '800' },
  logoutAll: { fontSize: 13, fontWeight: '700' },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 16,
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
  empty: { textAlign: 'center', marginTop: 8, marginHorizontal: 16, fontSize: 14 },
});
