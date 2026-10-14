'use client';

import { LanguageSwitch } from '@/src/components/LanguageSwitch';
import { SyncIndicator } from '@/src/components/StatusBadge';
import { useI18n } from '@/src/lib/i18n';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const tabs = [
  { href: '/supervisor/receive', key: 'receive', icon: '📥' },
  { href: '/supervisor/packing', key: 'packing', icon: '📦' },
  { href: '/supervisor/dispatch', key: 'dispatch', icon: '🚛' },
  { href: '/supervisor/count', key: 'count', icon: '🔢' },
] as const;

export default function SupervisorLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              aria-label="Back to dashboard"
            >
              ←
            </Link>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">
                {t.nav.receive} / {t.nav.packing}
              </h1>
              <p className="text-xs text-emerald-400 font-medium">Supervisor</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SyncIndicator />
            <LanguageSwitch />
          </div>
        </div>

        {/* Tab navigation */}
        <nav className="mx-auto flex max-w-lg border-t border-slate-800/80 px-2" aria-label="Supervisor navigation">
          {tabs.map((tab) => {
            const active = pathname === tab.href;
            const label = t.nav[tab.key] || tab.key;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-all border-b-2
                  ${active
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                <span>{tab.icon}</span>
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-lg flex-1 p-4 pb-24">
        {children}
      </main>
    </div>
  );
}
