'use client';

import { useEffect } from 'react';
import { useTheme } from 'next-themes';

const THEME_COLORS = { light: '#ffffff', dark: '#131211' } as const;

/** Keeps the browser chrome color in step with the resolved docs theme. */
export function ThemeColorSync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (resolvedTheme !== 'light' && resolvedTheme !== 'dark') return;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLORS[resolvedTheme]);
  }, [resolvedTheme]);

  return null;
}
