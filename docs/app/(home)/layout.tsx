import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { headers } from 'next/headers';
import { baseOptions } from '@/lib/layout.shared';
import { EveChatMount } from '@/components/eve-chat-mount';
import { DocsProductProvider } from '@/components/docs-product-context';
import {
  DEFAULT_DOCS_PRODUCT,
  DOCS_PRODUCT_HEADER,
  parseDocsProduct,
} from '@/lib/home-navigation';

export default async function Layout({ children }: LayoutProps<'/'>) {
  const requestHeaders = await headers();
  const initialProduct =
    parseDocsProduct(requestHeaders.get(DOCS_PRODUCT_HEADER)) ?? DEFAULT_DOCS_PRODUCT;

  return (
    <DocsProductProvider initialProduct={initialProduct}>
      <HomeLayout {...baseOptions()}>
        {children}
        <EveChatMount />
      </HomeLayout>
    </DocsProductProvider>
  );
}
