import { isProductAreaSlug } from './taxonomy';
import type {
  KnowledgeClassificationInput,
  KnowledgeIntent,
  KnowledgeMetadata,
  ProductAreaSlug,
} from './types';

const KB_TOPIC_AREAS: Record<string, ProductAreaSlug[]> = {
  authentication: ['authentication-and-connected-accounts'],
  'connected-accounts': ['authentication-and-connected-accounts'],
  toolkits: ['tools-and-actions'],
  'triggers-and-webhooks': ['triggers-and-webhooks'],
  'tool-router-and-mcp': ['tool-router-mcp-and-workbench'],
  'sdk-and-api': ['sdk-and-api'],
  'dashboard-and-projects': ['projects-dashboard-and-billing'],
  'billing-and-plans': ['projects-dashboard-and-billing'],
  'composio-for-you': ['composio-for-you'],
};

const DOC_PATH_AREAS: Array<[prefix: string, area: ProductAreaSlug]> = [
  ['/docs/auth-configuration', 'authentication-and-connected-accounts'],
  ['/docs/providers', 'sdk-and-api'],
  ['/docs/tools-direct', 'tools-and-actions'],
  ['/docs/setting-up-triggers', 'triggers-and-webhooks'],
  ['/docs/extending-sessions', 'tool-router-mcp-and-workbench'],
  ['/docs/migration-guide', 'sdk-and-api'],
  ['/docs/sandbox', 'tool-router-mcp-and-workbench'],
];

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function inferredProductAreas(input: KnowledgeClassificationInput): ProductAreaSlug[] {
  if (input.sourceType === 'kb') {
    return unique((input.topics ?? []).flatMap((topic) => KB_TOPIC_AREAS[topic] ?? []));
  }
  if (input.sourceType === 'docs') {
    return DOC_PATH_AREAS
      .filter(([prefix]) => input.canonicalUrl === prefix || input.canonicalUrl.startsWith(`${prefix}/`))
      .map(([, area]) => area);
  }
  if (input.sourceType === 'oauth-guide') return ['authentication-and-connected-accounts'];
  if (input.sourceType === 'toolkit' || input.sourceType === 'example') return ['tools-and-actions'];
  if (input.sourceType === 'reference' || input.sourceType === 'legacy') return ['sdk-and-api'];
  return [];
}

function inferredIntents(input: KnowledgeClassificationInput): KnowledgeIntent[] {
  const intents: KnowledgeIntent[] = [];
  if (input.sourceType === 'oauth-guide') intents.push('setup');
  if (input.sourceType === 'docs' || input.sourceType === 'kb' || input.sourceType === 'example') {
    intents.push('how-to');
  }
  if (input.sourceType === 'toolkit' || input.sourceType === 'reference' || input.sourceType === 'legacy') {
    intents.push('reference');
  }
  if (input.topics?.includes('incidents-and-known-issues')) intents.push('known-issue');
  return unique(intents);
}

export function normalizeToolkitSlug(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}

export function normalizeKnowledgeKeywords(values: string[]): string[] {
  return unique(values.map((value) => value.trim()).filter(
    (value) => value.length > 0 && !/\brube\b/i.test(value),
  ));
}

export function classifyKnowledgeRecord(
  input: KnowledgeClassificationInput,
): KnowledgeMetadata {
  if (!input.canonicalUrl.trim()) throw new Error('Knowledge records require a canonical URL');

  const explicitAreas = (input.productAreas ?? []).filter(isProductAreaSlug);
  const productAreas = unique([...explicitAreas, ...inferredProductAreas(input)]);
  const toolkitSlugs = unique(
    (input.toolkitSlugs ?? []).map(normalizeToolkitSlug).filter(Boolean),
  );

  return {
    source_type: input.sourceType,
    canonical_url: input.canonicalUrl,
    product_areas: productAreas,
    toolkit_slugs: toolkitSlugs,
    intents: unique(input.intents?.length ? input.intents : inferredIntents(input)),
    last_verified_at: input.lastVerifiedAt?.trim() || null,
  };
}
