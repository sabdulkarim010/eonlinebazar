import 'react-native-gesture-handler';
import { useCallback, useEffect } from 'react';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ErrorBoundary from './src/components/ErrorBoundary';
import AppNavigator from './src/navigation/AppNavigator';
import ProductDetailsScreen from './src/screens/ProductDetailsScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import CheckoutScreen from './src/screens/CheckoutScreen';
import OrderDetailsScreen from './src/screens/OrderDetailsScreen';
import WishlistScreen from './src/screens/WishlistScreen';
import ToastBanner from './src/components/ToastBanner';
import useAuthStore from './src/store/useAuthStore';
import useThemeStore, { useAppTheme } from './src/store/useThemeStore';
import useWishlistStore from './src/store/useWishlistStore';

const Stack = createNativeStackNavigator();

function hideSplash() {
  SplashScreen.hideAsync().catch((error) => {
    console.warn('SplashScreen.hideAsync failed', error);
  });
}

function RootNavigation() {
  const { colors, isDark } = useAppTheme();
  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      primary: colors.accent,
      background: colors.bg,
      card: colors.header,
      text: colors.headerText,
      border: colors.border,
      notification: colors.accent,
    },
  };

  const onReady = useCallback(() => {
    hideSplash();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(hideSplash, 2500);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <NavigationContainer theme={navTheme} onReady={onReady}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.header },
          headerTintColor: colors.headerText,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen
          name="Main"
          component={AppNavigator}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ProductDetails"
          component={ProductDetailsScreen}
          options={{ title: 'Product Details' }}
        />
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ title: 'Sign in' }}
        />
        <Stack.Screen
          name="Register"
          component={RegisterScreen}
          options={{ title: 'Create account' }}
        />
        <Stack.Screen
          name="Checkout"
          component={CheckoutScreen}
          options={{ title: 'Checkout' }}
        />
        <Stack.Screen
          name="OrderDetails"
          component={OrderDetailsScreen}
          options={{ title: 'Order details' }}
        />
        <Stack.Screen
          name="Wishlist"
          component={WishlistScreen}
          options={{ title: 'Wishlist' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  useEffect(() => {
    Promise.all([
      useAuthStore.getState().hydrate(),
      useThemeStore.getState().hydrate(),
      useWishlistStore.getState().hydrate(),
    ]).catch((error) => {
      console.warn('Store hydration failed', error);
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <RootNavigation />
          <ToastBanner />
          <StatusBar style="light" />
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
