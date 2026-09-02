'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import {
  classifyDocsProduct,
  serializeDocsProductCookie,
  shouldAnimateDocsProductSwitch,
  type DocsProduct,
} from '@/lib/home-navigation';

interface DocsProductContextValue {
  product: DocsProduct;
  navigateToProduct: (
    product: DocsProduct,
    href: string,
    origin?: HTMLElement | null,
  ) => void;
  persistProduct: (product: DocsProduct) => void;
}

interface ViewTransitionHandle {
  finished: Promise<void>;
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (
    update: () => void | Promise<void>,
  ) => ViewTransitionHandle;
};

const DocsProductContext = createContext<DocsProductContextValue | null>(null);

function writeProductCookie(product: DocsProduct): void {
  document.cookie = serializeDocsProductCookie(product);
}

export function DocsProductProvider({
  initialProduct,
  children,
}: {
  initialProduct: DocsProduct;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [persistedProduct, setPersistedProduct] = useState(initialProduct);
  const [pendingProduct, setPendingProduct] = useState<DocsProduct | null>(null);
  const pendingNavigation = useRef<{
    from: string;
    resolve: () => void;
  } | null>(null);

  const inferredProduct = classifyDocsProduct(pathname);
  const product = pendingProduct ?? inferredProduct ?? persistedProduct;

  const persistProduct = useCallback((nextProduct: DocsProduct) => {
    writeProductCookie(nextProduct);
    setPersistedProduct(nextProduct);
  }, []);

  useEffect(() => {
    if (inferredProduct) {
      writeProductCookie(inferredProduct);
    }

    if (pendingNavigation.current && pendingNavigation.current.from !== pathname) {
      pendingNavigation.current.resolve();
      pendingNavigation.current = null;
    }

    const frame = window.requestAnimationFrame(() => {
      if (inferredProduct) setPersistedProduct(inferredProduct);
      setPendingProduct(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [inferredProduct, pathname]);

  useEffect(() => {
    return () => {
      pendingNavigation.current?.resolve();
      pendingNavigation.current = null;
      document.documentElement.classList.remove('docs-product-transition');
    };
  }, []);

  const navigateToProduct = useCallback(
    (nextProduct: DocsProduct, href: string, origin?: HTMLElement | null) => {
      const commitNavigation = () => {
        writeProductCookie(nextProduct);
        flushSync(() => {
          setPersistedProduct(nextProduct);
          setPendingProduct(nextProduct);
        });
        if (href !== pathname) router.push(href);
      };

      const viewTransitionDocument = document as ViewTransitionDocument;
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const startViewTransition =
        viewTransitionDocument.startViewTransition?.bind(viewTransitionDocument);
      const shouldAnimate = shouldAnimateDocsProductSwitch(
        typeof startViewTransition === 'function',
        reduceMotion,
      );

      if (!shouldAnimate || !startViewTransition) {
        commitNavigation();
        return;
      }

      const root = document.documentElement;
      const rect = origin?.getBoundingClientRect();
      root.style.setProperty('--docs-reveal-x', `${rect ? rect.left + rect.width / 2 : 32}px`);
      root.style.setProperty('--docs-reveal-y', `${rect ? rect.top + rect.height / 2 : 32}px`);
      root.classList.add('docs-product-transition');

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        root.classList.remove('docs-product-transition');
        root.style.removeProperty('--docs-reveal-x');
        root.style.removeProperty('--docs-reveal-y');
      };
      window.setTimeout(cleanup, 2500);

      try {
        const transition = startViewTransition(() => {
          if (href === pathname) {
            commitNavigation();
            return;
          }

          return new Promise<void>(resolve => {
            pendingNavigation.current?.resolve();
            const finish = () => resolve();
            window.setTimeout(() => {
              if (pendingNavigation.current?.resolve === finish) {
                pendingNavigation.current = null;
                setPendingProduct(null);
              }
              finish();
            }, 1500);
            pendingNavigation.current = {
              from: pathname,
              resolve: finish,
            };
            commitNavigation();
          });
        });
        void transition.finished.catch(() => undefined).finally(cleanup);
      } catch {
        cleanup();
        commitNavigation();
      }
    },
    [pathname, router],
  );

  const value = useMemo(
    () => ({ product, navigateToProduct, persistProduct }),
    [navigateToProduct, persistProduct, product],
  );

  return <DocsProductContext.Provider value={value}>{children}</DocsProductContext.Provider>;
}

export function useDocsProduct(): DocsProductContextValue {
  const value = useContext(DocsProductContext);
  if (!value) throw new Error('useDocsProduct must be used inside DocsProductProvider');
  return value;
}
