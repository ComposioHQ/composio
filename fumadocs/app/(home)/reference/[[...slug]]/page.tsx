import { referenceSource } from '@/lib/source';
import { createDocsPage, createGenerateStaticParams, createGenerateMetadata } from '@/lib/create-docs-page';

export default createDocsPage(referenceSource);
export const generateStaticParams = createGenerateStaticParams(referenceSource);
export const generateMetadata = createGenerateMetadata(referenceSource);
