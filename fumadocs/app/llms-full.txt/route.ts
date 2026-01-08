import {
  source,
  toolRouterSource,
  referenceSource,
  examplesSource,
} from '@/lib/source';
import type { InferPageType } from 'fumadocs-core/source';

export const revalidate = false;

type Page = InferPageType<typeof source>;

async function getPageContent(page: Page): Promise<string> {
  try {
    const processed = await page.data.getText('processed');
    const url = `https://composio.dev${page.url}`;
    return `# ${page.data.title}

URL: ${url}
${page.data.description ? `Description: ${page.data.description}` : ''}

${processed}`;
  } catch {
    return `# ${page.data.title}\n\n${page.data.description || ''}`;
  }
}

export async function GET() {
  try {
    const docsPages = source.getPages();
    const toolRouterPages = toolRouterSource.getPages();
    const referencePages = referenceSource.getPages();
    const examplesPages = examplesSource.getPages();

    const results: string[] = [];

    // Header
    results.push(`# Composio Documentation (Full)

> This is the complete Composio documentation optimized for LLMs and AI agents.
> Generated at: ${new Date().toISOString()}

Composio is the simplest way to connect AI agents to external tools and services.
Connect 250+ tools to your AI agents with a single SDK.

---

## Table of Contents

1. Main Documentation (${docsPages.length} pages)
2. Tool Router (${toolRouterPages.length} pages)
3. Examples (${examplesPages.length} pages)
4. API Reference (${referencePages.length} pages)

---

# SECTION 1: MAIN DOCUMENTATION

`);

    // Main docs
    for (const page of docsPages) {
      const content = await getPageContent(page as Page);
      results.push(content);
      results.push('\n---\n');
    }

    results.push('\n# SECTION 2: TOOL ROUTER\n\n');

    // Tool Router docs
    for (const page of toolRouterPages) {
      const content = await getPageContent(page as Page);
      results.push(content);
      results.push('\n---\n');
    }

    results.push('\n# SECTION 3: EXAMPLES\n\n');

    // Examples
    for (const page of examplesPages) {
      const content = await getPageContent(page as Page);
      results.push(content);
      results.push('\n---\n');
    }

    results.push('\n# SECTION 4: API REFERENCE\n\n');

    // API Reference (limit to avoid massive file)
    const refPages = referencePages.slice(0, 50);
    for (const page of refPages) {
      const content = await getPageContent(page as Page);
      results.push(content);
      results.push('\n---\n');
    }

    if (referencePages.length > 50) {
      results.push(`\n... ${referencePages.length - 50} more reference pages available at https://composio.dev/reference\n`);
    }

    return new Response(results.join('\n'), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch (error) {
    console.error('[llms-full.txt] Error generating content:', error);
    return new Response('Error generating LLM content', {
      status: 500,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }
}
