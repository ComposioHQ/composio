import { buildSectionResponse, orderedDocsPages, textResponse } from '@/lib/llms-sections';

export const revalidate = false;

/** Full text of the core guides only — the smallest full-text slice. */
export async function GET() {
  try {
    return await buildSectionResponse('Documentation', orderedDocsPages());
  } catch (error) {
    console.error('[llms-docs.txt] Error generating content:', error);
    return textResponse('Error generating LLM content');
  }
}
