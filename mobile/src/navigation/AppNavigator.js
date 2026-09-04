import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import HomeScreen from '../screens/HomeScreen';
import ShopScreen from '../screens/ShopScreen';
import CartScreen from '../screens/CartScreen';
import OrdersScreen from '../screens/OrdersScreen';
import ProfileScreen from '../screens/ProfileScreen';
import useAuthStore from '../store/useAuthStore';
import useCartStore from '../store/useCartStore';
import { useAppTheme } from '../store/useThemeStore';
import { palettes } from '../theme/palettes';
import { resolveMediaUrl } from '../utils/normalizeProduct';

const Tab = createBottomTabNavigator();

const HEADER_TITLE_STYLE = { fontWeight: '700' };

const TAB_ICONS = {
  Home: { focused: 'home', default: 'home-outline' },
  Shop: { focused: 'storefront', default: 'storefront-outline' },
  Cart: { focused: 'cart', default: 'cart-outline' },
  Orders: { focused: 'receipt', default: 'receipt-outline' },
};

function pickAvatarUri(user) {
  const candidates = [user?.avatar, user?.avatarUrl, user?.profilePicture, user?.image];
  for (const candidate of candidates) {
    const raw = String(candidate ?? '').trim();
    if (raw) return resolveMediaUrl(raw);
  }
  return '';
}

function profileInitials(user) {
  const n = user?.name || user?.firstName || '';
  const parts = String(n).trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return String(n).slice(0, 2).toUpperCase() || '?';
}

function ProfileTabIcon({ focused, color, accentColor, user }) {
  const [imgFailed, setImgFailed] = useState(false);
  const avatarUri = pickAvatarUri(user);
  const showImage = Boolean(avatarUri) && !imgFailed;
  const size = 24;

  useEffect(() => {
    setImgFailed(false);
  }, [avatarUri]);

  if (!user) {
    const icons = { focused: 'person', default: 'person-outline' };
    return <Ionicons name={focused ? icons.focused : icons.default} size={size} color={color} />;
  }

  return (
    <View
      style={[
        tabIconStyles.avatarSlot,
        focused && { borderColor: accentColor, borderWidth: 2 },
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri: avatarUri }}
          style={tabIconStyles.avatarImage}
          resizeMode="cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <View style={[tabIconStyles.initialsWrap, { backgroundColor: `${accentColor}22` }]}>
          <Text style={[tabIconStyles.initialsText, { color: accentColor, fontSize: 10 }]}>
            {profileInitials(user)}
          </Text>
        </View>
      )}
    </View>
  );
}

function TabBarIcon({ routeName, focused, color, size, accentColor, user }) {
  if (routeName === 'Profile') {
    return (
      <ProfileTabIcon
        focused={focused}
        color={color}
        accentColor={accentColor}
        user={user}
      />
    );
  }

  const icons = TAB_ICONS[routeName] || TAB_ICONS.Home;
  return <Ionicons name={focused ? icons.focused : icons.default} size={size} color={color} />;
}

function makeTabScreenOptions(colors, user) {
  const tabBarStyle = {
    backgroundColor: colors.tabBar,
    borderTopColor: colors.border,
  };
  return ({ route }) => ({
    headerStyle: { backgroundColor: colors.header },
    headerTintColor: colors.headerText,
    headerTitleStyle: HEADER_TITLE_STYLE,
    tabBarActiveTintColor: colors.accent,
    tabBarInactiveTintColor: colors.tabInactive,
    tabBarStyle,
    freezeOnBlur: true,
    tabBarIcon: ({ focused, color, size }) => (
      <TabBarIcon
        routeName={route.name}
        focused={focused}
        color={color}
        size={size}
        accentColor={colors.accent}
        user={route.name === 'Profile' && user ? user : null}
      />
    ),
  });
}

const CART_BADGE_STYLE = {
  light: {
    backgroundColor: palettes.light.heart,
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  dark: {
    backgroundColor: palettes.dark.heart,
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
};

function shopTabListeners({ navigation, route }) {
  return {
    tabPress: () => {
      if (!route.params?.filter && !route.params?.category) return;
      navigation.setParams({ filter: undefined, category: undefined });
    },
  };
}

export default function AppNavigator() {
  const { isDark, colors } = useAppTheme();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const profileUser = token && user ? user : null;
  const cartCount = useCartStore((state) =>
    state.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
  );
  const cartBadge = cartCount > 99 ? '99+' : cartCount;
  const themeKey = isDark ? 'dark' : 'light';

  const screenOptions = useMemo(
    () => makeTabScreenOptions(colors, profileUser),
    [colors, profileUser]
  );

  const cartOptions = useMemo(
    () => ({
      tabBarBadge: cartCount > 0 ? cartBadge : undefined,
      tabBarBadgeStyle: CART_BADGE_STYLE[themeKey],
    }),
    [cartBadge, cartCount, themeKey]
  );

  const homeOptions = useMemo(
    () => ({ headerShown: false }),
    []
  );

  const shopOptions = useMemo(
    () => ({ headerShown: false }),
    []
  );

  const profileOptions = useMemo(
    () => ({ headerShown: false }),
    []
  );

  return (
    <Tab.Navigator
      detachInactiveScreens={false}
      screenOptions={screenOptions}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={homeOptions} />
      <Tab.Screen
        name="Shop"
        component={ShopScreen}
        options={shopOptions}
        listeners={shopTabListeners}
      />
      <Tab.Screen
        name="Cart"
        component={CartScreen}
        options={cartOptions}
      />
      <Tab.Screen name="Orders" component={OrdersScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={profileOptions} />
    </Tab.Navigator>
  );
}

const tabIconStyles = StyleSheet.create({
  avatarSlot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 0,
  },
  avatarImage: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  initialsWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
