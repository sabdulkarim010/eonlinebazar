import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../services/api';

const TOKEN_KEY = 'chat_admin_token';

const useAuthStore = create(
  persist(
    (set) => ({
      agent: null,
      token: null,
      isAuthenticated: false,

      login: async (usernameOrEmail, password) => {
        // Chat API accepts email; also send username for compatibility.
        const loginId = String(usernameOrEmail || '').trim();
        const { data } = await api.post('/api/admin/login', {
          username: loginId,
          email: loginId,
          password,
        });
        if (!data?.success || !data?.token) {
          throw new Error(data?.message || 'Login failed');
        }

        localStorage.setItem(TOKEN_KEY, data.token);

        set({
          agent: data.agent,
          token: data.token,
          isAuthenticated: true,
        });

        return data;
      },

      logout: () => {
        localStorage.removeItem(TOKEN_KEY);
        set({
          agent: null,
          token: null,
          isAuthenticated: false,
        });
      },

      setAuth: (agent, token) => {
        if (token) localStorage.setItem(TOKEN_KEY, token);
        set({
          agent,
          token,
          isAuthenticated: Boolean(token),
        });
      },
    }),
    {
      name: 'admin-auth',
      partialize: (state) => ({
        agent: state.agent,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          localStorage.setItem(TOKEN_KEY, state.token);
        }
      },
    }
  )
);

export default useAuthStore;
