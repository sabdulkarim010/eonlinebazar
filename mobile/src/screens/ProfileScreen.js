import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppStatusBar from '../components/AppStatusBar';
import ProfileAvatar from '../components/profile/ProfileAvatar';
import LogoutConfirmModal from '../components/profile/LogoutConfirmModal';
import useAuthStore from '../store/useAuthStore';
import useOrderStore from '../store/useOrderStore';
import useThemeStore from '../store/useThemeStore';
import useToastStore from '../store/useToastStore';
import useWishlistStore from '../store/useWishlistStore';
import { getProfileMenuSections } from '../i18n/profileMenu';
import useLanguageStore, { useTranslation } from '../store/useLanguageStore';
import { radius, useTheme } from '../theme/tokens';
import useSupportWhatsApp from '../hooks/useSupportWhatsApp';
import { haptic } from '../utils/haptics';
import { heroContactLine, heroContactIsPhone } from '../utils/maskContact';

function getProfileIconColors(dark) {
  return {
    orders: { icon: '#3b82f6', bg: dark ? '#0c1a33' : '#eff6ff' },
    wishlist: { icon: '#ef4444', bg: dark ? '#1e0a0a' : '#fef2f2' },
    addresses: { icon: '#10b981', bg: dark ? '#052e16' : '#ecfdf5' },
    notebook: { icon: '#8b5cf6', bg: dark ? '#1a0a3e' : '#f5f3ff' },
    wallet: { icon: '#f59e0b', bg: dark ? '#1a1000' : '#fffbeb' },
    chat: { icon: '#06b6d4', bg: dark ? '#0a1f2e' : '#ecfeff' },
    password: { icon: '#6366f1', bg: dark ? '#1a1a3e' : '#eef2ff' },
    delete: { icon: '#ef4444', bg: dark ? '#1e0a0a' : '#fef2f2' },
    privacy: { icon: '#64748b', bg: dark ? '#1e293b' : '#f8fafc' },
    terms: { icon: '#64748b', bg: dark ? '#1e293b' : '#f8fafc' },
    profile: { icon: '#3b82f6', bg: dark ? '#0c1a33' : '#eff6ff' },
    security: { icon: '#0ea5e9', bg: dark ? '#042f2e' : '#ecfeff' },
  };
}

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

function MenuRow({ item, iconColors, T, isLast, onPress }) {
  const scale = useRef(new Animated.Value(1)).current;
  const palette = iconColors[item.paletteKey] || iconColors.privacy;

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
            { backgroundColor: palette.bg },
          ]}
        >
          <Ionicons
            name={item.icon}
            size={18}
            color={item.danger ? T.danger : palette.icon}
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

