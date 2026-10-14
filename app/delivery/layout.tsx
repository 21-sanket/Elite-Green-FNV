'use client';

import { LanguageSwitch } from '@/src/components/LanguageSwitch';
import { SyncIndicator } from '@/src/components/StatusBadge';
import { useI18n } from '@/src/lib/i18n';
import Link from 'next/link';
import type { ReactNode } from 'react';

export default function DeliveryLayout({ children }: { children: ReactNode }) {
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
                {t.delivery.title}
              </h1>
              <p className="text-xs text-emerald-400 font-medium">Flipkart Receiving</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SyncIndicator />
            <LanguageSwitch />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-lg flex-1 p-4 pb-24">
        {children}
      </main>
    </div>
  );
}
