import {
  source,
  toolRouterSource,
  referenceSource,
  examplesSource,
  toolkitsSource,
} from '@/lib/source';
import { createSearchAPI } from 'fumadocs-core/search/server';
import { NextResponse } from 'next/server';

function getSearchIndexes() {
  const allPages = [
    ...source.getPages(),
    ...toolRouterSource.getPages(),
    ...referenceSource.getPages(),
    ...examplesSource.getPages(),
    ...toolkitsSource.getPages(),
  ];

  return allPages.map((page) => ({
    id: page.url,
    title: page.data.title ?? 'Untitled',
    description: page.data.description,
    url: page.url,
    structuredData: page.data.structuredData,
    keywords: 'keywords' in page.data ? page.data.keywords : undefined,
  }));
}

let searchHandler: ReturnType<typeof createSearchAPI>['GET'] | null = null;

export async function GET(request: Request) {
  try {
    if (!searchHandler) {
      const indexes = getSearchIndexes();
      const api = createSearchAPI('advanced', { indexes });
      searchHandler = api.GET;
    }
    return searchHandler(request);
  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { error: 'Search failed', message: String(error) },
      { status: 500 }
    );
  }
}
