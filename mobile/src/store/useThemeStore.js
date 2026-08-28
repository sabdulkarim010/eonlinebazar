import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { palettes } from '../theme/palettes';

const THEME_KEY = 'eonlinebazar_theme';

const useThemeStore = create((set, get) => ({
  mode: 'light',

  hydrate: async () => {
    try {
      const stored = await AsyncStorage.getItem(THEME_KEY);
      if (stored === 'dark' || stored === 'light') {
        set({ mode: stored });
      }
    } catch {
      // keep default light
    }
  },

  toggleTheme: async () => {
    const next = get().mode === 'dark' ? 'light' : 'dark';
    set({ mode: next });
    await AsyncStorage.setItem(THEME_KEY, next);
  },

  setMode: async (mode) => {
    const next = mode === 'dark' ? 'dark' : 'light';
    set({ mode: next });
    await AsyncStorage.setItem(THEME_KEY, next);
  },
}));

export function useAppTheme() {
  const mode = useThemeStore((state) => state.mode);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const colors = palettes[mode] || palettes.light;
  return {
    mode,
    isDark: mode === 'dark',
    colors,
    toggleTheme,
  };
}

export default useThemeStore;
