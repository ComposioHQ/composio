import {
  buildSectionResponse,
  currentReferencePages,
  textResponse,
  toolkitStaticPages,
} from '@/lib/llms-sections';

export const revalidate = false;

/** Full text of the current (v3.1) API reference + toolkit/meta-tool pages. */
export async function GET() {
  try {
    return await buildSectionResponse('API Reference', [
      ...currentReferencePages(),
      ...toolkitStaticPages(),
    ]);
  } catch (error) {
    console.error('[llms-reference.txt] Error generating content:', error);
    return textResponse('Error generating LLM content');
  }
}
