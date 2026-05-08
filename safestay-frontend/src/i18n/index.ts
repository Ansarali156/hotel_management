import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import te from './locales/te.json';

const saved = sessionStorage.getItem('lang') ?? localStorage.getItem('lang') ?? 'en';

// i18next v26 stripped `resources`/`initImmediate` from `InitOptions` types,
// but they still work at runtime — cast to any to keep synchronous init.
i18n
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, te: { translation: te } },
    lng: saved,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    initImmediate: false,
    react: {
      useSuspense: false,
    },
  } as any);

export default i18n;
