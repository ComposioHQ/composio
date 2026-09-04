import {
  getAlgoliaSearchDocuments,
  type AlgoliaDocsRecord,
} from '@/lib/search-index';
import { getAuthGuideRegistry, validateAuthGuideUrls } from './auth-guides';

export interface SearchReplacementClient {
  replaceAllObjects(input: {
    indexName: string;
    objects: AlgoliaDocsRecord[];
  }): Promise<unknown>;
}

export interface SearchReplacementOptions {
  fetchImpl?: typeof fetch;
  validateExternal?: boolean;
  beforeReplace?: (records: AlgoliaDocsRecord[]) => Promise<void>;
}

export async function buildCompleteSearchReplacement(
  options: SearchReplacementOptions = {},
): Promise<AlgoliaDocsRecord[]> {
  if (options.validateExternal !== false) {
    await validateAuthGuideUrls(getAuthGuideRegistry(), options.fetchImpl);
  }
  return getAlgoliaSearchDocuments();
}

export async function replaceSearchDocuments(
  client: SearchReplacementClient,
  indexName: string,
  options: SearchReplacementOptions = {},
): Promise<AlgoliaDocsRecord[]> {
  const records = await buildCompleteSearchReplacement(options);
  await options.beforeReplace?.(records);
  await client.replaceAllObjects({ indexName, objects: records });
  return records;
}
