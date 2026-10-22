'use client';

import { useMemo, type ReactNode } from 'react';
import type { Root } from 'fumadocs-core/page-tree';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { decorateSidebarBadges } from '@/lib/decorate-sidebar-badges';
import { buildSidebarNavIndex } from '@/lib/sidebar-nav-index';
import type { DocsProduct } from '@/lib/home-navigation';
import { SidebarAnalytics } from './sidebar-analytics';
import { useDocsProduct } from './docs-product-context';

interface ProductDocsLayoutProps {
  children: ReactNode;
  trees: Record<DocsProduct, Root>;
  experimentalUrls: string[];
  newUrls: string[];
}

function ProductDocsLayoutInner({
  children,
  trees,
  experimentalUrls,
  newUrls,
}: ProductDocsLayoutProps) {
  const { product } = useDocsProduct();
  const tree = useMemo(
    () => decorateSidebarBadges(
      trees[product],
      new Set(experimentalUrls),
      new Set(newUrls),
    ),
    [experimentalUrls, newUrls, product, trees],
  );
  const navIndex = useMemo(() => buildSidebarNavIndex(tree), [tree]);

  return (
    <DocsLayout
      containerProps={{ className: 'docs-product-shell' }}
      nav={{ enabled: true, title: null }}
      searchToggle={{ enabled: false }}
      sidebar={{
        collapsible: false,
        footer: null,
        tabs: false,
      }}
      themeSwitch={{ enabled: false }}
      tree={tree}
    >
      <SidebarAnalytics index={navIndex} />
      {children}
    </DocsLayout>
  );
}

export function ProductDocsLayout(props: ProductDocsLayoutProps) {
  return <ProductDocsLayoutInner {...props} />;
}
