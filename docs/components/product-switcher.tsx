'use client';

import { useState } from 'react';
import type { ComponentProps } from 'react';
import Link from 'next/link';
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
} from '@/lib/home-navigation';
import { ComposioWordmark, ProductBadge, ProductLockup } from './product-lockup';
import { ProductSelectionLink } from './product-selection-link';
import { useDocsProduct } from './docs-product-context';
import { cn } from '@/lib/utils';

export function ProductSwitcher({ placement = 'sidebar' }: { placement?: 'nav' | 'sidebar' }) {
  const pathname = usePathname();
  const router = useRouter();
  const { product } = useDocsProduct();
  const [open, setOpen] = useState(false);
  const current = DOCS_PRODUCTS[product];

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
          type="button"
        >
          {placement === 'nav' ? (
            <ProductBadge product={product} />
          ) : (
            <ProductLockup product={product} />
          )}
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-fd-muted-foreground group-hover:text-fd-foreground">
            {placement === 'sidebar' && 'Switch'}
            <ChevronsUpDown aria-hidden="true" className="size-3.5" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label="Choose a Composio product"
        className="w-[min(20rem,calc(100vw-2rem))] p-1"
        side="bottom"
        sideOffset={8}
      >
        <div>
          {DOCS_PRODUCT_ORDER.map((productId, index) => {
            const option = DOCS_PRODUCTS[productId];
            const isCurrent = productId === product;
            const destination = docsProductDestination(pathname, productId);
            return (
              <div key={productId}>
                {index > 0 && <div aria-hidden="true" className="mx-2 my-1 h-px bg-fd-border" />}
                <ProductSelectionLink
                  aria-current={isCurrent ? 'page' : undefined}
                  className="flex w-full items-start gap-3 p-2.5 text-left transition-colors hover:bg-fd-accent/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-fd-ring"
                  href={destination}
                  onClick={event => {
                    setOpen(false);
                    if (isCurrent) event.preventDefault();
                  }}
                  product={productId}
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
                </ProductSelectionLink>
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
    <div className={cn(className, 'flex min-w-0 items-center gap-1')}>
      <Link
        aria-label="Composio home"
        className="shrink-0 rounded-sm px-1.5 max-[420px]:hidden"
        href="/"
      >
        <ComposioWordmark />
      </Link>
      <ProductSwitcher placement="nav" />
    </div>
  );
}
