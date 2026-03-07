'use client';

import Script from 'next/script';
import { useEffect, useState } from 'react';
import { setWidgetOpen, wasWidgetDismissed } from './ask-ai-button';

export type DecimalAPI = {
  show: () => void;
  hide: () => void;
  theme: (config: Record<string, string>) => void;
};

const DARK_THEME = {
  colorScheme: 'dark',
  primaryColor: '#1e1d1c',
  backgroundColor: '#131211',
  textColor: '#FAFAFA',
  textColorSecondary: '#FFFFFF',
  textColorMuted: '#A1A1AA',
  borderColor: '#27272A',
};

const LIGHT_THEME = {
  colorScheme: 'light',
  primaryColor: '#171414',
  backgroundColor: '#ffffff',
  textColor: '#171414',
  textColorSecondary: '#ffffff',
  textColorMuted: '#5c5858',
  borderColor: '#e5e0df',
};

/** Minimum viewport width (px) to auto-open the AI sidebar */
const AUTO_OPEN_MIN_WIDTH = 1024;

export function DecimalWidget() {
  const [scriptLoaded, setScriptLoaded] = useState(false);

  useEffect(() => {
    if (!scriptLoaded) return;

    const Decimal = (window as typeof window & { Decimal?: DecimalAPI }).Decimal;
    if (!Decimal) return;

    const applyTheme = () => {
      const isDark = document.documentElement.classList.contains('dark');
      Decimal.theme(isDark ? DARK_THEME : LIGHT_THEME);
    };

    applyTheme();

    const themeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'class') {
          applyTheme();
        }
      }
    });
    themeObserver.observe(document.documentElement, { attributes: true });

    // Auto-open on wide desktop screens unless user dismissed it this session
    if (window.innerWidth >= AUTO_OPEN_MIN_WIDTH && !wasWidgetDismissed()) {
      Decimal.show();
      setWidgetOpen(true);
    }

    return () => themeObserver.disconnect();
  }, [scriptLoaded]);

  return (
    <Script
      src="https://app.getdecimal.ai/widget/v1/widget.js"
      data-widget-id="wgt_Ze0kCx97w7YXIydXpEAbAVWfu7FO6HG1"
      data-public-config="eyJhbGciOiJIUzI1NiJ9.eyJ3aWQiOiJ3Z3RfWmUwa0N4OTd3N1lYSXlkWHBFQWJBVldmdTdGTzZIRzEiLCJkb21haW5zIjpbImNvbXBvc2lvLmRldiIsImNvbXBvc2lvLWRlY2ltYWwudmVyY2VsLmFwcCIsImxvY2FsaG9zdDozMDAwIiwiZG9jcy5jb21wb3Npby5kZXYiLCJmdW1hZG9jcy1wc2kudmVyY2VsLmFwcCJdLCJpYXQiOjE3Njk1MDE3NTZ9.j7odPAOmoKSkdkFHQCs7FDpAxHfJuzUOEMb_OuHi81I"
      data-display-mode="push-sidebar"
      strategy="afterInteractive"
      onLoad={() => setScriptLoaded(true)}
    />
  );
}
