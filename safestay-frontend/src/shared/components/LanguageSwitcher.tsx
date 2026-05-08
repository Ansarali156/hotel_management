import { useTranslation } from 'react-i18next';

export default function LanguageSwitcher({ dark = false }: { dark?: boolean }) {
  const { i18n } = useTranslation();
  const isTelugu = i18n.language === 'te';

  const toggle = () => {
    const next = isTelugu ? 'en' : 'te';
    i18n.changeLanguage(next);
    sessionStorage.setItem('lang', next);
  };

  return (
    <button
      onClick={toggle}
      title={isTelugu ? 'Switch to English' : 'తెలుగుకు మార్చు'}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
        dark
          ? 'border-white/30 text-white hover:bg-white/10'
          : 'border-slate-200 text-slate-600 hover:bg-slate-100'
      }`}
    >
      <span className="text-base leading-none">{isTelugu ? '🇮🇳' : '🇮🇳'}</span>
      <span>{isTelugu ? 'EN' : 'తెలుగు'}</span>
    </button>
  );
}
