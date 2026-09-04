import { useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DistrictUpazilaPicker, { DistrictModalHost } from '../components/DistrictUpazilaPicker';
import AuthLayout, {
  AuthFeedbackBadge,
  AuthPrimaryButton,
  REGISTER_TRUST_BADGES,
} from '../components/auth/AuthChrome';
import AuthTextInput from '../components/auth/AuthTextInput';
import useAuthStore from '../store/useAuthStore';
import useToastStore from '../store/useToastStore';
import { useTheme } from '../theme/tokens';
import { passwordStrength, registerFieldErrors } from '../utils/authForm';

const BD_MOBILE_RE = /^01[3-9]\d{8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen({ navigation }) {
  const T = useTheme();
  const register = useAuthStore((state) => state.register);
  const isRegistering = useAuthStore((state) => state.isRegistering);
  const showToast = useToastStore((state) => state.showToast);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [district, setDistrict] = useState('');
  const [upazila, setUpazila] = useState('');
  const [error, setError] = useState('');
  const emailRef = useRef(null);
  const mobileRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmPasswordRef = useRef(null);

  const fieldErrors = useMemo(() => registerFieldErrors({
    firstName,
    lastName,
    email,
    mobile,
    password,
    confirmPassword,
    district,
    upazila,
  }), [firstName, lastName, email, mobile, password, confirmPassword, district, upazila]);

  const strength = useMemo(() => passwordStrength(password), [password]);
  const canSubmit = Object.keys(fieldErrors).length === 0;

  const fail = (message) => {
    setError(message);
    showToast(message, 'error');
  };

  const handleRegister = async () => {
    setError('');

    const payload = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      mobile: mobile.replace(/\D/g, ''),
      password,
      district,
      upazila,
    };

    if (!payload.firstName || !payload.lastName || !payload.email || !payload.mobile || !payload.password) {
      fail('First name, last name, mobile, email, and password are required.');
      return;
    }
    if (!payload.district) {
      fail('Please select your district.');
      return;
    }
    if (!payload.upazila) {
      fail('Please select your upazila / thana.');
      return;
    }
    if (!EMAIL_RE.test(payload.email)) {
      fail('Please enter a valid email address.');
      return;
    }
    if (!BD_MOBILE_RE.test(payload.mobile)) {
      fail('Please enter a valid Bangladesh mobile number (01XXXXXXXXX).');
      return;
    }
    if (payload.password.length < 6) {
      fail('Password must be at least 6 characters.');
      return;
    }
    if (payload.password !== confirmPassword) {
      fail('Passwords do not match.');
      return;
    }

    const result = await register(payload);
    if (!result.success) {
      fail(result.message || 'Registration failed.');
      return;
    }

    const message = result.message
      || 'Registration successful. Please check your email to verify your account, then sign in.';
    showToast(message, 'success');
    navigation.reset({
      index: 0,
      routes: [{ name: 'Main', params: { screen: 'Profile' } }],
    });
  };

  return (
    <DistrictModalHost style={[styles.flex, { backgroundColor: T.bg }]}>
      <KeyboardAvoidingView
        style={[styles.flex, { backgroundColor: T.bg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
        <AuthLayout
          colors={T}
          icon="sparkles"
          title="Create Account ✨"
          subtitle="Join EOnlineBazar — shop smarter today"
          badges={REGISTER_TRUST_BADGES}
          footer={(
            <Pressable onPress={() => navigation.navigate('Login')} hitSlop={8}>
              <Text style={[styles.footerText, { color: T.muted }]}>
                Already have an account?{' '}
                <Text style={styles.footerLink}>Login</Text>
              </Text>
            </Pressable>
          )}
        >
          <AuthFeedbackBadge colors={T} type="error" message={error} />

          <View style={styles.row}>
            <AuthTextInput
              colors={T}
              label="First Name"
              icon="person-outline"
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              keyboardType="default"
              textContentType="givenName"
              autoComplete="given-name"
              placeholder="First name"
              fieldError={fieldErrors.firstName}
              containerStyle={styles.half}
            />
            <AuthTextInput
              colors={T}
              label="Last Name"
              icon="person-outline"
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              keyboardType="default"
              textContentType="familyName"
              autoComplete="family-name"
              placeholder="Last name"
              fieldError={fieldErrors.lastName}
              containerStyle={styles.half}
            />
          </View>

          <DistrictUpazilaPicker
            district={district}
            upazila={upazila}
            colors={T}
            onDistrictChange={setDistrict}
            onUpazilaChange={setUpazila}
          />

          <AuthTextInput
            colors={T}
            label="Mobile Number"
            icon="call-outline"
            ref={mobileRef}
            value={mobile}
            onChangeText={setMobile}
            keyboardType="phone-pad"
            placeholder="01XXXXXXXXX"
            maxLength={11}
            fieldError={fieldErrors.mobile}
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => emailRef.current?.focus()}
          />

          <AuthTextInput
            colors={T}
            label="Email"
            icon="mail-outline"
            ref={emailRef}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="you@example.com"
            fieldError={fieldErrors.email}
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => passwordRef.current?.focus()}
          />

          <AuthTextInput
            colors={T}
            label="Password"
            icon="lock-closed-outline"
            ref={passwordRef}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="At least 6 characters"
            fieldError={fieldErrors.password}
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => confirmPasswordRef.current?.focus()}
          />
          {password ? (
            <View style={styles.strengthWrap}>
              <View style={[styles.strengthTrack, { backgroundColor: T.border }]}>
                <View
                  style={[
                    styles.strengthFill,
                    { backgroundColor: strength.color, width: strength.width },
                  ]}
                />
              </View>
              <Text style={[styles.strengthLabel, { color: strength.color }]}>
                {strength.label}
              </Text>
            </View>
          ) : null}

          <AuthTextInput
            colors={T}
            label="Confirm Password"
            icon="shield-checkmark-outline"
            ref={confirmPasswordRef}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            placeholder="Re-enter password"
            fieldError={fieldErrors.confirmPassword}
            returnKeyType="done"
            onSubmitEditing={handleRegister}
          />

          <AuthPrimaryButton
            colors={T}
            label="Create Account"
            loading={isRegistering}
            disabled={!canSubmit}
            onPress={handleRegister}
          />
        </AuthLayout>
        </ScrollView>
      </KeyboardAvoidingView>
    </DistrictModalHost>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  half: {
    flex: 1,
  },
  footerText: {
    textAlign: 'center',
    marginTop: 22,
    fontSize: 14,
  },
  footerLink: {
    color: '#f97316',
    fontWeight: '800',
  },
  strengthWrap: {
    marginTop: -8,
    marginBottom: 8,
    gap: 6,
  },
  strengthTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  strengthFill: {
    height: '100%',
    borderRadius: 3,
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
});
