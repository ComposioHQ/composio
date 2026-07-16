import { buildSectionResponse, examplesPages, textResponse } from '@/lib/llms-sections';

export const revalidate = false;

/** Full text of the worked example projects. */
export async function GET() {
  try {
    return await buildSectionResponse('Examples', examplesPages());
  } catch (error) {
    console.error('[llms-examples.txt] Error generating content:', error);
    return textResponse('Error generating LLM content');
  }
}
