import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../services/api';

const TOKEN_KEY = 'chat_admin_token';

const useAuthStore = create(
  persist(
    (set, get) => ({
      agent: null,
      token: null,
      isAuthenticated: false,
      presence: 'online',

      login: async (usernameOrEmail, password) => {
        const loginId = String(usernameOrEmail || '').trim();
        const { data } = await api.post('/admin/login', {
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
          presence: 'online',
        });

        return data;
      },

      logout: () => {
        localStorage.removeItem(TOKEN_KEY);
        set({
          agent: null,
          token: null,
          isAuthenticated: false,
          presence: 'offline',
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

      setAgent: (agent) => {
        set({ agent: { ...get().agent, ...agent } });
      },

      setPresence: (presence) => set({ presence }),
    }),
    {
      name: 'admin-auth',
      partialize: (state) => ({
        agent: state.agent,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        presence: state.presence,
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
