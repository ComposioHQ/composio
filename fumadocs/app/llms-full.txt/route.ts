import { source } from '@/lib/source';

export const revalidate = false;

export async function GET() {
  const pages = source.getPages();
  const results: string[] = [];

  for (const page of pages) {
    try {
      const processed = await page.data.getText('processed');
      results.push(`# ${page.data.title}\n\n${processed}`);
    } catch {
      // Fallback to basic info if getText fails
      results.push(`# ${page.data.title}\n\n${page.data.description || ''}`);
    }
  }

  return new Response(results.join('\n\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
