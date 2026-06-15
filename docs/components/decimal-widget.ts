'use client';

export type DecimalAPI = {
  show: () => void;
  hide: () => void;
  theme: (config: Record<string, string>) => void;
};

const DECIMAL_SCRIPT_ID = 'decimal-widget-script';
const DECIMAL_SRC = 'https://app.getdecimal.ai/widget/v1/widget.js';
const DECIMAL_WIDGET_ID = 'wgt_Ze0kCx97w7YXIydXpEAbAVWfu7FO6HG1';
const DECIMAL_PUBLIC_CONFIG =
  'eyJhbGciOiJIUzI1NiJ9.eyJ3aWQiOiJ3Z3RfWmUwa0N4OTd3N1lYSXlkWHBFQWJBVldmdTdGTzZIRzEiLCJkb21haW5zIjpbImNvbXBvc2lvLmRldiIsImNvbXBvc2lvLWRlY2ltYWwudmVyY2VsLmFwcCIsImxvY2FsaG9zdDozMDAwIiwiZG9jcy5jb21wb3Npby5kZXYiLCJmdW1hZG9jcy1wc2kudmVyY2VsLmFwcCJdLCJpYXQiOjE3Njk1MDE3NTZ9.j7odPAOmoKSkdkFHQCs7FDpAxHfJuzUOEMb_OuHi81I';

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

let loadPromise: Promise<DecimalAPI | undefined> | undefined;
let themeObserver: MutationObserver | undefined;

export function getDecimal() {
  return (window as typeof window & { Decimal?: DecimalAPI }).Decimal;
}

export function applyDecimalTheme() {
  const decimal = getDecimal();
  if (!decimal) return;

  const isDark = document.documentElement.classList.contains('dark');
  decimal.theme(isDark ? DARK_THEME : LIGHT_THEME);
}

function watchThemeChanges() {
  if (themeObserver) return;

  applyDecimalTheme();
  themeObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.attributeName === 'class') {
        applyDecimalTheme();
      }
    }
  });
  themeObserver.observe(document.documentElement, { attributes: true });
}

function waitForDecimal(timeoutMs = 2000): Promise<DecimalAPI | undefined> {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const check = () => {
      const decimal = getDecimal();
      if (decimal) {
        watchThemeChanges();
        resolve(decimal);
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        resolve(undefined);
        return;
      }

      window.setTimeout(check, 50);
    };

    check();
  });
}

function finishLoading(resolve: (decimal: DecimalAPI | undefined) => void) {
  waitForDecimal().then((decimal) => {
    if (!decimal) {
      loadPromise = undefined;
    }
    resolve(decimal);
  });
}

export function loadDecimalWidget(): Promise<DecimalAPI | undefined> {
  const existingDecimal = getDecimal();
  if (existingDecimal) {
    watchThemeChanges();
    return Promise.resolve(existingDecimal);
  }

  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve) => {
    const existingScript = document.getElementById(DECIMAL_SCRIPT_ID);
    if (existingScript) {
      finishLoading(resolve);
      return;
    }

    const script = document.createElement('script');
    script.id = DECIMAL_SCRIPT_ID;
    script.src = DECIMAL_SRC;
    script.async = true;
    script.dataset.widgetId = DECIMAL_WIDGET_ID;
    script.dataset.publicConfig = DECIMAL_PUBLIC_CONFIG;
    script.dataset.displayMode = 'push-sidebar';

    script.onload = () => {
      finishLoading(resolve);
    };
    script.onerror = () => {
      loadPromise = undefined;
      resolve(undefined);
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}
