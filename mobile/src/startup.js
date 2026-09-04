import Constants from 'expo-constants';
import * as SplashScreen from 'expo-splash-screen';

const UPDATE_ERROR_RE = /remote update|expo-updates|failed to download|IOException/i;

function isUpdatesDisabledInConfig() {
  const updates = Constants.expoConfig?.updates
    ?? Constants.manifest2?.extra?.expoClient?.updates
    ?? Constants.manifest?.updates;
  return updates?.enabled === false || updates?.checkAutomatically === 'NEVER';
}

function tryRequireExpoUpdates() {
  try {
    // Optional: preview/production builds include native expo-updates; dev/Expo Go may not.
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    return require('expo-updates');
  } catch {
    return null;
  }
}

function isUpdateRelatedError(error) {
  const message = String(error?.message || error || '');
  const cause = String(error?.cause?.message || error?.cause || '');
  return UPDATE_ERROR_RE.test(message) || UPDATE_ERROR_RE.test(cause);
}

function installGlobalUpdateFallback() {
  const errorUtils = globalThis.ErrorUtils;
  if (!errorUtils?.getGlobalHandler || !errorUtils?.setGlobalHandler) return;

  const previousHandler = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    if (isUpdateRelatedError(error)) {
      if (__DEV__) {
        console.debug(
          '[startup] Ignoring expo-updates fetch failure in development.',
          error?.message || error
        );
      } else {
        console.warn(
          '[startup] Ignoring expo-updates fetch failure; using embedded bundle.',
          error?.message || error
        );
      }
      SplashScreen.hideAsync().catch(() => {});
      return;
    }
    previousHandler?.(error, isFatal);
  });
}

function installUnhandledRejectionFallback() {
  if (__DEV__) return;

  const tracker = globalThis.HermesInternal?.enablePromiseRejectionTracker;
  if (typeof tracker !== 'function') return;

  tracker({
    allRejections: true,
    onUnhandled: (_id, error) => {
      if (isUpdateRelatedError(error)) {
        console.warn(
          '[startup] Ignoring unhandled expo-updates rejection; using embedded bundle.',
          error?.message || error
        );
      }
    },
  });
}

async function probeExpoUpdates() {
  if (__DEV__ || isUpdatesDisabledInConfig()) {
    return;
  }

  const Updates = tryRequireExpoUpdates();
  if (!Updates) return;

  try {
    if (Updates.isEnabled) {
      console.warn(
        '[startup] expo-updates is enabled in this build; app.json should set updates.enabled to false.'
      );
    }
  } catch (error) {
    console.warn('[startup] expo-updates probe failed:', error?.message || error);
  }
}

export async function runStartupGuards() {
  installGlobalUpdateFallback();
  installUnhandledRejectionFallback();
  await probeExpoUpdates();
}

// Run synchronously as early as possible (imported from index.js before App).
runStartupGuards().catch((error) => {
  if (__DEV__) {
    console.debug('[startup] guard setup skipped in development:', error?.message || error);
    return;
  }
  console.warn('[startup] guard setup failed:', error?.message || error);
});
