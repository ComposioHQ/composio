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
  'auth-config': ['authentication-and-connected-accounts'],
  'sessions-and-execution': ['tools-actions-and-execution'],
  'triggers-and-webhooks': ['triggers-and-workflows'],
  workflows: ['triggers-and-workflows'],
  'tool-router-and-mcp': ['sdk-api-and-mcp'],
  'sdk-and-api': ['sdk-api-and-mcp'],
  'dashboard-and-projects': ['account-billing-and-security'],
  'billing-and-plans': ['account-billing-and-security'],
  'account-and-billing': ['account-billing-and-security'],
  'security-and-trust': ['account-billing-and-security'],
};

const DOC_PATH_AREAS: Array<[prefix: string, area: ProductAreaSlug]> = [
  ['/docs/auth-configuration', 'authentication-and-connected-accounts'],
  ['/docs/providers', 'sdk-api-and-mcp'],
  ['/docs/tools-direct', 'tools-actions-and-execution'],
  ['/docs/setting-up-triggers', 'triggers-and-workflows'],
  ['/docs/extending-sessions', 'tools-actions-and-execution'],
  ['/docs/migration-guide', 'sdk-api-and-mcp'],
  ['/docs/sandbox', 'tools-actions-and-execution'],
  ['/docs/sessions-via-mcp', 'sdk-api-and-mcp'],
  ['/docs/single-toolkit-mcp', 'sdk-api-and-mcp'],
  ['/docs/composio-connect', 'sdk-api-and-mcp'],
  ['/docs/claude-code-plugin', 'sdk-api-and-mcp'],
  ['/docs/cli', 'sdk-api-and-mcp'],
  ['/docs/configuring-sessions', 'tools-actions-and-execution'],
  ['/docs/how-composio-works', 'tools-actions-and-execution'],
  ['/docs/quickstart', 'tools-actions-and-execution'],
  ['/docs/triggers', 'triggers-and-workflows'],
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
  if (input.sourceType === 'example') return ['tools-actions-and-execution'];
  if (input.sourceType === 'reference' || input.sourceType === 'legacy') return ['sdk-api-and-mcp'];
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
  if (input.topics?.includes('errors-and-troubleshooting')) intents.push('troubleshooting');
  if (input.topics?.includes('getting-started')) intents.push('setup');
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
