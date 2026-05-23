import { cookbooksSource } from '@/lib/source';
import { createDocsPage, createGenerateStaticParams, createGenerateMetadata } from '@/lib/create-docs-page';
import { PersonaRecipes } from '@/components/cookbooks/persona-recipes';

export default createDocsPage(cookbooksSource, 'content/cookbooks', {
  afterBody: (page) => <PersonaRecipes slug={page.slugs.join('/')} />,
});
export const generateStaticParams = createGenerateStaticParams(cookbooksSource);
export const generateMetadata = createGenerateMetadata(cookbooksSource, 'cookbooks');
