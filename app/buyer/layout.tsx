'use client';

import { LanguageSwitch } from '@/src/components/LanguageSwitch';
import { SyncIndicator } from '@/src/components/StatusBadge';
import { useI18n } from '@/src/lib/i18n';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export default function BuyerLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();

  const tabs = [
    { href: '/buyer/plan', label: t.nav.plan, icon: '📋' },
    { href: '/buyer/purchase', label: t.nav.buy, icon: '🛒' },
    { href: '/buyer/send-load', label: t.nav.send_load, icon: '🚛' },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <Link href="/" className="text-lg font-bold text-emerald-400">
            {t.app_title}
          </Link>
          <div className="flex items-center gap-2">
            <SyncIndicator />
            <LanguageSwitch />
          </div>
        </div>

        {/* Tab bar */}
        <div className="mx-auto flex max-w-lg">
          {tabs.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2.5
                  text-sm font-medium transition-colors
                  ${active
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </header>

      {/* Page content */}
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-4">
        {children}
      </main>
    </div>
  );
}
