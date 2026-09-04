import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AuthTextInput from '../components/auth/AuthTextInput';
import OtpInput from '../components/auth/OtpInput';
import useAuthStore from '../store/useAuthStore';
import { useAppTheme } from '../store/useThemeStore';
import useToastStore from '../store/useToastStore';
import { maskEmail, maskPhone } from '../utils/maskContact';

const BD_MOBILE_RE = /^01[3-9]\d{8}$/;

export default function EditProfileScreen({ navigation }) {
  const { colors } = useAppTheme();
  const user = useAuthStore((state) => state.user);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const requestContactOtp = useAuthStore((state) => state.requestContactOtp);
  const verifyContactOtp = useAuthStore((state) => state.verifyContactOtp);
  const showToast = useToastStore((state) => state.showToast);

  const [name, setName] = useState(user?.name || '');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [otpOpen, setOtpOpen] = useState(false);
  const [otpType, setOtpType] = useState(null);
  const [otpValue, setOtpValue] = useState('');
  const [otpMasked, setOtpMasked] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [error, setError] = useState('');

  const saveName = async () => {
    setError('');
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please enter your name.');
      return;
    }
    setSavingName(true);
    const result = await updateProfile({ name: trimmedName });
    setSavingName(false);
    if (!result.success) {
      setError(result.message || 'Could not save profile.');
      showToast(result.message || 'Could not save profile.', 'error');
      return;
    }
    showToast(result.message || 'Profile updated.', 'success');
  };

  const startOtpFlow = async (type) => {
    setError('');
    const value = type === 'email' ? newEmail.trim() : newPhone.replace(/\D/g, '');
    if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (type === 'mobile' && !BD_MOBILE_RE.test(value)) {
      setError('Please enter a valid Bangladesh mobile number (01XXXXXXXXX).');
      return;
    }
    setOtpLoading(true);
    const result = await requestContactOtp(type, value);
    setOtpLoading(false);
    if (!result.success) {
      setError(result.message || 'Could not send verification code.');
      showToast(result.message || 'Could not send verification code.', 'error');
      return;
    }
    setOtpType(type);
    setOtpMasked(result.maskedDestination || (type === 'email' ? maskEmail(value) : maskPhone(value)));
    setOtpValue('');
    setOtpOpen(true);
    showToast(result.message || 'Verification code sent.', 'success');
  };

  const submitOtp = async () => {
    if (otpValue.length !== 6) {
      setError('Enter the 6-digit verification code.');
      return;
    }
    setVerifyLoading(true);
    const result = await verifyContactOtp(otpValue);
    setVerifyLoading(false);
    if (!result.success) {
      setError(result.message || 'Verification failed.');
      showToast(result.message || 'Verification failed.', 'error');
      return;
    }
    setOtpOpen(false);
    setOtpType(null);
    setOtpValue('');
    if (otpType === 'email') setNewEmail('');
    if (otpType === 'mobile') setNewPhone('');
    showToast(result.message || 'Contact updated.', 'success');
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: colors.text }]}>Personal information</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          Update your name, email, or mobile number. Email and phone changes require a verification code.
        </Text>

        <Text style={[styles.section, { color: colors.muted }]}>DISPLAY NAME</Text>
        <AuthTextInput
          colors={colors}
          label="Full name"
          icon="person-outline"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          placeholder="Your full name"
        />
        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: colors.primaryBtn },
            pressed && { backgroundColor: colors.primaryBtnPressed },
            savingName && styles.disabled,
          ]}
          onPress={saveName}
          disabled={savingName}
        >
          {savingName ? (
            <ActivityIndicator color={colors.primaryBtnText} />
          ) : (
            <Text style={[styles.primaryBtnText, { color: colors.primaryBtnText }]}>Save name</Text>
          )}
        </Pressable>

        <Text style={[styles.section, { color: colors.muted }]}>EMAIL</Text>
        <Text style={[styles.current, { color: colors.text }]}>
          Current: {user?.email ? maskEmail(user.email) : '—'}
        </Text>
        <AuthTextInput
          colors={colors}
          label="New email address"
          icon="mail-outline"
          value={newEmail}
          onChangeText={setNewEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="you@example.com"
        />
        <Pressable
          style={({ pressed }) => [
            styles.secondaryBtn,
            { borderColor: colors.border, backgroundColor: colors.card },
            pressed && { opacity: 0.85 },
            otpLoading && styles.disabled,
          ]}
          onPress={() => startOtpFlow('email')}
          disabled={otpLoading}
        >
          <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Send email verification code</Text>
        </Pressable>

        <Text style={[styles.section, { color: colors.muted }]}>MOBILE</Text>
        <Text style={[styles.current, { color: colors.text }]}>
          Current: {user?.mobile ? maskPhone(user.mobile) : '—'}
        </Text>
        <AuthTextInput
          colors={colors}
          label="New mobile number"
          icon="call-outline"
          value={newPhone}
          onChangeText={setNewPhone}
          keyboardType="phone-pad"
          placeholder="01XXXXXXXXX"
        />
        <Pressable
          style={({ pressed }) => [
            styles.secondaryBtn,
            { borderColor: colors.border, backgroundColor: colors.card },
            pressed && { opacity: 0.85 },
            otpLoading && styles.disabled,
          ]}
          onPress={() => startOtpFlow('mobile')}
          disabled={otpLoading}
        >
          <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Send SMS verification code</Text>
        </Pressable>

        {error ? <Text style={[styles.error, { color: colors.price }]}>{error}</Text> : null}

        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={[styles.backLink, { color: colors.link }]}>Back to profile</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={otpOpen} transparent animationType="fade" onRequestClose={() => setOtpOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Enter verification code</Text>
            <Text style={[styles.modalBody, { color: colors.muted }]}>
              Code sent to {otpMasked || 'your contact'}
            </Text>
            <OtpInput
              colors={colors}
              value={otpValue}
              onChange={setOtpValue}
              autoFocus
              error={Boolean(error)}
            />
            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: colors.primaryBtn },
                pressed && { backgroundColor: colors.primaryBtnPressed },
                verifyLoading && styles.disabled,
              ]}
              onPress={submitOtp}
              disabled={verifyLoading}
            >
              {verifyLoading ? (
                <ActivityIndicator color={colors.primaryBtnText} />
              ) : (
                <Text style={[styles.primaryBtnText, { color: colors.primaryBtnText }]}>Verify & update</Text>
              )}
            </Pressable>
            <Pressable onPress={() => setOtpOpen(false)} hitSlop={8}>
              <Text style={[styles.backLink, { color: colors.link }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '800' },
  subtitle: { fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 8 },
  section: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 8,
  },
  current: { fontSize: 14, marginBottom: 8 },
  primaryBtn: {
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.7 },
  error: { fontSize: 14, marginTop: 12 },
  backLink: { textAlign: 'center', marginTop: 18, fontSize: 14, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  modalBody: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
});
