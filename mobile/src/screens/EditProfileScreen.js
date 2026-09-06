import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LogoutConfirmModal from '../components/profile/LogoutConfirmModal';
import ProfileAvatar from '../components/profile/ProfileAvatar';
import ProfileEditSheet from '../components/profile/ProfileEditSheet';
import useAuthStore from '../store/useAuthStore';
import useThemeStore from '../store/useThemeStore';
import useToastStore from '../store/useToastStore';
import { useProfileModuleTokens } from '../theme/profileModuleTokens';
import { useTheme } from '../theme/tokens';
import { maskEmail, maskPhone } from '../utils/maskContact';

function formatMemberSince(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function computeAccountHealth(user) {
  const checks = [
    Boolean(String(user?.name || '').trim()),
    Boolean(user?.email),
    Boolean(user?.isVerified),
    Boolean(user?.mobile),
    Boolean(user?.avatar),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function VerifiedPill({ verified, T }) {
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: verified ? T.successBg : T.iconBg },
      ]}
    >
      <Text
        style={[
          styles.pillText,
          { color: verified ? T.success : T.muted },
        ]}
        numberOfLines={1}
      >
        {verified ? 'Verified' : 'Unverified'}
      </Text>
    </View>
  );
}

function SettingsRow({
  label,
  value,
  badge,
  onPress,
  showChevron = true,
  isLast = false,
  danger = false,
  T,
}) {
  const content = (
    <View
      style={[
        styles.settingsRow,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.border },
      ]}
    >
      <View style={styles.settingsCopy}>
        <Text style={[styles.settingsLabel, { color: T.sub }]} numberOfLines={1}>
          {label}
        </Text>
        <View style={styles.settingsValueRow}>
          <Text
            style={[
              styles.settingsValue,
              { color: danger ? T.danger : T.text },
            ]}
            numberOfLines={1}
          >
            {value}
          </Text>
          {badge}
        </View>
      </View>
      {showChevron ? (
        <Ionicons
          name={danger ? 'chevron-forward' : 'create-outline'}
          size={18}
          color={danger ? T.danger : T.muted}
        />
      ) : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.rowPressed]}
    >
      {content}
    </Pressable>
  );
}

