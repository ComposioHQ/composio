export type KbFreshness = 'evergreen' | 'time-sensitive';
export type KbPublicationState = 'published' | 'needs-review' | 'retired';

export interface KbSourceMetadata {
  type: string;
  title: string;
  description: string;
  category: string;
  visibility: string;
  timestamp: string;
  tags: string[];
}

export interface KbSourceDocument {
  metadata: KbSourceMetadata;
  body: string;
}

export interface KbTopic {
  slug: string;
  title: string;
  description: string;
  featuredRank: number | null;
}

export interface KbSourceReference {
  sourcePath: string;
  sourceHeading: string | null;
}

export interface KbGuideDefinition {
  slug: string;
  title: string;
  description: string;
  articlePath?: string;
  sources: KbSourceReference[];
  topics: string[];
  tags: string[];
  aliases: string[];
  relatedGuides: string[];
  externalResources: string[];
  updatedAt: string;
  lastVerifiedAt: string | null;
  reviewAfter: string | null;
  freshness: KbFreshness;
  state: KbPublicationState;
  featured: boolean;
  /**
   * Tool slugs this guide may cite even though they are absent from the production
   * catalog — for guides whose subject is that an identifier was removed or renamed.
   * Declared here so `verify:kb` exemptions are reviewable rather than silent.
   */
  verifyIgnoreToolSlugs?: string[];
}

export interface KbGuide extends KbGuideDefinition {
  body: string;
  sourceMetadata: KbSourceMetadata[];
}

export interface KbManifest {
  schemaVersion: 2;
  source: {
    repository: string;
    commit: string;
    capturedAt: string;
    contentHash: string;
  };
  topics: KbTopic[];
  guides: KbGuideDefinition[];
}

export interface KbCatalog {
  manifest: KbManifest;
  topics: KbTopic[];
  guides: KbGuide[];
}
