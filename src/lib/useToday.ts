'use client';

import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

export function useToday(): string {
  return useSyncExternalStore(
    emptySubscribe,
    () => new Date().toISOString().slice(0, 10),
    () => ''
  );
}
