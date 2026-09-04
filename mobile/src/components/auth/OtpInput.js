import { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export default function OtpInput({
  value = '',
  onChange,
  length = 6,
  colors,
  error = false,
  autoFocus = false,
  editable = true,
}) {
  const inputRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const digits = String(value || '').replace(/\D/g, '').slice(0, length);
  const activeIndex = Math.min(digits.length, length - 1);

  useEffect(() => {
    if (autoFocus) {
      const timer = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [autoFocus]);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.text }]}>6-digit code</Text>
      <View style={styles.boxesHost}>
        <View style={styles.row} pointerEvents="none">
          {Array.from({ length }, (_, index) => {
            const filled = Boolean(digits[index]);
            const isActive = focused && index === activeIndex;
            return (
              <View
                key={index}
                style={[
                  styles.box,
                  { backgroundColor: colors.inputBg, borderColor: colors.border },
                  filled && { borderColor: '#f97316' },
                  isActive && styles.boxActive,
                  error && { borderColor: colors.price },
                ]}
              >
                <Text style={[styles.digit, { color: colors.text }]}>
                  {digits[index] || ''}
                </Text>
              </View>
            );
          })}
        </View>
        <TextInput
          ref={inputRef}
          value={digits}
          onChangeText={(next) => onChange?.(next.replace(/\D/g, '').slice(0, length))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={length}
          caretHidden
          editable={editable}
          accessibilityLabel={`${length}-digit verification code`}
          style={styles.hiddenInput}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 18,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  boxesHost: {
    position: 'relative',
  },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.02,
    color: 'transparent',
  },
  box: {
    flex: 1,
    aspectRatio: 0.85,
    maxHeight: 56,
    borderWidth: 1.5,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: {
    borderColor: '#f97316',
    shadowColor: '#f97316',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  digit: {
    fontSize: 22,
    fontWeight: '800',
  },
});
