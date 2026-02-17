import { cookbooksSource } from '@/lib/source';
import { createDocsPage, createGenerateStaticParams, createGenerateMetadata } from '@/lib/create-docs-page';

export default createDocsPage(cookbooksSource);
export const generateStaticParams = createGenerateStaticParams(cookbooksSource);
export const generateMetadata = createGenerateMetadata(cookbooksSource, 'cookbooks');
