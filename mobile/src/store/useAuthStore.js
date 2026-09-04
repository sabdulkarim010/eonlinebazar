import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { endpoints } from '../api/endpoints';
import { extractCartItems } from '../api/cart';
import api, {
  clearStoredAuthToken,
  getStoredAuthToken,
  setStoredAuthToken,
} from '../services/api';
import useCartStore, { waitForCartPersist } from './useCartStore';
import useWishlistStore, { waitForWishlistPersist } from './useWishlistStore';
import { profileAPI } from '../api/profile';
import { resolveMediaUrl } from '../utils/normalizeProduct';

const USER_KEY = 'eonlinebazar_user';
const POST_LOGIN_MERGE_TIMEOUT_MS = 20000;

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label || 'operation'} timed out after ${ms}ms`));
    }, ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

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

function pickAvatarSource(user) {
  const candidates = [
    user?.avatar,
    user?.avatarUrl,
    user?.profilePicture,
    user?.image,
  ];
  for (const candidate of candidates) {
    const raw = String(candidate ?? '').trim();
    if (raw) return raw;
  }
  return '';
}

function toPublicUser(user) {
  if (!user) return null;
  const isVerified = Boolean(
    user.isVerified
    || user.emailVerified
    || user.isEmailVerified
    || user.verified
  );
  const avatarRaw = pickAvatarSource(user);
  const wishlistCount = Number(
    user?.wishlistCount
    || (Array.isArray(user?.wishlist) ? user.wishlist.length : 0)
    || 0
  );
  return {
    id: user.id || user._id || null,
    name: user.name || [user.firstName, user.lastName].filter(Boolean).join(' '),
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    email: user.email || '',
    mobile: user.mobile || user.phone || '',
    address: user.address || user.fullAddress || user.deliveryAddress || '',
    isVerified,
    avatar: avatarRaw ? resolveMediaUrl(avatarRaw) : '',
    loyaltyPoints: Number(user?.loyaltyPoints || user?.points || 0),
    walletBalance: Number(user?.walletBalance || user?.wallet || 0),
    ordersCount: Number(user?.ordersCount || 0),
    wishlistCount,
    memberSince: user?.createdAt || user?.memberSince || null,
    walletHistory: Array.isArray(user?.walletHistory) ? user.walletHistory : [],
    rewardSettings: user?.rewardSettings && typeof user.rewardSettings === 'object'
      ? user.rewardSettings
      : null,
  };
}

async function persistSession(token, user) {
  applyAuthHeader(token);
  const writes = [];
  if (token) writes.push(setStoredAuthToken(token));
  else writes.push(clearStoredAuthToken());
  if (user) writes.push(AsyncStorage.setItem(USER_KEY, JSON.stringify(user)));
  else writes.push(AsyncStorage.removeItem(USER_KEY));
  await Promise.all(writes);
}

async function mergeLocalDataAfterLogin(loginCart) {
  try {
    await Promise.all([waitForCartPersist(), waitForWishlistPersist()]);
    const cartStore = useCartStore.getState();
    const loginHasCart = Boolean(
      loginCart
      && (loginCart.merged === true
        || Array.isArray(loginCart.items)
        || Array.isArray(loginCart.data)
        || Array.isArray(loginCart.cart))
    );

    if (loginCart?.merged) {
      cartStore.replaceFromServer(extractCartItems(loginCart));
    } else if (cartStore.items.length > 0) {
      await cartStore.syncToServer();
    } else if (loginHasCart) {
      cartStore.replaceFromServer(extractCartItems(loginCart));
    } else {
      await cartStore.loadFromServer();
    }

    await useWishlistStore.getState().syncToServer();
    await useWishlistStore.getState().loadFromServer();
  } catch (error) {
    console.warn('Local data merge after login failed:', error?.message || error);
  }
}

const useAuthStore = create((set, get) => ({
  user: null,
  token: null,
  isHydrating: true,
  isLoggingIn: false,
  isRegistering: false,

  hydrate: async () => {
    set({ isHydrating: true });
    try {
      const [token, userRaw] = await Promise.all([
        getStoredAuthToken(),
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
        set({ user: null, token: null, isHydrating: false });
        return;
      }

      applyAuthHeader(token);
      set({ token, user: storedUser });

      try {
        const { data } = await api.get(endpoints.profile);
        if (get().token !== token || get().isLoggingIn) {
          return;
        }
        const user = toPublicUser(data);
        if (user?.email) {
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
          set({ user });
        }
      } catch (error) {
        const status = error.response?.status;
        const current = get();
        if (current.isLoggingIn || current.token !== token) {
          console.warn('Profile fetch failed during login race; keeping new session.');
          return;
        }
        if (status === 401 || status === 403) {
          await get().logout();
          return;
        }
        console.warn('Profile hydrate failed:', error?.message || error);
      }
    } catch {
      if (get().isLoggingIn) return;
      applyAuthHeader(null);
      set({ user: null, token: null });
    } finally {
      if (!get().isLoggingIn) {
        set({ isHydrating: false });
      }
    }
  },

  login: async ({ email, password, loginInput, mobile } = {}) => {
    const identifier = String(loginInput || email || mobile || '').trim();
    set({ isLoggingIn: true });
    try {
      await waitForCartPersist();
      const guestCartItems = useCartStore.getState().getGuestMergeItems();
      const { data } = await api.post(endpoints.auth.login, {
        loginInput: identifier,
        email: identifier,
        password,
        guestCartItems,
        cartItems: guestCartItems,
      });

      if (!data?.success || !data.token) {
        return {
          success: false,
          message: data?.message || 'Login failed.',
          needsVerification: Boolean(data?.needsVerification),
          email: data?.email,
        };
      }

      const user = toPublicUser(data.user);
      try {
        await withTimeout(persistSession(data.token, user), 5000, 'persistSession');
        set({ user, token: data.token, isHydrating: false });
        await withTimeout(
          mergeLocalDataAfterLogin(data.cart),
          POST_LOGIN_MERGE_TIMEOUT_MS,
          'mergeLocalDataAfterLogin'
        );
      } catch (postLoginError) {
        applyAuthHeader(data.token);
        set({ user, token: data.token, isHydrating: false });
        console.warn('Post-login persist/merge failed:', postLoginError?.message || postLoginError);
      }
      return { success: true, user, token: data.token };
    } catch (error) {
      const payload = error.response?.data || {};
      return {
        success: false,
        message: payload.message || apiErrorMessage(error, 'Login failed.'),
        needsVerification: Boolean(payload.needsVerification),
        email: payload.email,
      };
    } finally {
      set({ isLoggingIn: false });
    }
  },

  register: async (payload = {}) => {
    set({ isRegistering: true });
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
        return {
          success: false,
          message: data?.message || 'Registration failed.',
        };
      }

      // Backend requires email verification and does not return a JWT on register.
      if (data.token && data.user) {
        const user = toPublicUser(data.user);
        try {
          await withTimeout(persistSession(data.token, user), 5000, 'persistSession');
          set({ user, token: data.token, isHydrating: false });
          await withTimeout(
            mergeLocalDataAfterLogin(data.cart),
            POST_LOGIN_MERGE_TIMEOUT_MS,
            'mergeLocalDataAfterLogin'
          );
        } catch (postRegisterError) {
          applyAuthHeader(data.token);
          set({ user, token: data.token, isHydrating: false });
          console.warn('Post-register persist/merge failed:', postRegisterError?.message || postRegisterError);
        }
        return { success: true, user, token: data.token, ...data };
      }

      return {
        success: true,
        message: data.message,
        email: data.email,
        needsVerification: Boolean(data.needsVerification),
        emailSent: data.emailSent,
      };
    } catch (error) {
      const payload = error.response?.data || {};
      return {
        success: false,
        message: payload.message || apiErrorMessage(error, 'Registration failed.'),
      };
    } finally {
      set({ isRegistering: false });
    }
  },

  uploadAvatar: async (asset) => {
    const token = get().token;
    if (!token || !asset?.uri) {
      return { success: false, message: 'No image selected.' };
    }
    try {
      const formData = new FormData();
      formData.append('avatar', {
        uri: asset.uri,
        type: asset.mimeType || asset.type || 'image/jpeg',
        name: asset.fileName || 'avatar.jpg',
      });
      const { data } = await profileAPI.uploadAvatar(formData);
      if (!data?.success && !data?.avatarUrl) {
        return { success: false, message: data?.message || 'Avatar upload failed.' };
      }
      const avatarUrl = resolveMediaUrl(data.avatarUrl || data.avatar || '');
      const current = get().user || {};
      const merged = { ...current, avatar: avatarUrl };
      await persistSession(token, merged);
      set({ user: merged });
      await get().refreshProfile();
      return { success: true, message: data.message || 'Profile photo updated.', avatar: avatarUrl };
    } catch (error) {
      return {
        success: false,
        message: apiErrorMessage(error, 'Avatar upload failed.'),
      };
    }
  },

  requestContactOtp: async (type, value) => {
    try {
      const { data } = await profileAPI.requestContactOtp(type, value);
      if (data?.success === false) {
        return { success: false, message: data.message || 'Could not send code.' };
      }
      return { success: true, ...data };
    } catch (error) {
      return { success: false, message: apiErrorMessage(error, 'Could not send code.') };
    }
  },

  verifyContactOtp: async (otp) => {
    try {
      const { data } = await profileAPI.verifyContactOtp(otp);
      if (!data?.success) {
        return { success: false, message: data?.message || 'Verification failed.' };
      }
      await get().refreshProfile();
      return { success: true, message: data.message || 'Contact updated.', user: data.user };
    } catch (error) {
      return { success: false, message: apiErrorMessage(error, 'Verification failed.') };
    }
  },

  convertPoints: async (points) => {
    try {
      const { data } = await profileAPI.convertPoints(points);
      if (!data?.success) {
        return { success: false, message: data?.message || 'Conversion failed.' };
      }
      const current = get().user || {};
      const merged = {
        ...current,
        loyaltyPoints: Number(data.loyaltyPoints ?? current.loyaltyPoints ?? 0),
        walletBalance: Number(data.walletBalance ?? current.walletBalance ?? 0),
        walletHistory: Array.isArray(data.walletHistory) ? data.walletHistory : current.walletHistory,
        rewardSettings: data.rewardSettings || current.rewardSettings,
      };
      const token = get().token;
      if (token) await persistSession(token, merged);
      set({ user: merged });
      return { success: true, message: data.message, ...data };
    } catch (error) {
      return { success: false, message: apiErrorMessage(error, 'Conversion failed.') };
    }
  },

  refreshProfile: async () => {
    try {
      const token = get().token || await getStoredAuthToken();
      if (!token) return;
      applyAuthHeader(token);
      const { data } = await api.get(endpoints.profile);
      const refreshed = toPublicUser(data?.user || data);
      if (!refreshed?.email) return;
      const merged = { ...(get().user || {}), ...refreshed };
      await persistSession(token, merged);
      set({ user: merged, token });
    } catch (err) {
      console.warn('Profile refresh failed:', err?.message || err);
    }
  },

  logout: async () => {
    await persistSession(null, null);
    set({
      user: null,
      token: null,
      isHydrating: false,
      isLoggingIn: false,
      isRegistering: false,
    });
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
