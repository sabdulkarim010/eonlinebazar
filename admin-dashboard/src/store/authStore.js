import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../services/api';

const useAuthStore = create(
  persist(
    (set) => ({
      agent: null,
      token: null,
      isAuthenticated: false,

      login: async (usernameOrEmail, password) => {
        // Main API expects `username`; chat API expects `email` — send both.
        const loginId = String(usernameOrEmail || '').trim();
        const { data } = await api.post('/api/admin/login', {
          username: loginId,
          email: loginId,
          password,
        });
        if (!data?.success || !data?.token) {
          throw new Error(data?.message || 'Login failed');
        }

        localStorage.setItem('token', data.token);

        set({
          agent: data.agent,
          token: data.token,
          isAuthenticated: true,
        });

        return data;
      },

      logout: () => {
        localStorage.removeItem('token');
        set({
          agent: null,
          token: null,
          isAuthenticated: false,
        });
      },

      setAuth: (agent, token) => {
        if (token) localStorage.setItem('token', token);
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
          localStorage.setItem('token', state.token);
        }
      },
    }
  )
);

export default useAuthStore;
