import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import useAuthStore from '../store/useAuthStore';
import { useAppTheme } from '../store/useThemeStore';

export default function LoginScreen({ navigation, route }) {
  const { colors } = useAppTheme();
  const login = useAuthStore((state) => state.login);
  const isLoading = useAuthStore((state) => state.isLoading);
  const [loginInput, setLoginInput] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState(route.params?.message || '');

  const handleLogin = async () => {
    setError('');
    setInfo('');
    const identifier = loginInput.trim();
    if (!identifier || !password) {
      setError('Enter your email or mobile number and password.');
      return;
    }

    const result = await login({ loginInput: identifier, password });
    if (!result.success) {
      setError(result.message || 'Login failed.');
      if (result.needsVerification) {
        setInfo(
          result.email
            ? `Please verify ${result.email} before logging in.`
            : 'Please verify your email before logging in.'
        );
      }
      return;
    }

    navigation.navigate('Main', { screen: 'Profile' });
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, { color: colors.text }]}>Sign in</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          Use your eOnlineBazar email or Bangladesh mobile number.
        </Text>

        <Text style={[styles.label, { color: colors.text }]}>Email or mobile</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
          ]}
          value={loginInput}
          onChangeText={setLoginInput}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder="you@example.com or 017XXXXXXXX"
          placeholderTextColor={colors.muted}
        />

        <Text style={[styles.label, { color: colors.text }]}>Password</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
          ]}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Password"
          placeholderTextColor={colors.muted}
        />

        {error ? <Text style={[styles.error, { color: colors.price }]}>{error}</Text> : null}
        {info ? <Text style={[styles.info, { color: colors.success }]}>{info}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && styles.primaryBtnPressed,
            isLoading && styles.btnDisabled,
          ]}
          onPress={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#111111" />
          ) : (
            <Text style={styles.primaryBtnText}>Sign in</Text>
          )}
        </Pressable>

        <Pressable onPress={() => navigation.navigate('Register')} hitSlop={8}>
          <Text style={[styles.link, { color: colors.link }]}>
            New to eOnlineBazar? Create an account
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#eaeded',
  },
  content: {
    padding: 20,
    paddingTop: 28,
  },
  title: {
    color: '#111111',
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: '#565959',
    fontSize: 15,
    marginTop: 8,
    marginBottom: 20,
  },
  label: {
    color: '#111111',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d5d9d9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111111',
    marginBottom: 14,
  },
  error: {
    color: '#b12704',
    fontSize: 14,
    marginBottom: 10,
  },
  info: {
    color: '#067d62',
    fontSize: 14,
    marginBottom: 10,
  },
  primaryBtn: {
    backgroundColor: '#ffd814',
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryBtnPressed: {
    backgroundColor: '#f7ca00',
  },
  btnDisabled: {
    opacity: 0.7,
  },
  primaryBtnText: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '700',
  },
  link: {
    color: '#007185',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 18,
  },
});
