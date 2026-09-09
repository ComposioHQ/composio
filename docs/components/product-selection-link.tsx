'use client';

import Link from 'next/link';
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import type { DocsProduct } from '@/lib/home-navigation';
import { useDocsProduct } from './docs-product-context';

type ProductSelectionLinkProps =
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
    children: ReactNode;
    href: string;
    product: DocsProduct;
  };

export function ProductSelectionLink({
  product,
  href,
  children,
  onClick,
  ...props
}: ProductSelectionLinkProps) {
  const { navigateToProduct, persistProduct } = useDocsProduct();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;

    const modified =
      event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (modified || props.target === '_blank') {
      persistProduct(product);
      return;
    }

    event.preventDefault();
    navigateToProduct(product, href, event.currentTarget);
  };

  return (
    <Link href={href} onClick={handleClick} {...props}>
      {children}
    </Link>
  );
}
