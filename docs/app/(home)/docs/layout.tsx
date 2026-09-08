import { source } from '@/lib/source';
import { ProductDocsLayout } from '@/components/product-docs-layout';
import { buildProductPageTree } from '@/lib/product-page-tree';

interface BadgeFrontmatter {
  experimental?: boolean;
  isNew?: boolean;
}

const pages = source.getPages();
const experimentalUrls = new Set(
  pages.filter((page) => (page.data as BadgeFrontmatter).experimental).map((page) => page.url),
);
const newUrls = new Set(
  pages.filter((page) => (page.data as BadgeFrontmatter).isNew).map((page) => page.url),
);

const trees = {
  'for-you': buildProductPageTree(source.pageTree, 'for-you'),
  platform: buildProductPageTree(source.pageTree, 'platform'),
};

export default function Layout({ children }: LayoutProps<'/docs'>) {
  return (
    <ProductDocsLayout
      experimentalUrls={[...experimentalUrls]}
      newUrls={[...newUrls]}
      trees={trees}
    >
      {children}
    </ProductDocsLayout>
  );
}
