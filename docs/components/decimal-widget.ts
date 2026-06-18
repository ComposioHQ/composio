'use client';

export type DecimalAPI = {
  show: () => void;
  hide: () => void;
  theme: (config: Record<string, string>) => void;
};

const DECIMAL_SCRIPT_ID = 'decimal-widget-script';
const DECIMAL_SRC = 'https://app.getdecimal.ai/widget/v1/widget.js';
const DECIMAL_WIDGET_ID = 'wgt_Ze0kCx97w7YXIydXpEAbAVWfu7FO6HG1';
const DECIMAL_MOBILE_CLOSE_ID = 'decimal-mobile-close-button';
const MOBILE_VIEWPORT_QUERY = '(max-width: 767px)';
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
let closeButtonViewportQuery: MediaQueryList | undefined;
let decimalWidgetRequestedOpen = false;

export function getDecimal() {
  return (window as typeof window & { Decimal?: DecimalAPI }).Decimal;
}

export function isDecimalWidgetVisible(): boolean {
  const sidebar = document.querySelector('.decimal-widget-sidebar');
  return sidebar?.classList.contains('open') ?? false;
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

function isMobileViewport() {
  return window.matchMedia(MOBILE_VIEWPORT_QUERY).matches;
}

function syncMobileCloseButtonVisibility() {
  const button = document.getElementById(DECIMAL_MOBILE_CLOSE_ID);
  if (!button) return;

  button.style.display = isMobileViewport() && decimalWidgetRequestedOpen ? 'inline-flex' : 'none';
}

function ensureMobileCloseButton() {
  let button = document.getElementById(DECIMAL_MOBILE_CLOSE_ID) as HTMLButtonElement | null;
  if (!button) {
    button = document.createElement('button');
    button.id = DECIMAL_MOBILE_CLOSE_ID;
    button.type = 'button';
    button.setAttribute('aria-label', 'Close Ask AI');
    button.innerHTML = '&times;';
    button.style.cssText = [
      'position: fixed',
      'top: calc(env(safe-area-inset-top, 0px) + 12px)',
      'right: 12px',
      'z-index: 2147483647',
      'width: 44px',
      'height: 44px',
      'align-items: center',
      'justify-content: center',
      'border-radius: 9999px',
      'border: 1px solid rgba(23, 20, 20, 0.12)',
      'background: rgba(255, 255, 255, 0.96)',
      'color: #171414',
      'box-shadow: 0 12px 32px rgba(23, 20, 20, 0.18)',
      'font-size: 28px',
      'font-weight: 400',
      'line-height: 1',
      'display: none',
    ].join(';');
    button.addEventListener('click', closeDecimalWidget);
    document.body.appendChild(button);
  }

  if (!closeButtonViewportQuery) {
    closeButtonViewportQuery = window.matchMedia(MOBILE_VIEWPORT_QUERY);
    closeButtonViewportQuery.addEventListener('change', syncMobileCloseButtonVisibility);
  }

  syncMobileCloseButtonVisibility();
}

export function closeDecimalWidget() {
  decimalWidgetRequestedOpen = false;
  getDecimal()?.hide();
  syncMobileCloseButtonVisibility();
}

export function openDecimalWidget(decimal: DecimalAPI) {
  decimalWidgetRequestedOpen = true;
  decimal.show();
  ensureMobileCloseButton();
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
