import { NextRequest, NextResponse } from 'next/server';
import { searchDocs, shouldRunEagerDocsSearch } from '@/agent/lib/docs-search';

const EAGER_PREVIEW_LIMIT = 3;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { message?: unknown };
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (message.length < 3) {
      return NextResponse.json({ sources: [] });
    }

    if (!shouldRunEagerDocsSearch(message)) {
      return NextResponse.json({ sources: [] });
    }

    const result = searchDocs(message, {
      limit: EAGER_PREVIEW_LIMIT,
      hydrateContent: false,
      invocation: 'eager_preview',
    });

    return NextResponse.json({
      sources: result.results.map(({ title, url }) => ({ title, url })),
    });
  } catch (error) {
    console.warn('[docs-agent:eager_preview] failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ sources: [] }, { status: 500 });
  }
}
