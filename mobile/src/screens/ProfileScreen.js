import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { memo, useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProfileAvatar from '../components/profile/ProfileAvatar';
import LogoutConfirmModal from '../components/profile/LogoutConfirmModal';
import useAuthStore from '../store/useAuthStore';
import useOrderStore from '../store/useOrderStore';
import useThemeStore from '../store/useThemeStore';
import useToastStore from '../store/useToastStore';
import useWishlistStore from '../store/useWishlistStore';
import useLanguageStore, { useTranslation } from '../store/useLanguageStore';
import { useTheme } from '../theme/tokens';
import { haptic } from '../utils/haptics';
import { heroContactLine, heroContactIsPhone } from '../utils/maskContact';

const MENU_SECTIONS = [
  {
    key: 'shopping',
    label: 'SHOPPING & UTILITIES',
    items: [
      {
        key: 'orders',
        icon: 'cube-outline',
        label: 'My Orders',
        screen: 'Orders',
        color: '#3b82f6',
        bg: '#eff6ff',
        darkBg: '#0c1a33',
      },
      {
        key: 'wishlist',
        icon: 'heart-outline',
        label: 'My Wishlist',
        screen: 'Wishlist',
        color: '#ef4444',
        bg: '#fef2f2',
        darkBg: '#1e0a0a',
      },
      {
        key: 'addresses',
        icon: 'location-outline',
        label: 'Saved Addresses',
        screen: 'Addresses',
        color: '#10b981',
        bg: '#ecfdf5',
        darkBg: '#052e16',
      },
      {
        key: 'notebook',
        icon: 'book-outline',
        label: 'My Notebook',
        screen: 'Notebook',
        color: '#8b5cf6',
        bg: '#f5f3ff',
        darkBg: '#1a0a3e',
      },
    ],
  },
  {
    key: 'account',
    label: 'ACCOUNT & SECURITY',
    items: [
      {
        key: 'edit-profile',
        icon: 'person-outline',
        label: 'Personal Info',
        screen: 'EditProfile',
        color: '#3b82f6',
        bg: '#eff6ff',
        darkBg: '#0c1a33',
      },
      {
        key: 'security',
        icon: 'shield-checkmark-outline',
        label: 'Security Settings',
        screen: 'SecuritySettings',
        color: '#0ea5e9',
        bg: '#ecfeff',
        darkBg: '#042f2e',
      },
      {
        key: 'password',
        icon: 'lock-closed-outline',
        label: 'Change Password',
        screen: 'ChangePassword',
        color: '#8b5cf6',
        bg: '#f5f3ff',
        darkBg: '#1a0a3e',
      },
      {
        key: 'delete',
        icon: 'trash-outline',
        label: 'Delete Account',
        screen: 'DeleteAccount',
        color: '#ef4444',
        bg: '#fef2f2',
        darkBg: '#1e0a0a',
        danger: true,
      },
    ],
  },
  {
    key: 'support',
    label: 'SUPPORT & HELP',
    items: [
      {
        key: 'live-support',
        icon: 'chatbubbles-outline',
        label: 'Live Support',
        screen: 'LiveSupport',
        color: '#10b981',
        bg: '#ecfdf5',
        darkBg: '#052e16',
      },
      {
        key: 'privacy',
        icon: 'shield-outline',
        label: 'Privacy Policy',
        screen: 'Legal',
        params: { slug: 'privacy-policy', title: 'Privacy Policy' },
        color: '#64748b',
        bg: '#f8fafc',
        darkBg: '#1e293b',
      },
      {
        key: 'terms',
        icon: 'document-text-outline',
        label: 'Terms & Conditions',
        screen: 'Legal',
        params: { slug: 'terms-conditions', title: 'Terms & Conditions' },
        color: '#64748b',
        bg: '#f8fafc',
        darkBg: '#1e293b',
      },
      {
        key: 'returns',
        icon: 'return-down-back-outline',
        label: 'Return Policy',
        screen: 'Legal',
        params: { slug: 'return-policy', title: 'Return Policy' },
        color: '#64748b',
        bg: '#f8fafc',
        darkBg: '#1e293b',
      },
      {
        key: 'contact',
        icon: 'call-outline',
        label: 'Contact Us',
        screen: 'Legal',
        params: { slug: 'contact', title: 'Contact Us' },
        color: '#64748b',
        bg: '#f8fafc',
        darkBg: '#1e293b',
      },
    ],
  },
];

function StatItem({ label, value, icon, color, T, onPress }) {
  const content = (
    <View style={styles.statItem}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.statValue, { color: T.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: T.muted }]}>{label}</Text>
    </View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={styles.statPressable}>
        {content}
      </Pressable>
    );
  }
  return <View style={styles.statPressable}>{content}</View>;
}

