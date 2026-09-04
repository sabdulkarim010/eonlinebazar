import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { endpoints } from '../api/endpoints';
import AuthTextInput from '../components/auth/AuthTextInput';
import api from '../services/api';
import useAuthStore from '../store/useAuthStore';
import useThemeStore from '../store/useThemeStore';
import useToastStore from '../store/useToastStore';
import { useTheme } from '../theme/tokens';
import { haptic } from '../utils/haptics';
import { authIdentifierKeyboard, loginFieldErrors } from '../utils/authForm';

export default function LoginScreen({ navigation, route }) {
  const T = useTheme();
  const isDark = useThemeStore((state) => state.mode === 'dark');
  const inputColors = useMemo(() => ({
    ...T,
    text: T.text,
    muted: T.muted,
    border: T.border,
    inputBg: T.inputBg,
    price: T.price,
  }), [T]);
  const login = useAuthStore((state) => state.login);
  const isLoggingIn = useAuthStore((state) => state.isLoggingIn);
  const showToast = useToastStore((state) => state.showToast);

  const [loginInput, setLoginInput] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState(route.params?.message || '');
  const [verifyEmail, setVerifyEmail] = useState('');
  const [resending, setResending] = useState(false);
  const passwordRef = useRef(null);

  const identifierKeyboard = useMemo(
    () => authIdentifierKeyboard(loginInput),
    [loginInput]
  );
  const identifierIcon = identifierKeyboard === 'phone-pad' ? 'call-outline' : 'mail-outline';
  const fieldErrors = useMemo(
    () => loginFieldErrors(loginInput, password),
    [loginInput, password]
  );
  const canSubmit = !fieldErrors.loginInput && !fieldErrors.password;

  const fail = (message, extras = {}) => {
    const text = message || 'Login failed.';
    setError(text);
    showToast(text, 'error');
    if (extras.needsVerification) {
      setVerifyEmail(extras.email || loginInput.trim());
      setInfo(
        extras.email
          ? `Please verify ${extras.email} before logging in.`
          : 'Please verify your email before logging in.'
      );
    }
  };

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setError('');
    setInfo('');
    const identifier = loginInput.trim();
    if (!identifier || !password) {
      fail('Please enter your email/phone and password.');
      return;
    }

    try {
      const result = await login({ loginInput: identifier, password });
      if (!result?.success) {
        fail(result?.message || 'Login failed. Please try again.', {
          needsVerification: result?.needsVerification,
          email: result?.email || identifier,
        });
        return;
      }

      haptic.success();
      showToast('Welcome back. You are signed in.', 'success');
      navigation.reset({
        index: 0,
        routes: [{ name: 'Main', params: { screen: 'Profile' } }],
      });
    } catch (err) {
      fail(err.response?.data?.message || err.message || 'Login failed. Please try again.');
    }
  };

  const resendVerification = async () => {
    const email = String(verifyEmail || loginInput).trim().toLowerCase();
    if (!email.includes('@')) {
      const message = 'Enter the email on your account to resend verification.';
      setError(message);
      showToast(message, 'error');
      return;
    }
    setResending(true);
    try {
      const { data } = await api.post(endpoints.auth.resendVerification, { email });
      const message = data?.message || 'Verification email sent.';
      setInfo(message);
      setError('');
      showToast(message, 'success');
    } catch (err) {
      const message = err.response?.data?.message || 'Could not resend verification email.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setResending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: T.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        removeClippedSubviews={false}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.brandSection}>
          <Image
            source={require('../../assets/icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={[styles.brandName, { color: T.text }]}>EOnlineBazar</Text>
          <Text style={[styles.brandTagline, { color: T.sub }]}>
            Bangladesh's Trusted Online Store
          </Text>
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: T.card,
              shadowColor: isDark ? '#000000' : '#94a3b8',
            },
          ]}
        >
          <Text style={[styles.formTitle, { color: T.text }]}>Sign In</Text>
          <Text style={[styles.formSub, { color: T.sub }]}>
            Welcome back! Enter your credentials below.
          </Text>

          {error ? (
            <View style={[styles.errorBanner, isDark && styles.errorBannerDark]}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
            </View>
          ) : null}

          {info ? (
            <View style={[styles.infoBanner, isDark && styles.infoBannerDark]}>
              <Text style={[styles.infoText, isDark && styles.infoTextDark]}>{info}</Text>
              {verifyEmail ? (
                <Pressable onPress={resendVerification} disabled={resending} hitSlop={8}>
                  <Text style={styles.resendText}>
                    {resending ? 'Sending…' : 'Resend verification email'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <AuthTextInput
            colors={inputColors}
            label="Email or Phone"
            icon={identifierIcon}
            value={loginInput}
            onChangeText={setLoginInput}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={identifierKeyboard}
            textContentType={identifierKeyboard === 'phone-pad' ? 'telephoneNumber' : 'username'}
            autoComplete={identifierKeyboard === 'phone-pad' ? 'tel' : 'username'}
            placeholder="Enter email or mobile number"
            fieldError={fieldErrors.loginInput}
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => passwordRef.current?.focus()}
            containerStyle={styles.inputField}
          />

          <AuthTextInput
            ref={passwordRef}
            colors={inputColors}
            label="Password"
            icon="lock-closed-outline"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Enter your password"
            fieldError={fieldErrors.password}
            returnKeyType="done"
            onSubmitEditing={handleLogin}
            containerStyle={styles.inputFieldLast}
          />

          <Pressable
            style={styles.forgotRow}
            onPress={() => navigation.navigate('ForgotPassword')}
            hitSlop={8}
          >
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </Pressable>

          <Pressable
            style={[styles.loginBtn, (isLoggingIn || !canSubmit) && styles.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={isLoggingIn || !canSubmit}
          >
            {isLoggingIn ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.loginBtnText}>Login to Account</Text>
            )}
          </Pressable>

          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: T.border }]} />
            <Text style={[styles.dividerText, { color: T.sub }]}>or</Text>
            <View style={[styles.dividerLine, { backgroundColor: T.border }]} />
          </View>

          <Pressable
            style={[styles.registerBtn, { borderColor: T.border }]}
            onPress={() => navigation.navigate('Register')}
          >
            <Text style={[styles.registerBtnText, { color: T.text }]}>Create New Account</Text>
          </Pressable>
        </View>

        <View style={styles.trustRow}>
          <Text style={[styles.trustItem, { color: T.sub }]}>🔒 Secure Login</Text>
          <Text style={[styles.trustDot, { color: T.sub }]}>·</Text>
          <Text style={[styles.trustItem, { color: T.sub }]}>🚚 Fast Delivery</Text>
          <Text style={[styles.trustDot, { color: T.sub }]}>·</Text>
          <Text style={[styles.trustItem, { color: T.sub }]}>💵 Cash on Delivery</Text>
          <Text style={[styles.trustDot, { color: T.sub }]}>·</Text>
          <Text style={[styles.trustItem, { color: T.sub }]}>↩️ Easy Returns</Text>
        </View>
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
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
    gap: 24,
  },
  brandSection: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 16,
  },
  brandName: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  brandTagline: {
    fontSize: 13,
    textAlign: 'center',
  },
  card: {
    borderRadius: 20,
    padding: 24,
    gap: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  formSub: {
    fontSize: 14,
    marginTop: -8,
    marginBottom: 4,
  },
  errorBanner: {
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorBannerDark: {
    backgroundColor: 'rgba(220, 38, 38, 0.12)',
    borderColor: 'rgba(248, 113, 113, 0.35)',
  },
  errorText: {
    fontSize: 13,
    color: '#dc2626',
    fontWeight: '500',
  },
  infoBanner: {
    backgroundColor: '#ecfdf5',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    gap: 8,
  },
  infoBannerDark: {
    backgroundColor: 'rgba(5, 150, 105, 0.12)',
    borderColor: 'rgba(52, 211, 153, 0.35)',
  },
  infoText: {
    fontSize: 13,
    color: '#047857',
    fontWeight: '500',
  },
  infoTextDark: {
    color: '#6ee7b7',
  },
  resendText: {
    fontSize: 13,
    color: '#f97316',
    fontWeight: '700',
  },
  inputField: {
    marginBottom: 0,
    minHeight: 74,
  },
  inputFieldLast: {
    marginBottom: 0,
    minHeight: 74,
  },
  forgotRow: {
    alignItems: 'flex-end',
    marginTop: -6,
  },
  forgotText: {
    fontSize: 13,
    color: '#f97316',
    fontWeight: '600',
  },
  loginBtn: {
    backgroundColor: '#f97316',
    borderRadius: 12,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#f97316',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 4,
  },
  loginBtnDisabled: {
    opacity: 0.65,
  },
  loginBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 13,
    fontWeight: '500',
  },
  registerBtn: {
    borderWidth: 1.5,
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  registerBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  trustRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  trustItem: {
    fontSize: 12,
  },
  trustDot: {
    fontSize: 12,
  },
});