function GuestView({ navigation, isDark, T, toggleTheme, lang, setLanguage, t, onWhatsAppHelp, iconColors }) {
  return (
    <ScrollView
      style={[styles.root, { backgroundColor: T.bg }]}
      contentContainerStyle={styles.guestScroll}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.guestAuthCard, { backgroundColor: T.card, shadowColor: T.shadow }]}>
        <View style={styles.guestHeroArt}>
          <View style={[styles.guestHeroGlow, { backgroundColor: `${T.accent}18` }]} />
          <View style={[styles.guestHeroRing, { borderColor: `${T.accent}40` }]}>
            <View style={[styles.guestHeroInner, { backgroundColor: T.accentBg }]}>
              <View style={[styles.guestHeroIconCore, { backgroundColor: T.accent }]}>
                <Ionicons name="shield-checkmark" size={34} color={T.textOnAccent} />
              </View>
            </View>
          </View>
        </View>

        <Text style={[styles.guestTitle, { color: T.text }]}>
          {t('profile.welcome_title')}
        </Text>
        <Text style={[styles.guestSub, { color: T.sub }]}>
          {t('profile.welcome_sub')}
        </Text>

        <Pressable
          style={({ pressed }) => [
            styles.guestLoginBtn,
            { backgroundColor: T.accent, shadowColor: T.accent },
            pressed && styles.guestBtnPressed,
          ]}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={[styles.guestLoginText, { color: T.textOnAccent }]}>{t('profile.sign_in')}</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.guestRegBtn,
            { borderColor: T.border, backgroundColor: T.card },
            pressed && styles.guestBtnPressed,
          ]}
          onPress={() => navigation.navigate('Register')}
        >
          <Text style={[styles.guestRegText, { color: T.text }]}>{t('profile.create_account')}</Text>
        </Pressable>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.guestSupportRow,
          {
            backgroundColor: T.cardSecondary,
            borderColor: T.border,
          },
          pressed && styles.guestBtnPressed,
        ]}
        onPress={onWhatsAppHelp}
      >
        <View style={[styles.guestWaBadge, { backgroundColor: T.brandWhatsApp }]}>
          <Ionicons name="logo-whatsapp" size={20} color={T.textOnAccent} />
        </View>
        <View style={styles.guestSupportCopy}>
          <Text style={[styles.guestSupportTitle, { color: T.text }]}>
            {t('profile.whatsapp_support')}
          </Text>
          <Text style={[styles.guestSupportSub, { color: T.sub }]}>
            {t('profile.whatsapp_sub')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={T.muted} />
      </Pressable>

      <View style={[styles.guestPrefsCard, { backgroundColor: T.card, borderColor: T.border }]}>
        <Pressable style={styles.guestPrefRow} onPress={toggleTheme}>
          <View style={[styles.guestPrefIcon, { backgroundColor: T.iconBg }]}>
            <Ionicons
              name={isDark ? 'moon' : 'sunny-outline'}
              size={18}
              color={T.warning}
            />
          </View>
          <Text style={[styles.guestPrefLabel, { color: T.text }]}>
            {isDark ? t('profile.dark_mode') : t('profile.light_mode')}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={T.muted} />
        </Pressable>

        <View style={[styles.guestPrefDivider, { backgroundColor: T.border }]} />

        <View style={styles.guestPrefRow}>
          <View style={[styles.guestPrefIcon, { backgroundColor: T.iconBg }]}>
            <Ionicons name="language-outline" size={18} color={iconColors.password.icon} />
          </View>
          <Text style={[styles.guestPrefLabel, { color: T.text }]}>{t('profile.language')}</Text>
          <View style={[styles.langSwitch, { backgroundColor: T.iconBg, borderColor: T.border }]}>
            <Pressable
              style={[styles.langOption, lang === 'en' && { backgroundColor: T.accent }]}
              onPress={() => setLanguage('en')}
            >
              <Text style={[styles.langOptionText, { color: lang === 'en' ? T.textOnAccent : T.sub }]}>{t('profile.language_en')}</Text>
            </Pressable>
            <Pressable
              style={[styles.langOption, lang === 'bn' && { backgroundColor: T.accent }]}
              onPress={() => setLanguage('bn')}
            >
              <Text style={[styles.langOptionText, { color: lang === 'bn' ? T.textOnAccent : T.sub }]}>{t('profile.language_bn')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </ScrollView>
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
  const { guestHelpUrl } = useSupportWhatsApp();

  const iconColors = useMemo(() => getProfileIconColors(isDark), [isDark]);
  const menuSections = useMemo(() => getProfileMenuSections(t), [t]);

  const isLoggedIn = Boolean(token && user);

  const openGuestWhatsApp = useCallback(async () => {
    try {
      const supported = await Linking.canOpenURL(guestHelpUrl);
      if (!supported) {
        showToast(t('common.whatsapp_unavailable'), 'error');
        return;
      }
      haptic.light();
      await Linking.openURL(guestHelpUrl);
    } catch {
      showToast(t('common.whatsapp_failed'), 'error');
    }
  }, [guestHelpUrl, showToast, t]);

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
      showToast(result.message || t('profile.photo_failed'), 'error');
      return;
    }
    showToast(result.message || t('profile.photo_updated'), 'success');
  };

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast(t('common.permission_photos'), 'error');
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
      showToast(t('common.permission_camera'), 'error');
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
    Alert.alert(t('profile.change_photo'), t('profile.choose_photo'), [
      { text: t('profile.photo_library'), onPress: pickFromLibrary },
      { text: t('profile.camera'), onPress: pickFromCamera },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const confirmLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    await logout();
    setLoggingOut(false);
    setShowLogout(false);
    showToast(t('profile.logged_out'), 'success');
  };

  if (isHydrating && !isLoggedIn) {
    return (
      <View style={[styles.centered, { backgroundColor: T.bg }]}>
        <AppStatusBar />
        <ActivityIndicator size="large" color={T.accent} />
      </View>
    );
  }

  if (!isLoggedIn) {
    return (
      <View style={[styles.root, { backgroundColor: T.bg, paddingTop: insets.top }]}>
        <AppStatusBar />
        <GuestView
          navigation={navigation}
          isDark={isDark}
          T={T}
          toggleTheme={toggleTheme}
          lang={lang}
          setLanguage={setLanguage}
          t={t}
          onWhatsAppHelp={openGuestWhatsApp}
          iconColors={iconColors}
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
      <AppStatusBar />

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
                    {t('profile.since', { year: memberYear })}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.heroInfo}>
              <Text style={[styles.heroName, { color: T.text }]} numberOfLines={1}>
                {user?.name || t('profile.my_account')}
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
                    {t('profile.verified')}
                  </Text>
                </View>
              ) : (
                <View style={[styles.chip, { backgroundColor: T.chipUnverifiedBg }]}>
                  <Ionicons name="mail-unread-outline" size={12} color={T.chipUnverifiedText} />
                  <Text style={[styles.chipText, { color: T.chipUnverifiedText }]}>
                    {t('profile.unverified_email')}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={[styles.statsRow, { borderTopColor: T.border }]}>
            <StatItem
              label={t('profile.orders')}
              value={displayOrders}
              icon="cube-outline"
              color={iconColors.orders.icon}
              T={T}
              onPress={() => navigation.navigate('Orders')}
            />
            <View style={[styles.statDiv, { backgroundColor: T.border }]} />
            <StatItem
              label={t('profile.wishlist')}
              value={displayWishlist}
              icon="heart-outline"
              color={iconColors.wishlist.icon}
              T={T}
              onPress={() => navigation.navigate('Wishlist')}
            />
            <View style={[styles.statDiv, { backgroundColor: T.border }]} />
            <StatItem
              label={t('profile.points')}
              value={Number(user?.loyaltyPoints || 0).toLocaleString('en-US')}
              icon="star-outline"
              color={iconColors.wallet.icon}
              T={T}
              onPress={() => navigation.navigate('LoyaltyPoints')}
            />
            <View style={[styles.statDiv, { backgroundColor: T.border }]} />
            <StatItem
              label={t('profile.wallet')}
              value={walletLabel}
              icon="wallet-outline"
              color={iconColors.addresses.icon}
              T={T}
              onPress={() => navigation.navigate('Wallet')}
            />
          </View>
        </View>

        {menuSections.map((section) => (
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
                  iconColors={iconColors}
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
            {t('profile.preferences')}
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
              <View style={[styles.iconBox, { backgroundColor: iconColors.password.bg }]}>
                <Ionicons name="language-outline" size={18} color={iconColors.password.icon} />
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
                  <Text style={[styles.langOptionText, { color: lang === 'en' ? T.textOnAccent : T.sub }]}>
                    {t('profile.language_en')}
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.langOption,
                    lang === 'bn' && { backgroundColor: T.accent },
                  ]}
                  onPress={() => setLanguage('bn')}
                >
                  <Text style={[styles.langOptionText, { color: lang === 'bn' ? T.textOnAccent : T.sub }]}>
                    {t('profile.language_bn')}
                  </Text>
                </Pressable>
              </View>
            </View>
            <View style={[styles.menuRow, styles.menuRowLast]}>
              <View style={[styles.iconBox, { backgroundColor: T.iconBg }]}>
                <Ionicons
                  name={isDark ? 'moon' : 'sunny-outline'}
                  size={18}
                  color={T.warning}
                />
              </View>
              <Text style={[styles.menuLabel, { color: T.text }]}>
                {isDark ? t('profile.dark_mode') : t('profile.light_mode')}
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
                      shadowColor: T.shadow,
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
          <Text style={[styles.logoutText, { color: T.danger }]}>{t('profile.sign_out')}</Text>
        </Pressable>

        <Text style={[styles.versionText, { color: T.muted }]}>
          {t('profile.version')}
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

  guestScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 14,
  },
  guestAuthCard: {
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 6,
  },
  guestHeroArt: {
    width: 112,
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  guestHeroGlow: {
    position: 'absolute',
    width: 112,
    height: 112,
    borderRadius: 56,
  },
  guestHeroRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestHeroInner: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestHeroIconCore: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestTitle: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  guestSub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  guestLoginBtn: {
    width: '100%',
    borderRadius: 14,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  guestLoginText: { fontSize: 16, fontWeight: '700' },
  guestRegBtn: {
    width: '100%',
    borderWidth: 1.5,
    borderRadius: 14,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  guestRegText: { fontSize: 15, fontWeight: '600' },
  guestBtnPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  guestSupportRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  guestWaBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestSupportCopy: { flex: 1, gap: 3 },
  guestSupportTitle: { fontSize: 15, fontWeight: '700' },
  guestSupportSub: { fontSize: 12, fontWeight: '500', lineHeight: 17 },
  guestPrefsCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  guestPrefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  guestPrefIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestPrefLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  guestPrefDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
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
