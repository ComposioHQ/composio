import { NextRequest, NextResponse } from 'next/server';
import { searchDocs } from '@/agent/lib/docs-search';

/**
 * Public docs search for AI agents: BM25 over every docs page + toolkit.
 *
 *   GET /api/docs-search?q=trigger+webhook+dedup&limit=8
 *
 * Returns title/description/snippet plus both the HTML and markdown URLs, so
 * an agent can go straight from a query to the right page's `.md` without
 * scanning llms.txt. Advertised in /llms.txt and /skill.md.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 3) {
    return NextResponse.json(
      { error: 'pass ?q= with at least 3 characters', results: [] },
      { status: 400 },
    );
  }

  const rawLimit = Number(request.nextUrl.searchParams.get('limit'));
  const limit = Math.min(Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 8, 20);

  try {
    const { results } = searchDocs(q, { limit, hydrateContent: false, invocation: 'api' });
    return NextResponse.json({
      results: results.map(({ title, url, description, snippet }) => ({
        title,
        description,
        snippet,
        url: `https://docs.composio.dev${url}`,
        markdown: `https://docs.composio.dev${url}.md`,
      })),
    });
  } catch (error) {
    console.warn('[docs-search] failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'search failed', results: [] }, { status: 500 });
  }
}
