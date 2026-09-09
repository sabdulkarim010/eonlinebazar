import 'react-native-gesture-handler';
import { useCallback, useEffect } from 'react';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ErrorBoundary from './src/components/ErrorBoundary';
import { DistrictModalHost } from './src/components/DistrictUpazilaPicker';
import AppNavigator from './src/navigation/AppNavigator';
import ProductDetailsScreen from './src/screens/ProductDetailsScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import CheckoutScreen from './src/screens/CheckoutScreen';
import OrderDetailsScreen from './src/screens/OrderDetailsScreen';
import OrderSuccessScreen from './src/screens/OrderSuccessScreen';
import WishlistScreen from './src/screens/WishlistScreen';
import DeleteAccountScreen from './src/screens/DeleteAccountScreen';
import LegalScreen from './src/screens/LegalScreen';
import AddressesScreen from './src/screens/AddressesScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import ChangePasswordScreen from './src/screens/ChangePasswordScreen';
import EditProfileScreen from './src/screens/EditProfileScreen';
import SecuritySettingsScreen from './src/screens/SecuritySettingsScreen';
import WalletScreen from './src/screens/WalletScreen';
import LoyaltyPointsScreen from './src/screens/LoyaltyPointsScreen';
import NotebookScreen from './src/screens/NotebookScreen';
import LiveSupportScreen from './src/screens/LiveSupportScreen';
import ToastBanner from './src/components/ToastBanner';
import useAuthStore from './src/store/useAuthStore';
import useCartStore, { waitForCartPersist } from './src/store/useCartStore';
import useThemeStore, { useAppTheme } from './src/store/useThemeStore';
import useLanguageStore, { useTranslation } from './src/store/useLanguageStore';
import { legalTitleForSlug } from './src/i18n/legalWebView';
import useWishlistStore from './src/store/useWishlistStore';
import { palettes } from './src/theme/palettes';

const Stack = createNativeStackNavigator();

const HEADER_TITLE_STYLE = { fontWeight: '700' };

function makeNavTheme(isDark) {
  const colors = isDark ? palettes.dark : palettes.light;
  const base = isDark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.accent,
      background: colors.bg,
      card: colors.header,
      text: colors.headerText,
      border: colors.border,
      notification: colors.accent,
    },
  };
}

function makeStackScreenOptions(colors) {
  return {
    headerStyle: { backgroundColor: colors.header },
    headerTintColor: colors.headerText,
    headerTitleStyle: HEADER_TITLE_STYLE,
    headerBackTitleVisible: false,
    contentStyle: { backgroundColor: colors.bg },
  };
}

const NAV_THEME = {
  light: makeNavTheme(false),
  dark: makeNavTheme(true),
};

const STACK_SCREEN_OPTIONS = {
  light: makeStackScreenOptions(palettes.light),
  dark: makeStackScreenOptions(palettes.dark),
};

const MAIN_OPTIONS = { headerShown: false };
const ORDER_SUCCESS_OPTIONS = { headerShown: false };

function useLocalizedStackTitles() {
  const { lang, t } = useTranslation();
  return {
    lang,
    titles: {
      ProductDetails: t('screen.product_details'),
      Login: t('screen.login'),
      Register: t('screen.register'),
      Checkout: t('screen.checkout'),
      OrderDetails: t('screen.order_details'),
      Wishlist: t('screen.wishlist'),
      DeleteAccount: t('screen.delete_account'),
      Addresses: t('screen.addresses'),
      ForgotPassword: t('screen.forgot_password'),
      ChangePassword: t('screen.change_password'),
      EditProfile: t('screen.edit_profile'),
      SecuritySettings: t('screen.security_settings'),
      Wallet: t('screen.wallet'),
      LoyaltyPoints: t('screen.loyalty_points'),
      Notebook: t('screen.notebook'),
      LiveSupport: t('screen.live_support'),
    },
    legalTitle: (route) => {
      const titleKey = route.params?.titleKey;
      if (titleKey) return t(titleKey);
      const slug = route.params?.slug;
      if (slug) return legalTitleForSlug(slug, lang);
      return route.params?.title || t('screen.legal');
    },
  };
}

function hideSplash() {
  SplashScreen.hideAsync().catch((error) => {
    console.warn('SplashScreen.hideAsync failed', error);
  });
}

function RootNavigation() {
  const { isDark, colors } = useAppTheme();
  const { titles, legalTitle } = useLocalizedStackTitles();
  const navTheme = isDark ? NAV_THEME.dark : NAV_THEME.light;
  const screenOptions = isDark ? STACK_SCREEN_OPTIONS.dark : STACK_SCREEN_OPTIONS.light;

  const onReady = useCallback(() => {
    hideSplash();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(hideSplash, 2500);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <NavigationContainer theme={navTheme} onReady={onReady}>
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen name="Main" component={AppNavigator} options={MAIN_OPTIONS} />
        <Stack.Screen name="ProductDetails" component={ProductDetailsScreen} options={{ title: titles.ProductDetails }} />
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: titles.Login }} />
        <Stack.Screen name="Register" component={RegisterScreen} options={{ title: titles.Register }} />
        <Stack.Screen name="Checkout" component={CheckoutScreen} options={{ title: titles.Checkout }} />
        <Stack.Screen name="OrderSuccess" component={OrderSuccessScreen} options={ORDER_SUCCESS_OPTIONS} />
        <Stack.Screen name="OrderDetails" component={OrderDetailsScreen} options={{ title: titles.OrderDetails }} />
        <Stack.Screen name="Wishlist" component={WishlistScreen} options={{ title: titles.Wishlist }} />
        <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} options={{ title: titles.DeleteAccount }} />
        <Stack.Screen name="Legal" component={LegalScreen} options={({ route }) => ({ title: legalTitle(route) })} />
        <Stack.Screen name="Addresses" component={AddressesScreen} options={{ title: titles.Addresses }} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: titles.ForgotPassword }} />
        <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ title: titles.ChangePassword }} />
        <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: titles.EditProfile }} />
        <Stack.Screen name="SecuritySettings" component={SecuritySettingsScreen} options={{ title: titles.SecuritySettings }} />
        <Stack.Screen name="Wallet" component={WalletScreen} options={{ title: titles.Wallet }} />
        <Stack.Screen name="LoyaltyPoints" component={LoyaltyPointsScreen} options={{ title: titles.LoyaltyPoints }} />
        <Stack.Screen name="Notebook" component={NotebookScreen} options={{ title: titles.Notebook }} />
        <Stack.Screen name="LiveSupport" component={LiveSupportScreen} options={{ title: titles.LiveSupport }} />
      </Stack.Navigator>
      <StatusBar style="light" backgroundColor={colors.header} />
    </NavigationContainer>
  );
}

export default function App() {
  useEffect(() => {
    (async () => {
      try {
        await Promise.all([
          useAuthStore.getState().hydrate(),
          useThemeStore.getState().hydrate(),
          useLanguageStore.getState().hydrate(),
          useWishlistStore.getState().hydrate(),
          waitForCartPersist(),
        ]);
        if (useAuthStore.getState().token) {
          await useCartStore.getState().loadFromServer();
          await useWishlistStore.getState().loadFromServer();
        }
      } catch (error) {
        console.warn('Store hydration failed', error);
      }
    })();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ErrorBoundary>
          {/* Host must wrap navigation + overlays so district modals portal above the stack */}
          <DistrictModalHost style={styles.root}>
            <RootNavigation />
            <ToastBanner />
          </DistrictModalHost>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
