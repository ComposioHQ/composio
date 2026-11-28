'use client';

import { useSyncExternalStore } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

const MODES = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
] as const;

const subscribeNoop = () => () => {};

/**
 * Compact header theme control: one icon button that cycles Light → Dark → System.
 * The navbar is already crowded (search, Ask AI, social links, Playground), so a
 * three-button segmented control would push the nav links over the logo.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // False during SSR and hydration, true afterwards: the stored theme is only known on the client.
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);

  const index = Math.max(0, MODES.findIndex((mode) => mode.value === theme));
  const current = MODES[index];
  const next = MODES[(index + 1) % MODES.length];
  const label = mounted
    ? `Theme: ${current.label}. Switch to ${next.label}.`
    : 'Toggle theme';

  return (
    <button
      type="button"
      data-theme-toggle=""
      aria-label={label}
      title={label}
      onClick={() => setTheme(next.value)}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
    >
      {mounted ? <current.Icon className="size-[18px]" /> : <span className="size-[18px]" />}
    </button>
  );
}
