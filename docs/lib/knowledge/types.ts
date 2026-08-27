export type KnowledgeSourceType =
  | 'docs'
  | 'kb'
  | 'oauth-guide'
  | 'toolkit'
  | 'example'
  | 'reference'
  | 'changelog'
  | 'legacy';

export type ProductAreaSlug =
  | 'authentication-and-connected-accounts'
  | 'tools-actions-and-execution'
  | 'triggers-and-workflows'
  | 'sdk-api-and-mcp'
  | 'account-billing-and-security';

export type KnowledgeIntent =
  | 'setup'
  | 'how-to'
  | 'troubleshooting'
  | 'limits-policy'
  | 'known-issue'
  | 'reference';

export interface ProductArea {
  slug: ProductAreaSlug;
  title: string;
  description: string;
  defaultBrowse: boolean;
}

export interface KnowledgeMetadata {
  source_type: KnowledgeSourceType;
  canonical_url: string;
  product_areas: ProductAreaSlug[];
  toolkit_slugs: string[];
  intents: KnowledgeIntent[];
  last_verified_at: string | null;
}

export interface KnowledgeClassificationInput {
  sourceType: KnowledgeSourceType;
  canonicalUrl: string;
  productAreas?: string[];
  topics?: string[];
  toolkitSlugs?: string[];
  intents?: KnowledgeIntent[];
  lastVerifiedAt?: string | null;
}

export const KNOWLEDGE_SOURCE_LABELS: Record<KnowledgeSourceType, string> = {
  docs: 'Docs',
  kb: 'Knowledge Base',
  'oauth-guide': 'OAuth',
  toolkit: 'Toolkit',
  example: 'Example',
  reference: 'Reference',
  changelog: 'Changelog',
  legacy: 'Legacy Reference',
};
