'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useI18n } from '@/src/lib/i18n';
import { useToday } from '@/src/lib/useToday';
import { LanguageSwitch } from '@/src/components/LanguageSwitch';
import { SyncIndicator } from '@/src/components/StatusBadge';

const tabs = [
  { href: '/owner/dashboard', labelEn: 'Dashboard', labelHi: 'डैशबोर्ड', icon: '🏠' },
  { href: '/owner/orders', labelEn: 'Orders & Plan', labelHi: 'ऑर्डर व योजना', icon: '📝' },
  { href: '/owner/costs', labelEn: 'Costs & Pay', labelHi: 'लागत व भुगतान', icon: '💸' },
  { href: '/owner/reports', labelEn: 'Reports', labelHi: 'रिपोर्ट्स', icon: '📊' },
  { href: '/owner/settings', labelEn: 'Settings', labelHi: 'सेटिंग्स', icon: '⚙️' },
  { href: '/owner/void', labelEn: 'Void', labelHi: 'रद्द करें', icon: '🗑️' },
];

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { locale } = useI18n();
  const today = useToday();

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      {/* Top Header */}
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Link
              href="/"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-sm text-slate-300 hover:text-white"
            >
              ←
            </Link>
            <div>
              <h1 className="text-base font-bold text-white flex items-center gap-1.5">
                <span>👑</span> {locale === 'hi' ? 'मालिक कंसोल' : 'Owner Console'}
              </h1>
              <p className="text-xs text-slate-400">{today}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SyncIndicator />
            <LanguageSwitch />
          </div>
        </div>

        {/* Horizontal Navigation bar */}
        <div className="mx-auto flex max-w-2xl overflow-x-auto border-t border-slate-800/80 px-2 scrollbar-none">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-xs font-semibold transition-colors ${
                  isActive
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{locale === 'hi' ? tab.labelHi : tab.labelEn}</span>
              </Link>
            );
          })}
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-4">{children}</main>
    </div>
  );
}
