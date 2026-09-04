import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const DEFAULT_API_URL = 'https://eonlinebazar.com/api';
const TOKEN_KEY = 'eonlinebazar_token';
const SECURE_STORE_TIMEOUT_MS = 2000;

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label || 'SecureStore'} timed out after ${ms}ms`));
    }, ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function toApiBaseUrl(value) {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  if (!trimmed) return DEFAULT_API_URL;
  if (/\/api$/i.test(trimmed)) return trimmed;
  return `${trimmed}/api`;
}

export const API_BASE_URL = toApiBaseUrl(process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL);
export const API_ORIGIN = API_BASE_URL.replace(/\/api$/i, '');

export function resolveApiOrigin() {
  return API_ORIGIN;
}

const AUTH_401_SKIP = [
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/customer/login',
  '/customer/register',
  '/customer/forgot-password',
  '/customer/reset-password',
];

const POST_LOGIN_SYNC_401_SKIP = [
  '/cart',
  '/wishlist',
  '/customer/profile',
];

async function canUseSecureStore() {
  try {
    if (typeof SecureStore.isAvailableAsync !== 'function') return false;
    return await withTimeout(
      SecureStore.isAvailableAsync(),
      SECURE_STORE_TIMEOUT_MS,
      'SecureStore.isAvailableAsync'
    );
  } catch {
    return false;
  }
}

export async function getStoredAuthToken() {
  try {
    if (await canUseSecureStore()) {
      const value = await withTimeout(
        SecureStore.getItemAsync(TOKEN_KEY),
        SECURE_STORE_TIMEOUT_MS,
        'SecureStore.getItemAsync'
      );
      if (value) return value;
    }
  } catch (error) {
    console.warn('SecureStore token read failed, using AsyncStorage:', error?.message || error);
  }
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch (error) {
    console.warn('AsyncStorage token read failed:', error?.message || error);
    return null;
  }
}

export async function setStoredAuthToken(token) {
  if (!token) {
    await clearStoredAuthToken();
    return;
  }

  let storedSecure = false;
  try {
    if (await canUseSecureStore()) {
      await withTimeout(
        SecureStore.setItemAsync(TOKEN_KEY, token),
        SECURE_STORE_TIMEOUT_MS,
        'SecureStore.setItemAsync'
      );
      storedSecure = true;
    }
  } catch (error) {
    console.warn('SecureStore token write failed, using AsyncStorage:', error?.message || error);
  }

  try {
    if (storedSecure) {
      await AsyncStorage.removeItem(TOKEN_KEY);
    } else {
      await AsyncStorage.setItem(TOKEN_KEY, token);
    }
  } catch (error) {
    if (!storedSecure) throw error;
    console.warn('AsyncStorage token cleanup failed:', error?.message || error);
  }
}

export async function clearStoredAuthToken() {
  try {
    if (await canUseSecureStore()) {
      await withTimeout(
        SecureStore.deleteItemAsync(TOKEN_KEY),
        SECURE_STORE_TIMEOUT_MS,
        'SecureStore.deleteItemAsync'
      );
    }
  } catch (error) {
    console.warn('SecureStore token delete failed:', error?.message || error);
  }
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch (error) {
    console.warn('AsyncStorage token delete failed:', error?.message || error);
  }
}

function shouldSkip401Logout(error) {
  const url = String(error?.config?.url || '');
  if (AUTH_401_SKIP.some((path) => url.includes(path))) return true;

  let isLoggingIn = false;
  let isHydrating = false;
  let isRegistering = false;
  try {
    // Lazy require avoids a circular import with useAuthStore.
    // eslint-disable-next-line global-require
    const { default: useAuthStore } = require('../store/useAuthStore');
    const state = useAuthStore.getState();
    isLoggingIn = Boolean(state.isLoggingIn);
    isHydrating = Boolean(state.isHydrating);
    isRegistering = Boolean(state.isRegistering);
  } catch {
    return false;
  }

  // Login/register in flight: never wipe a token that may have just been persisted.
  if (isLoggingIn || isRegistering) return true;

  // Hydrate cart+wishlist+profile sync: warn, keep the session for the store to handle.
  if (isHydrating && POST_LOGIN_SYNC_401_SKIP.some((path) => url.includes(path))) {
    return true;
  }

  return false;
}

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

let loggingOut = false;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && !shouldSkip401Logout(error) && !loggingOut) {
      loggingOut = true;
      try {
        // eslint-disable-next-line global-require
        const { default: useAuthStore } = require('../store/useAuthStore');
        if (useAuthStore.getState().token) {
          await useAuthStore.getState().logout();
        }
      } catch (logoutError) {
        console.warn('Auto-logout after 401 failed', logoutError);
      } finally {
        loggingOut = false;
      }
    } else if (
      error.response?.status === 401
      && POST_LOGIN_SYNC_401_SKIP.some((path) => String(error?.config?.url || '').includes(path))
    ) {
      console.warn(
        'Auth sync 401 ignored (session kept):',
        error?.config?.url,
        error.response?.data?.message || error.message
      );
    }
    return Promise.reject(error);
  }
);

export default api;
