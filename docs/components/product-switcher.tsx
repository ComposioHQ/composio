'use client';

import { useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Check, ChevronsUpDown } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from 'fumadocs-ui/components/ui/popover';
import {
  DOCS_PRODUCT_ORDER,
  DOCS_PRODUCTS,
  docsProductDestination,
  type DocsProduct,
} from '@/lib/home-navigation';
import { ProductLockup } from './product-lockup';
import { useDocsProduct } from './docs-product-context';
import { cn } from '@/lib/utils';

export function ProductSwitcher({ placement = 'sidebar' }: { placement?: 'nav' | 'sidebar' }) {
  const pathname = usePathname();
  const router = useRouter();
  const { product, navigateToProduct } = useDocsProduct();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const current = DOCS_PRODUCTS[product];

  const selectProduct = (nextProduct: DocsProduct) => {
    if (nextProduct === product) {
      setOpen(false);
      return;
    }

    const destination = docsProductDestination(pathname, nextProduct);
    setOpen(false);
    navigateToProduct(nextProduct, destination, triggerRef.current);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={`Switch Composio product. Current product: ${current.product}`}
          className={cn(
            'docs-product-switcher group flex items-center gap-2 text-left text-fd-foreground transition-colors hover:bg-fd-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring',
            placement === 'nav'
              ? 'h-10 min-w-0 px-1.5 max-sm:gap-1'
              : 'min-h-14 w-full justify-between border border-fd-border bg-fd-background px-3 py-2 shadow-xs',
          )}
          onFocus={() => {
            for (const productId of DOCS_PRODUCT_ORDER) {
              if (productId !== product) {
                router.prefetch(docsProductDestination(pathname, productId));
              }
            }
          }}
          onMouseEnter={() => {
            for (const productId of DOCS_PRODUCT_ORDER) {
              if (productId !== product) {
                router.prefetch(docsProductDestination(pathname, productId));
              }
            }
          }}
          ref={triggerRef}
          type="button"
        >
          <ProductLockup compactOnMobile={placement === 'nav'} product={product} />
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-fd-muted-foreground group-hover:text-fd-foreground">
            {placement === 'sidebar' && 'Switch'}
            <ChevronsUpDown aria-hidden="true" className="size-3.5" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(20rem,calc(100vw-2rem))] p-1"
        side="bottom"
        sideOffset={8}
      >
        <div aria-label="Choose a Composio product" role="radiogroup">
          {DOCS_PRODUCT_ORDER.map((productId, index) => {
            const option = DOCS_PRODUCTS[productId];
            const isCurrent = productId === product;
            return (
              <div key={productId}>
                {index > 0 && <div aria-hidden="true" className="mx-2 my-1 h-px bg-fd-border" />}
                <button
                  aria-checked={isCurrent}
                  aria-current={isCurrent ? 'page' : undefined}
                  aria-label={`${option.product}: ${option.switcherDescription}`}
                  className="flex w-full items-start gap-3 p-2.5 text-left transition-colors hover:bg-fd-accent/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-fd-ring"
                  onClick={() => selectProduct(productId)}
                  role="radio"
                  type="button"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-2">
                    <ProductLockup product={productId} />
                    <span className="text-sm font-normal text-fd-muted-foreground">
                      {option.switcherDescription}
                    </span>
                  </span>
                  <Check
                    aria-hidden="true"
                    className={`mt-1 size-4 shrink-0 text-fd-primary ${isCurrent ? '' : 'invisible'}`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ProductNavTitle({ className }: ComponentProps<'a'>) {
  return (
    <div className={cn(className, 'min-w-0')}>
      <ProductSwitcher placement="nav" />
    </div>
  );
}
