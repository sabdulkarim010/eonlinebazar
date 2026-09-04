import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';
import { endpoints } from '../api/endpoints';
import AuthTextInput from '../components/auth/AuthTextInput';
import api from '../services/api';
import { useAppTheme } from '../store/useThemeStore';
import useToastStore from '../store/useToastStore';

const MIN_PASSWORD_LENGTH = 6;

export default function ChangePasswordScreen({ navigation }) {
  const { colors } = useAppTheme();
  const showToast = useToastStore((state) => state.showToast);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const fail = (message) => {
    const text = message || 'Could not change password.';
    setError(text);
    showToast(text, 'error');
  };

  const handleSave = async () => {
    setError('');
    if (!currentPassword || !newPassword) {
      fail('Current password and new password are required.');
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      fail(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      fail('New password and confirm password do not match.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.put(endpoints.customerChangePassword, {
        currentPassword,
        newPassword,
        confirmPassword,
      });
      if (data?.success === false) {
        fail(data.message || 'Could not change password.');
        return;
      }
      showToast(data?.message || 'Password updated.', 'success');
      navigation.goBack();
    } catch (err) {
      fail(err.response?.data?.message || err.message || 'Could not change password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: colors.text }]}>Change password</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          Enter your current password, then choose a new one.
        </Text>

        <AuthTextInput
          colors={colors}
          label="Current password"
          icon="lock-closed-outline"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Current password"
          error={Boolean(error) && !currentPassword}
        />

        <AuthTextInput
          colors={colors}
          label="New password"
          icon="lock-closed-outline"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="New password"
          error={Boolean(error) && newPassword.length > 0 && newPassword.length < MIN_PASSWORD_LENGTH}
        />

        <AuthTextInput
          colors={colors}
          label="Confirm new password"
          icon="shield-checkmark-outline"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Confirm new password"
          error={Boolean(error) && confirmPassword.length > 0 && confirmPassword !== newPassword}
        />

        {error ? <Text style={[styles.error, { color: colors.price }]}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: colors.primaryBtn },
            pressed && { backgroundColor: colors.primaryBtnPressed },
            loading && styles.btnDisabled,
          ]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.primaryBtnText} />
          ) : (
            <Text style={[styles.primaryBtnText, { color: colors.primaryBtnText }]}>
              Update password
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 20, paddingTop: 28 },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: 15, marginTop: 8, marginBottom: 12, lineHeight: 22 },
  error: { fontSize: 14, marginBottom: 10, marginTop: -4 },
  primaryBtn: { borderRadius: 24, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  btnDisabled: { opacity: 0.7 },
  primaryBtnText: { fontSize: 16, fontWeight: '700' },
});
