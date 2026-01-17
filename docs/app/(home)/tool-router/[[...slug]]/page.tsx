import { toolRouterSource } from '@/lib/source';
import { createDocsPage, createGenerateStaticParams, createGenerateMetadata } from '@/lib/create-docs-page';

export default createDocsPage(toolRouterSource);
export const generateStaticParams = createGenerateStaticParams(toolRouterSource);
export const generateMetadata = createGenerateMetadata(toolRouterSource);
