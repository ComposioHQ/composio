import { getPublishedKbGuides, getKbGuideUrl } from '@/lib/kb/repository';
import { getKnowledgeToolkitSummaries } from './catalog';
import { PRODUCT_AREAS } from './taxonomy';
import { getToolkitKnowledgeRedirect } from './toolkit-routing';

export async function getLocalKnowledgeDiscoveryPaths(): Promise<string[]> {
  const toolkitPages = (await getKnowledgeToolkitSummaries())
    .filter((toolkit) => !getToolkitKnowledgeRedirect(toolkit))
    .map((toolkit) => `/kb/toolkit/${toolkit.slug}`);
  const topicPages = PRODUCT_AREAS.filter((area) => area.defaultBrowse).map(
    (area) => `/kb/topic/${area.slug}`,
  );
  const guidePages = getPublishedKbGuides().map(getKbGuideUrl);

  return Array.from(new Set([
    '/kb',
    '/kb/search',
    ...topicPages,
    '/kb/toolkits',
    ...toolkitPages,
    ...guidePages,
  ]));
}

export function formatKnowledgeDiscoveryLinks(paths: string[]): string {
  return paths
    .map((path) => `- https://docs.composio.dev${path.startsWith('/kb/guide/') ? `${path}.md` : path}`)
    .join('\n');
}
