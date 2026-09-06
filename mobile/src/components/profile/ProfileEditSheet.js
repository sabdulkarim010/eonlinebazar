import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AuthTextInput from '../auth/AuthTextInput';
import OtpInput from '../auth/OtpInput';

const BD_MOBILE_RE = /^01[3-9]\d{8}$/;

const SHEET_COPY = {
  name: {
    title: 'Edit full name',
    subtitle: 'This name appears on orders and your profile.',
    label: 'Full name',
    icon: 'person-outline',
    placeholder: 'Your full name',
    keyboardType: 'default',
  },
  email: {
    title: 'Update email',
    subtitle: 'We will send a verification code to your new email address.',
    label: 'New email address',
    icon: 'mail-outline',
    placeholder: 'you@example.com',
    keyboardType: 'email-address',
  },
  mobile: {
    title: 'Update phone',
    subtitle: 'We will send an SMS verification code to your new number.',
    label: 'New mobile number',
    icon: 'call-outline',
    placeholder: '01XXXXXXXXX',
    keyboardType: 'phone-pad',
  },
};

export default function ProfileEditSheet({
  visible,
  type,
  initialValue = '',
  colors,
  onClose,
  onSaveName,
  onRequestOtp,
  onVerifyOtp,
}) {
  const insets = useSafeAreaInsets();
  const overlay = useRef(new Animated.Value(0)).current;
  const sheetY = useRef(new Animated.Value(400)).current;
  const [mounted, setMounted] = useState(visible);
  const [value, setValue] = useState('');
  const [step, setStep] = useState('input');
  const [otp, setOtp] = useState('');
  const [maskedDestination, setMaskedDestination] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const copy = SHEET_COPY[type] || SHEET_COPY.name;
  const isOtpFlow = type === 'email' || type === 'mobile';

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setValue(type === 'name' ? initialValue : '');
      setStep('input');
      setOtp('');
      setError('');
      setMaskedDestination('');
      overlay.setValue(0);
      sheetY.setValue(400);
      Animated.parallel([
        Animated.timing(overlay, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(sheetY, { toValue: 0, friction: 8, tension: 70, useNativeDriver: true }),
      ]).start();
      return undefined;
    }

    if (!mounted) return undefined;
    Animated.parallel([
      Animated.timing(overlay, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(sheetY, { toValue: 400, duration: 200, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) setMounted(false);
    });
    return undefined;
  }, [visible, initialValue, mounted, overlay, sheetY, type]);

  const closeSheet = () => {
    Keyboard.dismiss();
    onClose?.();
  };

  const validateInput = () => {
    const trimmed = value.trim();
    if (type === 'name') {
      if (!trimmed) return 'Please enter your name.';
      return '';
    }
    if (type === 'email') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        return 'Please enter a valid email address.';
      }
      return '';
    }
    const digits = value.replace(/\D/g, '');
    if (!BD_MOBILE_RE.test(digits)) {
      return 'Please enter a valid Bangladesh mobile number (01XXXXXXXXX).';
    }
    return '';
  };

  const handlePrimary = async () => {
    setError('');
    if (step === 'otp') {
      if (otp.length !== 6) {
        setError('Enter the 6-digit verification code.');
        return;
      }
      setLoading(true);
      const result = await onVerifyOtp?.(otp);
      setLoading(false);
      if (!result?.success) {
        setError(result?.message || 'Verification failed.');
        return;
      }
      closeSheet();
      return;
    }

    const validationError = validateInput();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (type === 'name') {
      setLoading(true);
      const result = await onSaveName?.(value.trim());
      setLoading(false);
      if (!result?.success) {
        setError(result?.message || 'Could not save profile.');
        return;
      }
      closeSheet();
      return;
    }

    setLoading(true);
    const payload = type === 'email' ? value.trim() : value.replace(/\D/g, '');
    const result = await onRequestOtp?.(type, payload);
    setLoading(false);
    if (!result?.success) {
      setError(result?.message || 'Could not send verification code.');
      return;
    }
    setMaskedDestination(result.maskedDestination || '');
    setStep('otp');
    setOtp('');
  };

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={closeSheet}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.flex} onPress={closeSheet}>
          <Animated.View
            style={[styles.overlay, { opacity: overlay }]}
          />
        </Pressable>

        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              paddingBottom: Math.max(insets.bottom, 16),
              transform: [{ translateY: sheetY }],
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.title, { color: colors.text }]}>{copy.title}</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            {step === 'otp'
              ? `Enter the code sent to ${maskedDestination || 'your contact'}.`
              : copy.subtitle}
          </Text>

          {step === 'input' ? (
            <AuthTextInput
              colors={colors}
              label={copy.label}
              icon={copy.icon}
              value={value}
              onChangeText={setValue}
              keyboardType={copy.keyboardType}
              autoCapitalize={type === 'name' ? 'words' : 'none'}
              autoCorrect={false}
              placeholder={copy.placeholder}
              fieldError={error}
              autoFocus
            />
          ) : (
            <>
              <OtpInput
                colors={colors}
                value={otp}
                onChange={setOtp}
                autoFocus
                error={Boolean(error)}
              />
              {error ? (
                <Text style={[styles.errorText, { color: colors.price }]}>{error}</Text>
              ) : null}
            </>
          )}

          {step === 'input' && error ? (
            <Text style={[styles.errorText, { color: colors.price }]}>{error}</Text>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: colors.primaryBtn },
              pressed && { backgroundColor: colors.primaryBtnPressed },
              loading && styles.disabled,
            ]}
            onPress={handlePrimary}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.primaryBtnText} />
            ) : (
              <Text style={[styles.primaryBtnText, { color: colors.primaryBtnText }]}>
                {step === 'otp' ? 'Confirm & Save' : (isOtpFlow ? 'Send verification code' : 'Confirm & Save')}
              </Text>
            )}
          </Pressable>

          {step === 'otp' ? (
            <Pressable onPress={() => { setStep('input'); setError(''); }} hitSlop={8}>
              <Text style={[styles.secondaryAction, { color: colors.link }]}>
                Change {type === 'email' ? 'email' : 'number'}
              </Text>
            </Pressable>
          ) : null}

          <Pressable onPress={closeSheet} hitSlop={8} style={styles.cancelBtn}>
            <Text style={[styles.cancelText, { color: colors.muted }]}>Cancel</Text>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'flex-end' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  primaryBtn: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryAction: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 14,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
  disabled: { opacity: 0.7 },
});
