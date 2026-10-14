'use client';

import { createContext, useContext, useCallback, useSyncExternalStore, type ReactNode } from 'react';
import en from './en.json';
import hi from './hi.json';

type Locale = 'en' | 'hi';
type Messages = typeof en;

const locales: Record<Locale, Messages> = { en, hi };

interface I18nContextValue {
  locale: Locale;
  t: Messages;
  setLocale: (l: Locale) => void;
  toggleLocale: () => void;
  /** Format paise as ₹ string: 150000 → "₹1,500.00" */
  formatPaise: (paise: number) => string;
  /** Format quantity with unit */
  formatQty: (qty: number, unit: 'kg' | 'pcs' | 'packs') => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = 'fnv_locale';

function subscribeLocale(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', callback);
  window.addEventListener('fnv_locale_change', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('fnv_locale_change', callback);
  };
}

function getLocaleSnapshot(): Locale {
  if (typeof window === 'undefined') return 'en';
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === 'hi' ? 'hi' : 'en';
}

function getLocaleServerSnapshot(): Locale {
  return 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribeLocale, getLocaleSnapshot, getLocaleServerSnapshot);

  const setLocale = useCallback((l: Locale) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, l);
      window.dispatchEvent(new Event('fnv_locale_change'));
    }
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === 'en' ? 'hi' : 'en');
  }, [locale, setLocale]);

  const formatPaise = useCallback((paise: number) => {
    const rupees = paise / 100;
    return new Intl.NumberFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    }).format(rupees);
  }, [locale]);

  const formatQty = useCallback((qty: number, unit: 'kg' | 'pcs' | 'packs') => {
    const t = locales[locale];
    const num = Number.isInteger(qty) ? qty.toString() : qty.toFixed(1);
    return `${num} ${t.common[unit]}`;
  }, [locale]);

  return (
    <I18nContext.Provider value={{
      locale,
      t: locales[locale],
      setLocale,
      toggleLocale,
      formatPaise,
      formatQty,
    }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
