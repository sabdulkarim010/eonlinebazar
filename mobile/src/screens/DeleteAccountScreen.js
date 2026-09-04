import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AuthTextInput from '../components/auth/AuthTextInput';
import useAuthStore from '../store/useAuthStore';
import { useAppTheme } from '../store/useThemeStore';
import useToastStore from '../store/useToastStore';

export default function DeleteAccountScreen({ navigation }) {
  const { colors } = useAppTheme();
  const deleteAccount = useAuthStore((state) => state.deleteAccount);
  const showToast = useToastStore((state) => state.showToast);
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const fail = (title, message) => {
    const text = message || 'Please try again.';
    showToast(text, 'error');
    Alert.alert(title, text);
  };

  const confirmDelete = async () => {
    const trimmedPassword = password.trim();
    if (!trimmedPassword) {
      fail('Password required', 'Enter your password. Google accounts: type DELETE.');
      return;
    }

    setLoading(true);
    try {
      const result = await deleteAccount({
        password: trimmedPassword,
        reason: reason.trim(),
      });

      if (!result?.success) {
        fail('Could not delete account', result?.message || 'Please try again.');
        return;
      }

      const message = result.message || 'Your account has been permanently deleted.';
      showToast(message, 'success');
      Alert.alert('Account deleted', message, [
        { text: 'OK', onPress: () => navigation.replace('Login') },
      ]);
    } catch (err) {
      fail(
        'Could not delete account',
        err.response?.data?.message || err.message || 'Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete account?',
      'This cannot be undone. Your profile, wishlist, and personal data will be removed. Pending orders will be cancelled.',
      [
        { text: 'Keep account', style: 'cancel' },
        { text: 'Delete forever', style: 'destructive', onPress: confirmDelete },
      ]
    );
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
        <View style={[styles.warningBox, { backgroundColor: colors.card, borderColor: colors.price }]}>
          <Ionicons name="warning-outline" size={36} color={colors.price} />
          <Text style={[styles.warningTitle, { color: colors.price }]}>Delete account</Text>
          <Text style={[styles.warningText, { color: colors.text }]}>
            This permanently removes your personal data from EOnlineBazar. Order records are kept for the seller but anonymized.
          </Text>
        </View>

        <Text style={[styles.label, { color: colors.text }]}>Reason (optional)</Text>
        <TextInput
          style={[
            styles.input,
            styles.reasonInput,
            { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
          ]}
          placeholder="Why are you leaving?"
          placeholderTextColor={colors.muted}
          value={reason}
          onChangeText={setReason}
          autoCapitalize="sentences"
          multiline
          textAlignVertical="top"
        />

        <AuthTextInput
          colors={colors}
          label="Confirm password"
          icon="lock-closed-outline"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Password"
        />
        <Text style={[styles.hint, { color: colors.muted }]}>
          Google sign-in accounts: type DELETE
        </Text>

        <Pressable
          style={({ pressed }) => [
            styles.deleteBtn,
            { backgroundColor: colors.price },
            pressed && styles.deleteBtnPressed,
            loading && styles.disabled,
          ]}
          onPress={handleDelete}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.deleteBtnText}>Delete my account</Text>
          )}
        </Pressable>

        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={[styles.cancelLink, { color: colors.link }]}>Cancel — keep my account</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  warningBox: {
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
  },
  warningTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 8,
  },
  warningText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 8,
  },
  hint: {
    fontSize: 13,
    marginTop: -8,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 8,
  },
  reasonInput: {
    minHeight: 88,
  },
  deleteBtn: {
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  deleteBtnPressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.6,
  },
  deleteBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelLink: {
    textAlign: 'center',
    marginTop: 18,
    fontSize: 14,
    fontWeight: '600',
  },
});
