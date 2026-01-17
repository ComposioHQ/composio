import { examplesSource } from '@/lib/source';
import { createDocsPage, createGenerateStaticParams, createGenerateMetadata } from '@/lib/create-docs-page';

export default createDocsPage(examplesSource);
export const generateStaticParams = createGenerateStaticParams(examplesSource);
export const generateMetadata = createGenerateMetadata(examplesSource);
