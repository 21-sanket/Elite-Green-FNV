'use client';

import { useI18n } from '@/src/lib/i18n';
import { useAuth } from '@/src/lib/auth';
import { LanguageSwitch } from '@/src/components/LanguageSwitch';
import { SyncIndicator } from '@/src/components/StatusBadge';
import { UserSwitcher } from '@/src/components/UserSwitcher';
import Link from 'next/link';

interface NavItem {
  href: string;
  labelKey: string;
  icon: string;
  roles: string[];
}

const navItems: NavItem[] = [
  { href: '/buyer/plan', labelKey: 'plan', icon: '📋', roles: ['buyer', 'owner'] },
  { href: '/buyer/purchase', labelKey: 'buy', icon: '🛒', roles: ['buyer', 'owner'] },
  { href: '/buyer/send-load', labelKey: 'send_load', icon: '🚛', roles: ['buyer', 'owner'] },
  { href: '/supervisor/receive', labelKey: 'receive', icon: '📦', roles: ['supervisor', 'owner'] },
  { href: '/supervisor/packing', labelKey: 'packing', icon: '📏', roles: ['supervisor', 'owner'] },
  { href: '/supervisor/dispatch', labelKey: 'dispatch', icon: '🔄', roles: ['supervisor', 'owner'] },
  { href: '/supervisor/count', labelKey: 'count', icon: '🔢', roles: ['supervisor', 'owner'] },
  { href: '/delivery/note', labelKey: 'delivery', icon: '📸', roles: ['delivery', 'owner'] },
  { href: '/seller/sales', labelKey: 'sales', icon: '💰', roles: ['seller', 'supervisor', 'owner'] },
  { href: '/owner/dashboard', labelKey: 'home', icon: '🏠', roles: ['owner'] },
  { href: '/owner/orders', labelKey: 'orders', icon: '📝', roles: ['owner'] },
  { href: '/owner/reports', labelKey: 'reports', icon: '📊', roles: ['owner'] },
  { href: '/owner/settings', labelKey: 'settings', icon: '⚙️', roles: ['owner'] },
];

export default function HomePage() {
  const { t } = useI18n();
  const { currentUser } = useAuth();

  // Filter items by role (if owner or no user selected, show all)
  const visibleItems = currentUser && currentUser.role !== 'owner'
    ? navItems.filter((item) => item.roles.includes(currentUser.role))
    : navItems;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <h1 className="text-base font-bold text-emerald-400">{t.app_title}</h1>
          <div className="flex items-center gap-2">
            <UserSwitcher />
            <SyncIndicator />
            <LanguageSwitch />
          </div>
        </div>
      </header>

      {/* Navigation grid */}
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {visibleItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex flex-col items-center gap-2.5 rounded-2xl border border-slate-800
                         bg-gradient-to-br from-slate-800/60 to-slate-900/60 p-5
                         transition-all hover:border-emerald-500/40 hover:shadow-lg
                         hover:shadow-emerald-500/5 active:scale-95"
            >
              <span className="text-3xl transition-transform group-hover:scale-110">
                {item.icon}
              </span>
              <span className="text-center text-sm font-medium text-slate-300 group-hover:text-white">
                {t.nav[item.labelKey as keyof typeof t.nav]}
              </span>
            </Link>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 px-4 py-3 text-center text-xs text-slate-600">
        FNV Daily Ops v0.1
      </footer>
    </div>
  );
}
