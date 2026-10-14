'use client';

import { useI18n } from '@/src/lib/i18n';

export function LanguageSwitch() {
  const { toggleLocale, t } = useI18n();
  return (
    <button
      onClick={toggleLocale}
      className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium
                 text-white backdrop-blur-sm transition-all hover:bg-white/20 active:scale-95"
      aria-label="Switch language"
    >
      <span className="text-base">{t.language_switch}</span>
    </button>
  );
}
