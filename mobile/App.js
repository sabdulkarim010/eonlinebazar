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
import useLanguageStore from './src/store/useLanguageStore';
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
const PRODUCT_DETAILS_OPTIONS = { title: 'Product Details' };
const LOGIN_OPTIONS = { title: 'Sign in' };
const REGISTER_OPTIONS = { title: 'Create account' };
const CHECKOUT_OPTIONS = { title: 'Checkout' };
const ORDER_DETAILS_OPTIONS = { title: 'Order details' };
const ORDER_SUCCESS_OPTIONS = { headerShown: false };
const WISHLIST_OPTIONS = { title: 'Wishlist' };
const DELETE_ACCOUNT_OPTIONS = { title: 'Delete Account' };
const ADDRESSES_OPTIONS = { title: 'My Addresses' };
const FORGOT_PASSWORD_OPTIONS = { title: 'Reset Password' };
const CHANGE_PASSWORD_OPTIONS = { title: 'Change Password' };
const EDIT_PROFILE_OPTIONS = { title: 'Personal Info' };
const SECURITY_SETTINGS_OPTIONS = { title: 'Security Settings' };
const WALLET_OPTIONS = { title: 'My Wallet' };
const LOYALTY_POINTS_OPTIONS = { title: 'Loyalty Points' };
const NOTEBOOK_OPTIONS = { title: 'My Notebook' };
const LIVE_SUPPORT_OPTIONS = { title: 'Live Support' };

function legalScreenOptions({ route }) {
  return { title: route.params?.title || 'Legal' };
}

function hideSplash() {
  SplashScreen.hideAsync().catch((error) => {
    console.warn('SplashScreen.hideAsync failed', error);
  });
}

function RootNavigation() {
  const { isDark, colors } = useAppTheme();
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
        <Stack.Screen name="ProductDetails" component={ProductDetailsScreen} options={PRODUCT_DETAILS_OPTIONS} />
        <Stack.Screen name="Login" component={LoginScreen} options={LOGIN_OPTIONS} />
        <Stack.Screen name="Register" component={RegisterScreen} options={REGISTER_OPTIONS} />
        <Stack.Screen name="Checkout" component={CheckoutScreen} options={CHECKOUT_OPTIONS} />
        <Stack.Screen name="OrderSuccess" component={OrderSuccessScreen} options={ORDER_SUCCESS_OPTIONS} />
        <Stack.Screen name="OrderDetails" component={OrderDetailsScreen} options={ORDER_DETAILS_OPTIONS} />
        <Stack.Screen name="Wishlist" component={WishlistScreen} options={WISHLIST_OPTIONS} />
        <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} options={DELETE_ACCOUNT_OPTIONS} />
        <Stack.Screen name="Legal" component={LegalScreen} options={legalScreenOptions} />
        <Stack.Screen name="Addresses" component={AddressesScreen} options={ADDRESSES_OPTIONS} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={FORGOT_PASSWORD_OPTIONS} />
        <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={CHANGE_PASSWORD_OPTIONS} />
        <Stack.Screen name="EditProfile" component={EditProfileScreen} options={EDIT_PROFILE_OPTIONS} />
        <Stack.Screen name="SecuritySettings" component={SecuritySettingsScreen} options={SECURITY_SETTINGS_OPTIONS} />
        <Stack.Screen name="Wallet" component={WalletScreen} options={WALLET_OPTIONS} />
        <Stack.Screen name="LoyaltyPoints" component={LoyaltyPointsScreen} options={LOYALTY_POINTS_OPTIONS} />
        <Stack.Screen name="Notebook" component={NotebookScreen} options={NOTEBOOK_OPTIONS} />
        <Stack.Screen name="LiveSupport" component={LiveSupportScreen} options={LIVE_SUPPORT_OPTIONS} />
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
