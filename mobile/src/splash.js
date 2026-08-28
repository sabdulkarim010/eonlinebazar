import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync().catch((error) => {
  console.warn('SplashScreen.preventAutoHideAsync failed', error);
});
