import { toolkitsSource } from '@/lib/source';
import { createDocsPage, createGenerateStaticParams, createGenerateMetadata } from '@/lib/create-docs-page';

export default createDocsPage(toolkitsSource);
export const generateStaticParams = createGenerateStaticParams(toolkitsSource);
export const generateMetadata = createGenerateMetadata(toolkitsSource);
