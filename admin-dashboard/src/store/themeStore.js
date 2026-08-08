import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useThemeStore = create(
  persist(
    (set, get) => ({
      darkMode: false,
      setDarkMode: (darkMode) => {
        set({ darkMode });
        document.documentElement.classList.toggle('dark', darkMode);
      },
      toggleDarkMode: () => {
        get().setDarkMode(!get().darkMode);
      },
      hydrateTheme: () => {
        document.documentElement.classList.toggle('dark', get().darkMode);
      },
    }),
    {
      name: 'admin-theme',
      partialize: (state) => ({ darkMode: state.darkMode }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          document.documentElement.classList.toggle('dark', state.darkMode);
        }
      },
    }
  )
);

export default useThemeStore;