export default function EditProfileScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const isDark = useThemeStore((state) => state.mode === 'dark');
  const T = useProfileModuleTokens(isDark);
  const themeColors = useTheme();

  const user = useAuthStore((state) => state.user);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const requestContactOtp = useAuthStore((state) => state.requestContactOtp);
  const verifyContactOtp = useAuthStore((state) => state.verifyContactOtp);
  const uploadAvatar = useAuthStore((state) => state.uploadAvatar);
  const logout = useAuthStore((state) => state.logout);
  const showToast = useToastStore((state) => state.showToast);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [editType, setEditType] = useState(null);
  const [showLogout, setShowLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const healthScore = computeAccountHealth(user);
  const isVerifiedBuyer = Boolean(user?.isVerified);
  const phoneVerified = Boolean(user?.mobileVerified || user?.phoneVerified || user?.mobile);

  const uploadPickedAsset = async (asset) => {
    if (!asset?.uri) return;
    setUploadingAvatar(true);
    const result = await uploadAvatar(asset);
    setUploadingAvatar(false);
    if (!result.success) {
      showToast(result.message || 'Could not update photo.', 'error');
      return;
    }
    showToast(result.message || 'Profile photo updated.', 'success');
  };

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast('Photo library permission is required.', 'error');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    await uploadPickedAsset(result.assets[0]);
  };

  const pickFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      showToast('Camera permission is required.', 'error');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    await uploadPickedAsset(result.assets[0]);
  };

  const handleAvatarPress = () => {
    Alert.alert('Change profile photo', 'Choose a photo source', [
      { text: 'Photo library', onPress: pickFromLibrary },
      { text: 'Camera', onPress: pickFromCamera },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleSaveName = async (name) => {
    const result = await updateProfile({ name });
    if (result.success) {
      showToast(result.message || 'Profile updated.', 'success');
    }
    return result;
  };

  const handleRequestOtp = async (type, value) => {
    const result = await requestContactOtp(type, value);
    if (result.success) {
      showToast(result.message || 'Verification code sent.', 'success');
    }
    return result;
  };

  const handleVerifyOtp = async (otp) => {
    const result = await verifyContactOtp(otp);
    if (result.success) {
      showToast(result.message || 'Contact updated.', 'success');
    }
    return result;
  };

  const confirmLogout = async () => {
    setLoggingOut(true);
    await logout();
    setLoggingOut(false);
    setShowLogout(false);
    showToast('Logged out successfully.', 'success');
    navigation.goBack();
  };

  return (
    <View style={[styles.root, { backgroundColor: T.bg }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: Math.max(insets.bottom, 24) },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.identityCard,
            {
              backgroundColor: T.card,
              shadowColor: T.shadow,
            },
          ]}
        >
          <ProfileAvatar
            user={user}
            size={96}
            dark={isDark}
            editable
            uploading={uploadingAvatar}
            onPress={handleAvatarPress}
            accentColor={T.accent}
          />

          <Text style={[styles.displayName, { color: T.text }]} numberOfLines={2}>
            {user?.name || 'Your account'}
          </Text>

          <View style={styles.badgeRow}>
            {isVerifiedBuyer ? (
              <View style={[styles.statusPill, { backgroundColor: T.successBg }]}>
                <Ionicons name="shield-checkmark" size={14} color={T.success} />
                <Text style={[styles.statusPillText, { color: T.success }]} numberOfLines={1}>
                  Verified Buyer
                </Text>
              </View>
            ) : (
              <View style={[styles.statusPill, { backgroundColor: T.accentBg }]}>
                <Ionicons name="person-outline" size={14} color={T.accent} />
                <Text style={[styles.statusPillText, { color: T.accent }]} numberOfLines={1}>
                  Member
                </Text>
              </View>
            )}
          </View>

          <View style={[styles.healthBar, { backgroundColor: T.iconBg }]}>
            <View style={styles.healthHeader}>
              <Ionicons name="shield-checkmark" size={16} color={T.success} />
              <Text style={[styles.healthLabel, { color: T.text }]} numberOfLines={1}>
                Account Health: {healthScore}% Secured
              </Text>
            </View>
            <View style={[styles.healthTrack, { backgroundColor: T.border }]}>
              <View
                style={[
                  styles.healthFill,
                  {
                    width: `${healthScore}%`,
                    backgroundColor: healthScore >= 80 ? T.success : T.accent,
                  },
                ]}
              />
            </View>
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: T.muted }]}>ACCOUNT INFORMATION</Text>
        <View style={[styles.settingsCard, { backgroundColor: T.card, borderColor: T.border }]}>
          <SettingsRow
            label="Full Name"
            value={user?.name || '—'}
            onPress={() => setEditType('name')}
            T={T}
          />
          <SettingsRow
            label="Email Address"
            value={user?.email ? maskEmail(user.email) : '—'}
            badge={<VerifiedPill verified={isVerifiedBuyer} T={T} />}
            onPress={() => setEditType('email')}
            T={T}
          />
          <SettingsRow
            label="Phone Number"
            value={user?.mobile ? maskPhone(user.mobile) : 'Add phone'}
            badge={<VerifiedPill verified={phoneVerified} T={T} />}
            onPress={() => setEditType('mobile')}
            T={T}
          />
          <SettingsRow
            label="Member Since"
            value={formatMemberSince(user?.memberSince || user?.createdAt)}
            showChevron={false}
            isLast
            T={T}
          />
        </View>

        <Text style={[styles.sectionLabel, { color: T.muted }]}>ACCOUNT CONTROLS & DANGER ZONE</Text>
        <View style={[styles.settingsCard, { backgroundColor: T.card, borderColor: T.border }]}>
          <SettingsRow
            label="Log Out"
            value="Sign out of this device"
            onPress={() => setShowLogout(true)}
            T={T}
          />
          <SettingsRow
            label="Delete Account"
            value="Permanently remove your account"
            onPress={() => navigation.navigate('DeleteAccount')}
            danger
            isLast
            T={T}
          />
        </View>
      </ScrollView>

      <ProfileEditSheet
        visible={Boolean(editType)}
        type={editType}
        initialValue={user?.name || ''}
        colors={themeColors}
        onClose={() => setEditType(null)}
        onSaveName={handleSaveName}
        onRequestOtp={handleRequestOtp}
        onVerifyOtp={handleVerifyOtp}
      />

      <LogoutConfirmModal
        visible={showLogout}
        colors={themeColors}
        loading={loggingOut}
        onCancel={() => setShowLogout(false)}
        onConfirm={confirmLogout}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  identityCard: {
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  displayName: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 14,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  healthBar: {
    width: '100%',
    marginTop: 16,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  healthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  healthLabel: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  healthTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  healthFill: {
    height: '100%',
    borderRadius: 3,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  settingsCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: 20,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  settingsCopy: {
    flex: 1,
    gap: 4,
  },
  settingsLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  settingsValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  settingsValue: {
    fontSize: 16,
    fontWeight: '600',
    flexShrink: 1,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  rowPressed: {
    opacity: 0.88,
  },
});