function MenuRow({ item, dark, T, isLast, onPress }) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        style={[
          styles.menuRow,
          isLast && styles.menuRowLast,
          { borderBottomColor: T.border },
        ]}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      >
        <View
          style={[
            styles.iconBox,
            { backgroundColor: dark ? item.darkBg : item.bg },
          ]}
        >
          <Ionicons
            name={item.icon}
            size={18}
            color={item.danger ? T.danger : item.color}
          />
        </View>
        <Text
          style={[
            styles.menuLabel,
            { color: item.danger ? T.danger : T.text },
          ]}
        >
          {item.label}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={T.muted} />
      </Pressable>
    </Animated.View>
  );
}

function GuestView({ navigation, dark, T, toggleTheme, lang, setLanguage, t }) {
  return (
    <View style={[styles.root, styles.guestRoot, { backgroundColor: T.bg }]}>
      <View style={[styles.guestCard, { backgroundColor: T.card, shadowColor: T.shadow }]}>
        <View style={[styles.guestIconWrap, { backgroundColor: T.guestIconBg }]}>
          <Ionicons name="person-circle-outline" size={80} color={T.muted} />
        </View>
        <Text style={[styles.guestTitle, { color: T.text }]}>
          Welcome to EOnlineBazar
        </Text>
        <Text style={[styles.guestSub, { color: T.sub }]}>
          Sign in to access your orders, wishlist, and saved addresses.
        </Text>
        <Pressable
          style={[styles.guestLoginBtn, { backgroundColor: T.accent, shadowColor: T.accent }]}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.guestLoginText}>Sign In</Text>
        </Pressable>
        <Pressable
          style={[styles.guestRegBtn, { borderColor: T.border }]}
          onPress={() => navigation.navigate('Register')}
        >
          <Text style={[styles.guestRegText, { color: T.text }]}>Create Account</Text>
        </Pressable>
      </View>
      <Pressable style={styles.themeToggleGuest} onPress={toggleTheme}>
        <Ionicons
          name={dark ? 'moon' : 'sunny-outline'}
          size={20}
          color={T.sub}
        />
        <Text style={[styles.themeToggleText, { color: T.sub }]}>
          {dark ? 'Dark Mode' : 'Light Mode'}
        </Text>
      </Pressable>
      <View style={[styles.guestLangRow, { borderColor: T.border }]}>
        <Text style={[styles.themeToggleText, { color: T.sub }]}>{t('profile.language')}</Text>
        <View style={[styles.langSwitch, { backgroundColor: T.iconBg, borderColor: T.border }]}>
          <Pressable
            style={[styles.langOption, lang === 'en' && { backgroundColor: T.accent }]}
            onPress={() => setLanguage('en')}
          >
            <Text style={[styles.langOptionText, { color: lang === 'en' ? '#ffffff' : T.sub }]}>EN</Text>
          </Pressable>
          <Pressable
            style={[styles.langOption, lang === 'bn' && { backgroundColor: T.accent }]}
            onPress={() => setLanguage('bn')}
          >
            <Text style={[styles.langOptionText, { color: lang === 'bn' ? '#ffffff' : T.sub }]}>বাং</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ProfileScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const T = useTheme();
  const isDark = useThemeStore((state) => state.mode === 'dark');
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const isHydrating = useAuthStore((state) => state.isHydrating);
  const logout = useAuthStore((state) => state.logout);
  const refreshProfile = useAuthStore((state) => state.refreshProfile);
  const uploadAvatar = useAuthStore((state) => state.uploadAvatar);
  const showToast = useToastStore((state) => state.showToast);
  const wishlistCount = useWishlistStore((state) => state.items.length);
  const ordersCount = useOrderStore((state) => state.orders.length);
  const { lang, t } = useTranslation();
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const [showLogout, setShowLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const isLoggedIn = Boolean(token && user);

  useFocusEffect(
    useCallback(() => {
      if (!isLoggedIn) return undefined;
      refreshProfile?.();
      return undefined;
    }, [isLoggedIn, refreshProfile])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshProfile?.();
    setRefreshing(false);
  };

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

  const confirmLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    await logout();
    setLoggingOut(false);
    setShowLogout(false);
    showToast('Logged out successfully.', 'success');
  };

  if (isHydrating && !isLoggedIn) {
    return (
      <View style={[styles.centered, { backgroundColor: T.bg }]}>
        <ActivityIndicator size="large" color={T.accent} />
      </View>
    );
  }

  if (!isLoggedIn) {
    return (
      <View style={[styles.root, { backgroundColor: T.bg, paddingTop: insets.top }]}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={T.bg}
        />
        <GuestView
          navigation={navigation}
          dark={isDark}
          T={T}
          toggleTheme={toggleTheme}
          lang={lang}
          setLanguage={setLanguage}
          t={t}
        />
      </View>
    );
  }

  const memberYear = user?.memberSince
    ? new Date(user.memberSince).getFullYear()
    : null;
  const displayOrders = Math.max(Number(user?.ordersCount || 0), ordersCount);
  const displayWishlist = Math.max(Number(user?.wishlistCount || 0), wishlistCount);
  const walletLabel = `৳${Number(user?.walletBalance || 0).toLocaleString('en-US')}`;
  const contactLine = heroContactLine(user);
  const contactIsPhone = heroContactIsPhone(user);

  return (
    <View style={[styles.root, { backgroundColor: T.bg }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={T.header}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={T.accent}
            colors={[T.accent]}
          />
        )}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 8 }]}
      >
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: T.heroBg,
              shadowColor: T.shadow,
            },
          ]}
        >
          <View style={[styles.heroDeco, { backgroundColor: T.accentBg }]} />

          <View style={styles.heroInner}>
            <View style={styles.avatarCol}>
              <ProfileAvatar
                user={user}
                size={80}
                dark={isDark}
                editable
                uploading={uploadingAvatar}
                onPress={handleAvatarPress}
                accentColor={T.accent}
              />
              {memberYear ? (
                <View style={[styles.memberBadge, { backgroundColor: T.accentBg }]}>
                  <Text style={[styles.memberText, { color: T.accent }]}>
                    Since {memberYear}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.heroInfo}>
              <Text style={[styles.heroName, { color: T.text }]} numberOfLines={1}>
                {user?.name || 'My Account'}
              </Text>
              {contactLine ? (
                <View style={styles.contactRow}>
                  {contactIsPhone ? (
                    <View style={[styles.phoneBadge, { backgroundColor: T.iconBg, borderColor: T.border }]}>
                      <Ionicons name="call-outline" size={11} color={T.accent} />
                    </View>
                  ) : null}
                  <Text style={[styles.heroContact, { color: T.sub }]} numberOfLines={1}>
                    {contactLine}
                  </Text>
                </View>
              ) : null}

              {user?.isVerified ? (
                <View style={[styles.chip, { backgroundColor: T.chipVerifiedBg }]}>
                  <Ionicons name="shield-checkmark" size={12} color={T.chipVerifiedText} />
                  <Text style={[styles.chipText, { color: T.chipVerifiedText }]}>
                    Verified
                  </Text>
                </View>
              ) : (
                <View style={[styles.chip, { backgroundColor: T.chipUnverifiedBg }]}>
                  <Ionicons name="mail-unread-outline" size={12} color={T.chipUnverifiedText} />
                  <Text style={[styles.chipText, { color: T.chipUnverifiedText }]}>
                    Unverified Email
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={[styles.statsRow, { borderTopColor: T.border }]}>
            <StatItem
              label="Orders"
              value={displayOrders}
              icon="cube-outline"
              color="#3b82f6"
              T={T}
              onPress={() => navigation.navigate('Orders')}
            />
            <View style={[styles.statDiv, { backgroundColor: T.border }]} />
            <StatItem
              label="Wishlist"
              value={displayWishlist}
              icon="heart-outline"
              color="#ef4444"
              T={T}
              onPress={() => navigation.navigate('Wishlist')}
            />
            <View style={[styles.statDiv, { backgroundColor: T.border }]} />
            <StatItem
              label="Points"
              value={Number(user?.loyaltyPoints || 0).toLocaleString('en-US')}
              icon="star-outline"
              color="#f59e0b"
              T={T}
              onPress={() => navigation.navigate('LoyaltyPoints')}
            />
            <View style={[styles.statDiv, { backgroundColor: T.border }]} />
            <StatItem
              label="Wallet"
              value={walletLabel}
              icon="wallet-outline"
              color="#10b981"
              T={T}
              onPress={() => navigation.navigate('Wallet')}
            />
          </View>
        </View>

        {MENU_SECTIONS.map((section) => (
          <View key={section.key} style={styles.section}>
            <Text style={[styles.sectionLabel, { color: T.sectionLabel }]}>
              {section.label}
            </Text>
            <View
              style={[
                styles.sectionCard,
                {
                  backgroundColor: T.card,
                  shadowColor: T.shadow,
                },
              ]}
            >
              {section.items.map((item, idx) => (
                <MenuRow
                  key={item.key}
                  item={item}
                  dark={isDark}
                  T={T}
                  isLast={idx === section.items.length - 1}
                  onPress={() => {
                    haptic.light();
                    if (item.params) {
                      navigation.navigate(item.screen, item.params);
                    } else {
                      navigation.navigate(item.screen);
                    }
                  }}
                />
              ))}
            </View>
          </View>
        ))}

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: T.sectionLabel }]}>
            PREFERENCES
          </Text>
          <View
            style={[
              styles.sectionCard,
              {
                backgroundColor: T.card,
                shadowColor: T.shadow,
              },
            ]}
          >
            <View style={[styles.menuRow, { borderBottomColor: T.border }]}>
              <View style={[styles.iconBox, { backgroundColor: T.iconBg }]}>
                <Ionicons name="language-outline" size={18} color="#6366f1" />
              </View>
              <Text style={[styles.menuLabel, { color: T.text }]}>
                {t('profile.language')}
              </Text>
              <View style={[styles.langSwitch, { backgroundColor: T.iconBg, borderColor: T.border }]}>
                <Pressable
                  style={[
                    styles.langOption,
                    lang === 'en' && { backgroundColor: T.accent },
                  ]}
                  onPress={() => setLanguage('en')}
                >
                  <Text style={[styles.langOptionText, { color: lang === 'en' ? '#ffffff' : T.sub }]}>
                    EN
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.langOption,
                    lang === 'bn' && { backgroundColor: T.accent },
                  ]}
                  onPress={() => setLanguage('bn')}
                >
                  <Text style={[styles.langOptionText, { color: lang === 'bn' ? '#ffffff' : T.sub }]}>
                    বাং
                  </Text>
                </Pressable>
              </View>
            </View>
            <View style={[styles.menuRow, styles.menuRowLast]}>
              <View style={[styles.iconBox, { backgroundColor: T.iconBg }]}>
                <Ionicons
                  name={isDark ? 'moon' : 'sunny-outline'}
                  size={18}
                  color={isDark ? '#818cf8' : '#f59e0b'}
                />
              </View>
              <Text style={[styles.menuLabel, { color: T.text }]}>
                {isDark ? 'Dark Mode' : 'Light Mode'}
              </Text>
              <Pressable
                onPress={toggleTheme}
                style={[
                  styles.toggle,
                  { backgroundColor: isDark ? T.accent : T.border },
                ]}
              >
                <View
                  style={[
                    styles.toggleThumb,
                    {
                      left: isDark ? 22 : 2,
                      backgroundColor: T.toggleThumb,
                    },
                  ]}
                />
              </Pressable>
            </View>
          </View>
        </View>

        <Pressable
          style={[styles.logoutBtn, { borderColor: T.danger }]}
          onPress={() => setShowLogout(true)}
        >
          <Ionicons name="log-out-outline" size={18} color={T.danger} />
          <Text style={[styles.logoutText, { color: T.danger }]}>Sign Out</Text>
        </Pressable>

        <Text style={[styles.versionText, { color: T.muted }]}>
          EOnlineBazar v1.0 · All rights reserved
        </Text>
      </ScrollView>

      <LogoutConfirmModal
        visible={showLogout}
        colors={T}
        loading={loggingOut}
        onCancel={() => setShowLogout(false)}
        onConfirm={confirmLogout}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { paddingBottom: 40 },

  heroCard: {
    margin: 16,
    marginBottom: 8,
    borderRadius: 20,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 4,
  },
  heroDeco: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
    opacity: 0.5,
  },
  heroInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 20,
    gap: 14,
  },
  avatarCol: { alignItems: 'center', gap: 8 },
  memberBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  memberText: { fontSize: 10, fontWeight: '700' },
  heroInfo: { flex: 1, gap: 4, paddingTop: 4 },
  heroName: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    maxWidth: '100%',
  },
  phoneBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroContact: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: 4,
  },
  chipText: { fontSize: 11, fontWeight: '700' },

  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingVertical: 16,
  },
  statPressable: { flex: 1 },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 16, fontWeight: '800' },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  statDiv: { width: 1, marginVertical: 8 },

  section: { paddingHorizontal: 16, marginBottom: 8 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionCard: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },

  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuRowLast: { borderBottomWidth: 0 },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '500' },

  toggle: {
    width: 46,
    height: 26,
    borderRadius: 13,
    position: 'relative',
  },
  toggleThumb: {
    position: 'absolute',
    top: 3,
    width: 20,
    height: 20,
    borderRadius: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  langSwitch: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 10,
    padding: 2,
    gap: 2,
  },
  langOption: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 42,
    alignItems: 'center',
  },
  langOptionText: {
    fontSize: 12,
    fontWeight: '800',
  },

  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  logoutText: { fontSize: 15, fontWeight: '700' },

  versionText: {
    textAlign: 'center',
    fontSize: 11,
    marginTop: 16,
    marginBottom: 8,
  },

  guestRoot: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  guestCard: {
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    gap: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 4,
  },
  guestIconWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  guestTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  guestSub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  guestLoginBtn: {
    width: '100%',
    borderRadius: 12,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  guestLoginText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  guestRegBtn: {
    width: '100%',
    borderWidth: 1.5,
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guestRegText: { fontSize: 15, fontWeight: '600' },
  themeToggleGuest: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
  },
  themeToggleText: { fontSize: 14 },
  guestLangRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
});

export default memo(ProfileScreen);
