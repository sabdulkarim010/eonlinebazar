import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { endpoints } from '../api/endpoints';
import api from '../services/api';
import useCartStore, { waitForCartPersist } from './useCartStore';
import useWishlistStore, { waitForWishlistPersist } from './useWishlistStore';

const TOKEN_KEY = 'eonlinebazar_token';
const USER_KEY = 'eonlinebazar_user';

function applyAuthHeader(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

function apiErrorMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback;
}

function toPublicUser(user) {
  if (!user) return null;
  return {
    id: user.id || user._id || null,
    name: user.name || [user.firstName, user.lastName].filter(Boolean).join(' '),
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    email: user.email || '',
    mobile: user.mobile || user.phone || '',
    address: user.address || user.fullAddress || user.deliveryAddress || '',
  };
}

async function persistSession(token, user) {
  applyAuthHeader(token);
  const writes = [];
  if (token) writes.push(AsyncStorage.setItem(TOKEN_KEY, token));
  else writes.push(AsyncStorage.removeItem(TOKEN_KEY));
  if (user) writes.push(AsyncStorage.setItem(USER_KEY, JSON.stringify(user)));
  else writes.push(AsyncStorage.removeItem(USER_KEY));
  await Promise.all(writes);
}

async function mergeLocalDataAfterLogin() {
  try {
    await Promise.all([waitForCartPersist(), waitForWishlistPersist()]);
    await useCartStore.getState().syncToServer();
    await useCartStore.getState().loadFromServer();
    await useWishlistStore.getState().syncToServer();
    await useWishlistStore.getState().loadFromServer();
  } catch (error) {
    console.warn('Local data merge after login failed:', error?.message || error);
  }
}

const useAuthStore = create((set, get) => ({
  user: null,
  token: null,
  isLoading: true,

  hydrate: async () => {
    set({ isLoading: true });
    try {
      const [token, userRaw] = await Promise.all([
        AsyncStorage.getItem(TOKEN_KEY),
        AsyncStorage.getItem(USER_KEY),
      ]);
      let storedUser = null;
      try {
        storedUser = userRaw ? JSON.parse(userRaw) : null;
      } catch {
        storedUser = null;
      }

      if (!token) {
        applyAuthHeader(null);
        set({ user: null, token: null, isLoading: false });
        return;
      }

      applyAuthHeader(token);
      set({ token, user: storedUser, isLoading: false });

      try {
        const { data } = await api.get('/customer/profile');
        const user = toPublicUser(data);
        if (user?.email) {
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
          set({ user });
        }
      } catch (error) {
        const status = error.response?.status;
        if (status === 401 || status === 403) {
          await get().logout();
        }
      }
    } catch {
      applyAuthHeader(null);
      set({ user: null, token: null, isLoading: false });
    }
  },

  login: async ({ email, password, loginInput, mobile } = {}) => {
    const identifier = String(loginInput || email || mobile || '').trim();
    set({ isLoading: true });
    try {
      const { data } = await api.post(endpoints.auth.login, {
        loginInput: identifier,
        email: identifier,
        password,
      });

      if (!data?.success || !data.token) {
        set({ isLoading: false });
        return {
          success: false,
          message: data?.message || 'Login failed.',
          needsVerification: Boolean(data?.needsVerification),
          email: data?.email,
        };
      }

      const user = toPublicUser(data.user);
      await persistSession(data.token, user);
      set({ user, token: data.token, isLoading: false });
      await mergeLocalDataAfterLogin();
      return { success: true, user, token: data.token };
    } catch (error) {
      set({ isLoading: false });
      const payload = error.response?.data || {};
      return {
        success: false,
        message: payload.message || apiErrorMessage(error, 'Login failed.'),
        needsVerification: Boolean(payload.needsVerification),
        email: payload.email,
      };
    }
  },

  register: async (payload = {}) => {
    set({ isLoading: true });
    try {
      const { data } = await api.post(endpoints.auth.register, {
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        mobile: payload.mobile,
        password: payload.password,
        district: payload.district,
        upazila: payload.upazila || payload.upazilaOrThana || payload.thana,
      });

      if (!data?.success) {
        set({ isLoading: false });
        return {
          success: false,
          message: data?.message || 'Registration failed.',
        };
      }

      // Backend requires email verification and does not return a JWT on register.
      if (data.token && data.user) {
        const user = toPublicUser(data.user);
        await persistSession(data.token, user);
        set({ user, token: data.token, isLoading: false });
        await mergeLocalDataAfterLogin();
        return { success: true, user, token: data.token, ...data };
      }

      set({ isLoading: false });
      return {
        success: true,
        message: data.message,
        email: data.email,
        needsVerification: Boolean(data.needsVerification),
        emailSent: data.emailSent,
      };
    } catch (error) {
      set({ isLoading: false });
      const payload = error.response?.data || {};
      return {
        success: false,
        message: payload.message || apiErrorMessage(error, 'Registration failed.'),
      };
    }
  },

  logout: async () => {
    await persistSession(null, null);
    set({ user: null, token: null, isLoading: false });
  },

  deleteAccount: async ({ password, reason } = {}) => {
    try {
      const { data } = await api.delete(endpoints.auth.account, {
        data: { password, reason },
      });
      if (!data?.success) {
        return { success: false, message: data?.message || 'Failed to delete account.' };
      }
      await get().logout();
      return { success: true, message: data.message };
    } catch (error) {
      const payload = error.response?.data || {};
      return {
        success: false,
        message: payload.message || apiErrorMessage(error, 'Failed to delete account.'),
      };
    }
  },

  updateProfile: async ({ name, mobile, address } = {}) => {
    const current = get().user || {};
    const trimmedName = String(name ?? current.name ?? '').trim();
    const trimmedMobile = String(mobile ?? current.mobile ?? '').replace(/\D/g, '');
    const trimmedAddress = String(address ?? current.address ?? '').trim();
    const parts = trimmedName.split(/\s+/).filter(Boolean);

    const nextUser = {
      ...current,
      name: trimmedName,
      firstName: parts[0] || '',
      lastName: parts.length > 1 ? parts.slice(1).join(' ') : '',
      mobile: trimmedMobile,
      address: trimmedAddress,
    };

    const token = get().token;
    if (token) {
      const payload = {
        name: nextUser.name,
        firstName: nextUser.firstName,
        lastName: nextUser.lastName,
        fullAddress: nextUser.address,
        address: nextUser.address,
      };
      if (trimmedMobile && trimmedMobile === String(current.mobile || '').replace(/\D/g, '')) {
        payload.mobile = trimmedMobile;
      }
      try {
        const { data } = await api.put('/customer/update-profile', payload);
        if (data?.user) {
          const merged = { ...nextUser, ...toPublicUser(data.user), address: nextUser.address, mobile: nextUser.mobile };
          await persistSession(token, merged);
          set({ user: merged });
          return { success: true, user: merged, message: data.message || 'Profile updated.' };
        }
      } catch (error) {
        const message = apiErrorMessage(error, '');
        if (message && /otp|phone number changes/i.test(message)) {
          await persistSession(token, nextUser);
          set({ user: nextUser });
          return { success: true, user: nextUser, message: 'Saved on this device. Phone changes on the server need OTP verification.' };
        }
      }
    }

    await persistSession(token, nextUser);
    set({ user: nextUser });
    return { success: true, user: nextUser, message: 'Profile saved.' };
  },
}));

export default useAuthStore;
