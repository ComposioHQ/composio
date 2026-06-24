'use client';

import { useSyncExternalStore } from 'react';

/**
 * Tiny open/close store for the Eve chat panel, so any "Ask AI" trigger can
 * open it without prop-drilling. Mirrors the old decimal-widget toggle surface.
 */

let open = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function openEveChat() {
  if (open) return;
  open = true;
  emit();
}

export function closeEveChat() {
  if (!open) return;
  open = false;
  emit();
}

export function toggleEveChat() {
  open = !open;
  emit();
}

export function useEveChatOpen(): boolean {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    () => open,
    () => false,
  );
}
