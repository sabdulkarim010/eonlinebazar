import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AuthTextInput from '../components/auth/AuthTextInput';
import DistrictUpazilaPicker from '../components/DistrictUpazilaPicker';
import LogoutConfirmModal from '../components/profile/LogoutConfirmModal';
import ProfileAvatar from '../components/profile/ProfileAvatar';
import useAuthStore from '../store/useAuthStore';
import useThemeStore from '../store/useThemeStore';
import useToastStore from '../store/useToastStore';
import { useProfileModuleTokens } from '../theme/profileModuleTokens';
import { useTheme } from '../theme/tokens';
import { maskEmail, maskPhone } from '../utils/maskContact';

const GENDER_MODAL_OPTIONS = ['Select Gender', 'Male', 'Female', 'Other'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);
const YEARS = Array.from({ length: 100 }, (_, index) => new Date().getFullYear() - index);

function formatMemberSince(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatDateOfBirthDisplay(value) {
  if (!value) return 'Select date of birth';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function parseDateOfBirth(value) {
  if (!value) {
    return { day: 1, month: 0, year: 1990 };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      return {
        year: Number(match[1]),
        month: Number(match[2]) - 1,
        day: Number(match[3]),
      };
    }
    return { day: 1, month: 0, year: 1990 };
  }
  return {
    day: date.getDate(),
    month: date.getMonth(),
    year: date.getFullYear(),
  };
}

function toIsoDate(day, month, year) {
  const monthValue = String(month + 1).padStart(2, '0');
  const dayValue = String(day).padStart(2, '0');
  return `${year}-${monthValue}-${dayValue}`;
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

function FieldBadge({ label, type, T }) {
  const palette = {
    readonly: { bg: '#F3F4F6', color: '#6B7280' },
    security: { bg: T.accentBg, color: T.accent },
    autofill: { bg: T.successBg, color: T.success },
  };
  const style = palette[type] || palette.readonly;

  return (
    <View style={[styles.fieldBadge, { backgroundColor: style.bg }]}>
      <Text style={[styles.fieldBadgeText, { color: style.color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function SectionHeader({ icon, title, subtitle, T }) {
  return (
    <View>
      <View style={[styles.sectionHeader, { backgroundColor: '#FFF5EE' }]}>
        <View style={[styles.sectionIconWrap, { backgroundColor: T.accent }]}>
          <Ionicons name={icon} size={18} color="#ffffff" />
        </View>
        <View style={styles.sectionHeaderCopy}>
          <Text style={[styles.sectionTitle, { color: T.text }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.sectionSubtitle, { color: T.sub }]} numberOfLines={2}>
            {subtitle}
          </Text>
        </View>
      </View>
      <View style={styles.sectionDivider} />
    </View>
  );
}

function FormFieldLabel({ label, badge, T }) {
  return (
    <View style={styles.formLabelRow}>
      <Text style={[styles.formLabel, { color: T.sub }]} numberOfLines={1}>
        {label}
      </Text>
      {badge}
    </View>
  );
}

function RadioCircle({ selected, accentColor }) {
  return (
    <View style={styles.radioOuter}>
      {selected ? (
        <View style={[styles.radioInner, { backgroundColor: accentColor }]} />
      ) : null}
    </View>
  );
}

function GenderPickerModal({ visible, selected, accentColor, onSelect, onClose }) {
  const modalSelected = selected || 'Select Gender';

  const handleSelect = (option) => {
    onSelect(option === 'Select Gender' ? '' : option);
    onClose();
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.genderOverlay}>
        <Pressable style={styles.genderBackdrop} onPress={onClose} />
        <View style={styles.genderModalCard}>
          <Text style={styles.genderModalTitle}>Select Gender</Text>
          {GENDER_MODAL_OPTIONS.map((option, index) => (
            <View key={option}>
              <Pressable
                onPress={() => handleSelect(option)}
                style={styles.genderOptionRow}
              >
                <Text style={styles.genderOptionText}>{option}</Text>
                <RadioCircle selected={modalSelected === option} accentColor={accentColor} />
              </Pressable>
              {index < GENDER_MODAL_OPTIONS.length - 1 ? (
                <View style={styles.genderOptionDivider} />
              ) : null}
            </View>
          ))}
        </View>
      </View>
    </Modal>
  );
}

function DateOfBirthModal({
  visible,
  initialValue,
  colors,
  onClose,
  onConfirm,
}) {
  const parsed = parseDateOfBirth(initialValue);
  const [day, setDay] = useState(parsed.day);
  const [month, setMonth] = useState(parsed.month);
  const [year, setYear] = useState(parsed.year);

  useEffect(() => {
    if (!visible) return;
    const next = parseDateOfBirth(initialValue);
    setDay(next.day);
    setMonth(next.month);
    setYear(next.year);
  }, [visible, initialValue]);

  const renderColumn = (title, data, selected, onSelect, formatLabel = (item) => String(item)) => (
    <View style={styles.dobColumn}>
      <Text style={[styles.dobColumnTitle, { color: colors.muted }]}>{title}</Text>
      <FlatList
        data={data}
        keyExtractor={(item) => String(item)}
        showsVerticalScrollIndicator={false}
        style={styles.dobList}
        renderItem={({ item }) => {
          const isSelected = item === selected;
          return (
            <Pressable
              onPress={() => onSelect(item)}
              style={[
                styles.dobOption,
                isSelected && { backgroundColor: colors.accentBg, borderColor: colors.accent },
              ]}
            >
              <Text
                style={[
                  styles.dobOptionText,
                  { color: isSelected ? colors.accent : colors.text },
                ]}
                numberOfLines={1}
              >
                {formatLabel(item)}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.dobOverlay}>
        <View style={[styles.dobSheet, { backgroundColor: colors.card }]}>
          <View style={[styles.dobHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.dobTitle, { color: colors.text }]}>Date of Birth</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={[styles.dobClose, { color: colors.link }]}>Cancel</Text>
            </Pressable>
          </View>

          <View style={styles.dobColumns}>
            {renderColumn('Day', DAYS, day, setDay)}
            {renderColumn(
              'Month',
              MONTHS.map((_, index) => index),
              month,
              setMonth,
              (item) => MONTHS[item]
            )}
            {renderColumn('Year', YEARS, year, setYear)}
          </View>

          <TouchableOpacity
            style={[styles.dobConfirm, { backgroundColor: colors.accent }]}
            onPress={() => onConfirm(toIsoDate(day, month, year))}
          >
            <Text style={styles.dobConfirmText}>Confirm</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function AccountControlRow({
  label,
  value,
  onPress,
  danger = false,
  isLast = false,
  T,
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.controlRow,
        !isLast && styles.controlRowBorder,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.controlCopy}>
        <Text style={[styles.controlLabel, { color: T.sub }]} numberOfLines={1}>
          {label}
        </Text>
        <Text
          style={[styles.controlValue, { color: danger ? T.danger : T.text }]}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={danger ? T.danger : T.muted}
      />
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
  const uploadAvatar = useAuthStore((state) => state.uploadAvatar);
  const logout = useAuthStore((state) => state.logout);
  const showToast = useToastStore((state) => state.showToast);

  const [name, setName] = useState(user?.name || '');
  const [gender, setGender] = useState(user?.gender || '');
  const [dateOfBirth, setDateOfBirth] = useState(user?.dateOfBirth || '');
  const [district, setDistrict] = useState(user?.district || '');
  const [upazila, setUpazila] = useState(user?.upazila || user?.thana || '');
  const [fullAddress, setFullAddress] = useState(
    user?.fullAddress || user?.address || ''
  );

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showGenderPicker, setShowGenderPicker] = useState(false);
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    setName(user?.name || '');
    setGender(user?.gender || '');
    setDateOfBirth(user?.dateOfBirth || '');
    setDistrict(user?.district || '');
    setUpazila(user?.upazila || user?.thana || '');
    setFullAddress(user?.fullAddress || user?.address || '');
  }, [
    user?.id,
    user?.name,
    user?.gender,
    user?.dateOfBirth,
    user?.district,
    user?.upazila,
    user?.thana,
    user?.fullAddress,
    user?.address,
  ]);

  const healthScore = computeAccountHealth(user);
  const isVerifiedBuyer = Boolean(user?.isVerified);

  const formColors = useMemo(() => ({
    ...themeColors,
    inputBg: '#ffffff',
    border: '#E5E7EB',
  }), [themeColors]);

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

  const handleDistrictChange = (value) => {
    setDistrict(value);
    setUpazila('');
  };

  const handleSaveProfile = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast('Full name is required.', 'error');
      return;
    }
    if (upazila && !district) {
      showToast('Please select a district before choosing upazila / thana.', 'error');
      return;
    }

    setSaving(true);
    const result = await updateProfile({
      name: trimmedName,
      gender,
      dateOfBirth,
      district,
      upazila,
      thana: upazila,
      fullAddress: fullAddress.trim(),
    });
    setSaving(false);

    if (result.success) {
      showToast(result.message || 'Profile updated successfully', 'success');
      return;
    }
    showToast(result.message || 'Could not update profile.', 'error');
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
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: 88 + Math.max(insets.bottom, 12) },
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
              {name.trim() || user?.name || 'Your account'}
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

          <SectionHeader
            icon="person-circle-outline"
            title="Personal Information"
            subtitle="Update your basic profile details"
            T={T}
          />

          <View style={[styles.formSection, { backgroundColor: T.card }]}>
            <AuthTextInput
              colors={formColors}
              label="Full Name"
              icon="person-outline"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              placeholder="Your full name"
            />

            <View style={styles.formField}>
              <FormFieldLabel
                label="Email Address"
                badge={<FieldBadge label="READ ONLY" type="readonly" T={T} />}
                T={T}
              />
              <AuthTextInput
                colors={formColors}
                label=""
                icon="mail-outline"
                value={user?.email ? maskEmail(user.email) : '—'}
                editable={false}
              />
            </View>

            <View style={styles.formField}>
              <FormFieldLabel
                label="Phone Number"
                badge={<FieldBadge label="SECURITY" type="security" T={T} />}
                T={T}
              />
              <AuthTextInput
                colors={formColors}
                label=""
                icon="call-outline"
                value={user?.mobile ? maskPhone(user.mobile) : 'Add phone'}
                editable={false}
              />
            </View>

            <View style={styles.formField}>
              <FormFieldLabel label="Gender" T={T} />
              <Pressable
                onPress={() => setShowGenderPicker(true)}
                style={[styles.pickerField, { backgroundColor: '#ffffff', borderColor: '#E5E7EB' }]}
              >
                <Text style={{ color: gender ? T.text : T.muted, fontSize: 16, flex: 1 }}>
                  {gender || 'Select gender'}
                </Text>
                <Ionicons name="chevron-down" size={18} color={T.muted} />
              </Pressable>
            </View>

            <View style={styles.formField}>
              <FormFieldLabel label="Date of Birth" T={T} />
              <Pressable
                onPress={() => setShowDobPicker(true)}
                style={[styles.pickerField, { backgroundColor: '#ffffff', borderColor: '#E5E7EB' }]}
              >
                <Text style={{ color: dateOfBirth ? T.text : T.muted, fontSize: 16, flex: 1 }}>
                  {formatDateOfBirthDisplay(dateOfBirth)}
                </Text>
                <Ionicons name="calendar-outline" size={18} color={T.muted} />
              </Pressable>
            </View>

            <View style={styles.readOnlyRow}>
              <Text style={[styles.readOnlyLabel, { color: T.sub }]}>Member Since</Text>
              <Text style={[styles.readOnlyValue, { color: T.text }]}>
                {formatMemberSince(user?.memberSince || user?.createdAt)}
              </Text>
            </View>
          </View>

          <SectionHeader
            icon="car-outline"
            title="Shipping & Location"
            subtitle="Delivery address and location details"
            T={T}
          />

          <View style={[styles.formSection, { backgroundColor: T.card }]}>
            <View style={styles.formField}>
              <FormFieldLabel
                label="District"
                badge={<FieldBadge label="AUTO-FILL READY" type="autofill" T={T} />}
                T={T}
              />
              <DistrictUpazilaPicker
                district={district}
                upazila={upazila}
                colors={formColors}
                onDistrictChange={handleDistrictChange}
                onUpazilaChange={setUpazila}
              />
            </View>

            <View style={styles.formField}>
              <FormFieldLabel label="Full Address" T={T} />
              <TextInput
                value={fullAddress}
                onChangeText={setFullAddress}
                placeholder="House, road, area details"
                placeholderTextColor={T.muted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                style={[
                  styles.multilineInput,
                  {
                    color: T.text,
                    backgroundColor: '#ffffff',
                    borderColor: '#E5E7EB',
                  },
                ]}
              />
            </View>
          </View>

          <SectionHeader
            icon="settings-outline"
            title="Account Controls"
            subtitle="Sign out or permanently delete your account"
            T={T}
          />

          <View style={[styles.controlsCard, { backgroundColor: T.card, borderColor: T.border }]}>
            <AccountControlRow
              label="Log Out"
              value="Sign out of this device"
              onPress={() => setShowLogout(true)}
              T={T}
            />
            <AccountControlRow
              label="Delete Account"
              value="Permanently remove your account"
              onPress={() => navigation.navigate('DeleteAccount')}
              danger
              isLast
              T={T}
            />
          </View>
        </ScrollView>

        <View
          style={[
            styles.footer,
            {
              paddingBottom: Math.max(insets.bottom, 12),
              backgroundColor: T.bg,
              borderTopColor: '#F0F0F0',
            },
          ]}
        >
          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: T.accent }]}
            onPress={handleSaveProfile}
            disabled={saving}
            activeOpacity={0.88}
          >
            {saving ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.saveButtonText}>💾 Update Profile</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <GenderPickerModal
        visible={showGenderPicker}
        selected={gender}
        accentColor={T.accent}
        onSelect={setGender}
        onClose={() => setShowGenderPicker(false)}
      />

      <DateOfBirthModal
        visible={showDobPicker}
        initialValue={dateOfBirth}
        colors={themeColors}
        onClose={() => setShowDobPicker(false)}
        onConfirm={(value) => {
          setDateOfBirth(value);
          setShowDobPicker(false);
        }}
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
  flex: { flex: 1 },
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 0,
  },
  sectionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '500',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginBottom: 12,
  },
  formSection: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
  },
  formField: {
    marginBottom: 4,
  },
  formLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  fieldBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  fieldBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  genderOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  genderBackdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  genderModalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginHorizontal: 24,
    width: '100%',
    maxWidth: 360,
    overflow: 'hidden',
  },
  genderModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    padding: 20,
    paddingBottom: 16,
    color: '#0f172a',
  },
  genderOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
    paddingHorizontal: 20,
  },
  genderOptionText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#0f172a',
    flex: 1,
  },
  genderOptionDivider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginHorizontal: 20,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  pickerField: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    height: 52,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  readOnlyRow: {
    paddingVertical: 12,
    gap: 4,
  },
  readOnlyLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  readOnlyValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  multilineInput: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 104,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 4,
  },
  controlsCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: 20,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  controlRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  controlCopy: {
    flex: 1,
    gap: 4,
  },
  controlLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  controlValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  rowPressed: {
    opacity: 0.88,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  saveButton: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  dobOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  dobSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 24,
    maxHeight: '70%',
  },
  dobHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  dobTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  dobClose: {
    fontSize: 16,
    fontWeight: '600',
  },
  dobColumns: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 12,
    gap: 8,
    minHeight: 220,
  },
  dobColumn: {
    flex: 1,
  },
  dobColumnTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 8,
    textAlign: 'center',
  },
  dobList: {
    maxHeight: 180,
  },
  dobOption: {
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginBottom: 4,
    alignItems: 'center',
  },
  dobOptionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  dobConfirm: {
    marginHorizontal: 16,
    marginTop: 12,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dobConfirmText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
