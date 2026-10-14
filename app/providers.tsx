'use client';

import { I18nProvider } from '@/src/lib/i18n';
import { AuthProvider } from '@/src/lib/auth';
import type { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <AuthProvider>
        {children}
      </AuthProvider>
    </I18nProvider>
  );
}
