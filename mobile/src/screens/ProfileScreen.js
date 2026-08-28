import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import ScreenHeader from '../components/ScreenHeader';
import useAuthStore from '../store/useAuthStore';
import { useAppTheme } from '../store/useThemeStore';
import useToastStore from '../store/useToastStore';

const BD_MOBILE_RE = /^01[3-9]\d{8}$/;

function ThemeToggleRow({ colors, isDark, toggleTheme }) {
  return (
    <View style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.rowLabel, { color: colors.text }]}>Dark mode</Text>
      <Switch
        value={isDark}
        onValueChange={toggleTheme}
        trackColor={{ false: colors.border, true: colors.accent }}
        thumbColor="#ffffff"
      />
    </View>
  );
}

function WishlistRow({ colors, onPress }) {
  return (
    <Pressable
      style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
    >
      <Text style={[styles.rowLabel, { color: colors.text }]}>Wishlist</Text>
      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
    </Pressable>
  );
}

export default function ProfileScreen({ navigation }) {
  const { colors, isDark, toggleTheme } = useAppTheme();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const isLoading = useAuthStore((state) => state.isLoading);
  const logout = useAuthStore((state) => state.logout);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const showToast = useToastStore((state) => state.showToast);
  const isLoggedIn = Boolean(token && user);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setName(user.name || [user.firstName, user.lastName].filter(Boolean).join(' '));
    setPhone(user.mobile || '');
    setAddress(user.address || '');
  }, [user]);

  const handleSave = async () => {
    setError('');
    const trimmedName = name.trim();
    const trimmedPhone = phone.replace(/\D/g, '');
    const trimmedAddress = address.trim();

    if (!trimmedName) {
      setError('Please enter your name.');
      return;
    }
    if (!BD_MOBILE_RE.test(trimmedPhone)) {
      setError('Please enter a valid Bangladesh mobile number (01XXXXXXXXX).');
      return;
    }

    setSaving(true);
    const result = await updateProfile({
      name: trimmedName,
      mobile: trimmedPhone,
      address: trimmedAddress,
    });
    setSaving(false);

    if (!result.success) {
      setError(result.message || 'Could not save profile.');
      showToast(result.message || 'Could not save profile.', 'error');
      return;
    }

    showToast(result.message || 'Profile updated.');
  };

  if (isLoading && !isLoggedIn) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (isLoggedIn) {
    return (
      <KeyboardAvoidingView
        style={[styles.flex, { backgroundColor: colors.bg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.hello, { color: colors.text }]}>Your profile</Text>
          <Text style={[styles.email, { color: colors.muted }]}>{user.email}</Text>

          <WishlistRow colors={colors} onPress={() => navigation.navigate('Wishlist')} />
          <ThemeToggleRow colors={colors} isDark={isDark} toggleTheme={toggleTheme} />

          <Text style={[styles.label, { color: colors.text }]}>Name</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.inputBg,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            placeholder="Full name"
            placeholderTextColor={colors.muted}
          />

          <Text style={[styles.label, { color: colors.text }]}>Phone</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.inputBg,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="01XXXXXXXXX"
            placeholderTextColor={colors.muted}
          />

          <Text style={[styles.label, { color: colors.text }]}>Delivery address</Text>
          <TextInput
            style={[
              styles.input,
              styles.addressInput,
              {
                backgroundColor: colors.inputBg,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            value={address}
            onChangeText={setAddress}
            multiline
            textAlignVertical="top"
            placeholder="House, road, area, district"
            placeholderTextColor={colors.muted}
          />

          {error ? <Text style={[styles.error, { color: colors.price }]}>{error}</Text> : null}

          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: colors.primaryBtn },
              pressed && { backgroundColor: colors.primaryBtnPressed },
              saving && styles.btnDisabled,
            ]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.primaryBtnText} />
            ) : (
              <Text style={[styles.primaryBtnText, { color: colors.primaryBtnText }]}>
                Save changes
              </Text>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.logoutBtn,
              { backgroundColor: colors.card, borderColor: colors.border },
              pressed && { opacity: 0.8 },
            ]}
            onPress={logout}
          >
            <Text style={[styles.logoutBtnText, { color: colors.text }]}>Logout</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={[styles.guest, { backgroundColor: colors.bg }]}>
      <ScreenHeader
        title="Profile"
        subtitle="Sign in to manage your account, orders, and saved details."
      />
      <View style={styles.guestActions}>
        <WishlistRow colors={colors} onPress={() => navigation.navigate('Wishlist')} />
        <ThemeToggleRow colors={colors} isDark={isDark} toggleTheme={toggleTheme} />
      </View>
      <Pressable
        style={({ pressed }) => [
          styles.primaryBtn,
          { backgroundColor: colors.primaryBtn },
          pressed && { backgroundColor: colors.primaryBtnPressed },
        ]}
        onPress={() => navigation.navigate('Login')}
      >
        <Text style={[styles.primaryBtnText, { color: colors.primaryBtnText }]}>Sign in</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [
          styles.secondaryBtn,
          { backgroundColor: colors.card, borderColor: colors.border },
          pressed && { opacity: 0.8 },
        ]}
        onPress={() => navigation.navigate('Register')}
      >
        <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Create account</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    padding: 16,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guest: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  guestActions: {
    width: '100%',
    marginTop: 20,
    marginBottom: 8,
  },
  hello: {
    fontSize: 22,
    fontWeight: '700',
  },
  email: {
    fontSize: 14,
    marginTop: 4,
    marginBottom: 18,
  },
  rowCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 14,
  },
  addressInput: {
    minHeight: 88,
  },
  error: {
    fontSize: 14,
    marginBottom: 10,
  },
  primaryBtn: {
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
    width: '100%',
  },
  btnDisabled: {
    opacity: 0.7,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  logoutBtn: {
    marginTop: 12,
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryBtn: {
    marginTop: 12,
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
