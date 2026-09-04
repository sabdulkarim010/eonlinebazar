import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { endpoints } from '../api/endpoints';
import AuthLayout, {
  AuthFeedbackBadge,
  AuthPrimaryButton,
} from '../components/auth/AuthChrome';
import AuthTextInput from '../components/auth/AuthTextInput';
import OtpInput from '../components/auth/OtpInput';
import api from '../services/api';
import { useAppTheme } from '../store/useThemeStore';
import useToastStore from '../store/useToastStore';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

export default function ForgotPasswordScreen({ navigation }) {
  const { colors } = useAppTheme();
  const showToast = useToastStore((state) => state.showToast);
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const fail = (message) => {
    setError(message);
    showToast(message, 'error');
  };

  const sendCode = async () => {
    setError('');
    setInfo('');
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      fail('Please enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post(endpoints.auth.forgotPassword, { email: trimmed });
      if (data?.success === false) {
        fail(data.message || 'Could not send reset code.');
        return;
      }
      const message = data?.message || 'Verification OTP sent to your email.';
      setEmail(trimmed);
      setInfo(message);
      setStep(2);
      showToast(message, 'success');
    } catch (err) {
      fail(err.response?.data?.message || 'Could not send reset code.');
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    setError('');
    setInfo('');
    if (otp.trim().length !== 6) {
      fail('Enter the 6-digit code from your email.');
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      fail('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post(endpoints.auth.resetPassword, {
        email,
        otp: otp.trim(),
        newPassword,
      });
      if (data?.success === false) {
        fail(data.message || 'Could not reset password.');
        return;
      }
      const message = data?.message || 'Password reset successful. You can sign in now.';
      showToast(message, 'success');
      navigation.navigate('Login', { message });
    } catch (err) {
      fail(err.response?.data?.message || 'Could not reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <AuthLayout
          colors={colors}
          icon={step === 1 ? 'key-outline' : 'shield-checkmark-outline'}
          title={step === 1 ? 'Reset Password' : 'Create New Password'}
          subtitle={
            step === 1
              ? 'Enter your email to receive a 6-digit OTP.'
              : `OTP sent to ${email}. Enter the code, then choose a new password.`
          }
          footer={(
            <Pressable
              onPress={() => {
                if (step === 2) {
                  setStep(1);
                  setError('');
                  setOtp('');
                  return;
                }
                navigation.navigate('Login');
              }}
              hitSlop={8}
            >
              <Text style={[styles.footerText, { color: colors.muted }]}>
                {step === 2 ? 'Use a different email' : 'Back to sign in'}
              </Text>
            </Pressable>
          )}
        >
          <View style={styles.progress}>
            <View style={[styles.progressStep, { backgroundColor: '#f97316' }]} />
            <View
              style={[
                styles.progressStep,
                { backgroundColor: step === 2 ? '#f97316' : colors.border },
              ]}
            />
          </View>
          <Text style={[styles.progressLabel, { color: colors.muted }]}>Step {step} of 2</Text>

          <AuthFeedbackBadge colors={colors} type="error" message={error} />
          <AuthFeedbackBadge colors={colors} type="success" message={info} />

          {step === 1 ? (
            <AuthTextInput
              colors={colors}
              label="Registered Email"
              icon="mail-outline"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="you@example.com"
              error={Boolean(error)}
            />
          ) : (
            <>
              <OtpInput
                value={otp}
                onChange={setOtp}
                colors={colors}
                error={Boolean(error) && otp.length !== 6}
                autoFocus
              />
              <AuthTextInput
                colors={colors}
                label="New Password"
                icon="lock-closed-outline"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                placeholder="New password"
              />
              <AuthTextInput
                colors={colors}
                label="Confirm Password"
                icon="shield-checkmark-outline"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                placeholder="Re-enter password"
              />
            </>
          )}

          <AuthPrimaryButton
            colors={colors}
            label={step === 1 ? 'Send OTP' : 'Reset Password'}
            loading={loading}
            onPress={step === 1 ? sendCode : resetPassword}
          />
        </AuthLayout>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },
  progress: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  progressStep: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 14,
  },
  footerText: {
    textAlign: 'center',
    marginTop: 22,
    fontSize: 14,
    fontWeight: '600',
  },
});
