import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { translate } from '../i18n/translations';

const LANG_KEY = 'eonlinebazar_language';

const useLanguageStore = create((set, get) => ({
  lang: 'en',

  hydrate: async () => {
    try {
      const stored = await AsyncStorage.getItem(LANG_KEY);
      if (stored === 'en' || stored === 'bn') {
        set({ lang: stored });
      }
    } catch {
      // keep default
    }
  },

  setLanguage: async (lang) => {
    if (lang !== 'en' && lang !== 'bn') return;
    set({ lang });
    await AsyncStorage.setItem(LANG_KEY, lang);
  },

  toggleLanguage: async () => {
    const next = get().lang === 'bn' ? 'en' : 'bn';
    await get().setLanguage(next);
  },

  t: (key, vars) => translate(get().lang, key, vars),
}));

export function useTranslation() {
  const lang = useLanguageStore((state) => state.lang);
  const t = useLanguageStore((state) => state.t);
  return { lang, t };
}

export default useLanguageStore;
