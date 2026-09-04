import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const FIELD_LABEL_HEIGHT = 18;
const FIELD_INPUT_HEIGHT = 50;

const AuthTextInput = forwardRef(function AuthTextInput({
  colors,
  label,
  icon,
  value,
  onChangeText,
  secureTextEntry = false,
  error = false,
  fieldError = '',
  containerStyle,
  keyboardType = 'default',
  autoCapitalize,
  autoCorrect,
  textContentType,
  autoComplete,
  returnKeyType,
  onSubmitEditing,
  blurOnSubmit,
  ...inputProps
}, ref) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const isPassword = Boolean(secureTextEntry);
  const isEmail = keyboardType === 'email-address';
  const isPhone = keyboardType === 'phone-pad';
  const disableCaps = isPassword || isEmail || isPhone;
  const showError = Boolean(error || fieldError);
  const iconColor = showError ? colors.price : (focused ? '#f97316' : colors.muted);

  return (
    <View style={[styles.field, containerStyle]}>
      {label ? (
        <Text style={[styles.label, { color: colors.text }]} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.wrap,
          { backgroundColor: colors.inputBg, borderColor: colors.border },
          focused && !showError && styles.wrapFocused,
          showError && { borderColor: colors.price },
        ]}
      >
        {icon ? (
          <View style={styles.iconSlot}>
            <Ionicons name={icon} size={18} color={iconColor} />
          </View>
        ) : null}
        <TextInput
          ref={ref}
          {...inputProps}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType || 'default'}
          autoCapitalize={autoCapitalize ?? (disableCaps ? 'none' : 'sentences')}
          autoCorrect={autoCorrect ?? !disableCaps}
          textContentType={
            textContentType
            ?? (isPassword ? 'password' : isEmail ? 'emailAddress' : isPhone ? 'telephoneNumber' : undefined)
          }
          autoComplete={
            autoComplete
            ?? (isPassword ? 'password' : isEmail ? 'email' : isPhone ? 'tel' : undefined)
          }
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={blurOnSubmit}
          onFocus={(event) => {
            setFocused(true);
            inputProps.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            inputProps.onBlur?.(event);
          }}
          secureTextEntry={isPassword && !visible}
          placeholderTextColor={colors.muted}
          style={[
            styles.input,
            { color: colors.text },
            isPassword && styles.inputPassword,
          ]}
        />
        {isPassword ? (
          <Pressable
            onPress={() => setVisible((current) => !current)}
            hitSlop={8}
            style={styles.eye}
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          >
            <Ionicons
              name={visible ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={focused ? '#f97316' : colors.muted}
            />
          </Pressable>
        ) : null}
      </View>
      {fieldError ? (
        <Text style={[styles.fieldError, { color: colors.price }]} numberOfLines={2}>
          {fieldError}
        </Text>
      ) : null}
    </View>
  );
});

export default AuthTextInput;

const styles = StyleSheet.create({
  field: {
    marginBottom: 16,
    minHeight: FIELD_LABEL_HEIGHT + 6 + FIELD_INPUT_HEIGHT,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 6,
    height: FIELD_LABEL_HEIGHT,
    lineHeight: FIELD_LABEL_HEIGHT,
  },
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 10,
    height: FIELD_INPUT_HEIGHT,
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  wrapFocused: {
    borderColor: '#f97316',
  },
  iconSlot: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: FIELD_INPUT_HEIGHT - 3,
    fontSize: 16,
    paddingVertical: 0,
    margin: 0,
    ...(Platform.OS === 'android' ? { textAlignVertical: 'center' } : {}),
  },
  inputPassword: {
    paddingRight: 4,
  },
  eye: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldError: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
});
