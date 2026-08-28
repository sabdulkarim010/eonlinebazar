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
  View,
} from 'react-native';
import useAuthStore from '../store/useAuthStore';
import { useAppTheme } from '../store/useThemeStore';

const BD_MOBILE_RE = /^01[3-9]\d{8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen({ navigation }) {
  const { colors } = useAppTheme();
  const register = useAuthStore((state) => state.register);
  const isLoading = useAuthStore((state) => state.isLoading);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const handleRegister = async () => {
    setError('');

    const payload = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      mobile: mobile.replace(/\D/g, ''),
      password,
    };

    if (!payload.firstName || !payload.lastName || !payload.email || !payload.mobile || !payload.password) {
      setError('First name, last name, mobile, email, and password are required.');
      return;
    }
    if (!EMAIL_RE.test(payload.email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!BD_MOBILE_RE.test(payload.mobile)) {
      setError('Please enter a valid Bangladesh mobile number (01XXXXXXXXX).');
      return;
    }
    if (payload.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (payload.password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    const result = await register(payload);
    if (!result.success) {
      setError(result.message || 'Registration failed.');
      return;
    }

    navigation.navigate('Login', {
      message:
        result.message ||
        'Registration successful. Please check your email to verify your account, then sign in.',
    });
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
        <Text style={[styles.title, { color: colors.text }]}>Create account</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          Register with your name, email, and Bangladesh mobile number.
        </Text>

        <View style={styles.row}>
          <View style={styles.half}>
            <Text style={[styles.label, { color: colors.text }]}>First name</Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
              ]}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              placeholder="First name"
              placeholderTextColor={colors.muted}
            />
          </View>
          <View style={styles.half}>
            <Text style={[styles.label, { color: colors.text }]}>Last name</Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
              ]}
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              placeholder="Last name"
              placeholderTextColor={colors.muted}
            />
          </View>
        </View>

        <Text style={[styles.label, { color: colors.text }]}>Email</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
          ]}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder="you@example.com"
          placeholderTextColor={colors.muted}
        />

        <Text style={[styles.label, { color: colors.text }]}>Mobile</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
          ]}
          value={mobile}
          onChangeText={setMobile}
          keyboardType="phone-pad"
          placeholder="01XXXXXXXXX"
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
          placeholder="At least 6 characters"
          placeholderTextColor={colors.muted}
        />

        <Text style={[styles.label, { color: colors.text }]}>Confirm password</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
          ]}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          placeholder="Re-enter password"
          placeholderTextColor={colors.muted}
        />

        {error ? <Text style={[styles.error, { color: colors.price }]}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && styles.primaryBtnPressed,
            isLoading && styles.btnDisabled,
          ]}
          onPress={handleRegister}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#111111" />
          ) : (
            <Text style={styles.primaryBtnText}>Create account</Text>
          )}
        </Pressable>

        <Pressable onPress={() => navigation.navigate('Login')} hitSlop={8}>
          <Text style={[styles.link, { color: colors.link }]}>Already have an account? Sign in</Text>
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
    paddingBottom: 40,
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
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  half: {
    flex: 1,
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
