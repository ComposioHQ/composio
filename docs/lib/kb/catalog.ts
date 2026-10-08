import { extractGuideSections, parsePublicKbDocument } from './source-document';
import type { KbCatalog, KbGuide, KbManifest, KbSourceDocument } from './types';

const PRIVATE_MARKERS = [
  { label: 'Plain thread reference', pattern: /\bT-\d{2,}\b/ },
  { label: 'Plain URL', pattern: /app\.plain\.com/i },
  { label: 'internal Slack URL', pattern: /slack\.com\/archives\//i },
  { label: 'internal Linear URL', pattern: /linear\.app\/composio/i },
  { label: 'signed download URL', pattern: /X-Amz-(?:Signature|Credential)/i },
  { label: 'machine-local path', pattern: /(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)/ },
  { label: 'candidate-only knowledge', pattern: /\bcandidate-only\b/i },
  {
    label: 'internal-only heading',
    pattern: /^#{2,6}\s+(?:Internal|Support checks|Debug checklist|Related Plain refs)\b/im,
  },
] as const;

function validDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function assertNoPrivateMarkers(content: string, path: string): void {
  for (const marker of PRIVATE_MARKERS) {
    if (marker.pattern.test(content)) {
      throw new Error(`${path} contains ${marker.label}`);
    }
  }
}

function articleBodyFor(
  slug: string,
  articlePath: unknown,
  readArticle: ((articlePath: string) => string) | undefined
): string | null {
  if (articlePath === undefined) return null;

  if (typeof articlePath !== 'string') {
    throw new Error(`${slug} articlePath must equal ${slug}.md`);
  }
  if (articlePath.includes('/') || articlePath.includes('\\')) {
    throw new Error(`${slug} articlePath must be a flat filename`);
  }
  if (articlePath !== `${slug}.md`) {
    throw new Error(`${slug} articlePath must equal ${slug}.md`);
  }
  if (!readArticle) {
    throw new Error(`${slug} requires an article reader`);
  }

  const body = readArticle(articlePath);
  if (!body.trim()) throw new Error(`${articlePath} must not be empty`);
  if (/^(?:\uFEFF)?---(?:\r?\n|$)/.test(body.trimStart())) {
    throw new Error(`${articlePath} must not contain YAML frontmatter`);
  }
  assertNoPrivateMarkers(body, articlePath);
  return body;
}

export function buildKbCatalog(
  manifest: KbManifest,
  readSource: (sourcePath: string) => string,
  now = new Date(),
  readArticle?: (articlePath: string) => string
): KbCatalog {
  if (manifest.schemaVersion !== 2) throw new Error('Unsupported KB manifest schema');

  for (const topic of manifest.topics) {
    assertNoPrivateMarkers(topic.title, `topic ${topic.slug} title`);
    assertNoPrivateMarkers(topic.description, `topic ${topic.slug} description`);
  }

  const topicSlugs = new Set(manifest.topics.map(topic => topic.slug));
  if (topicSlugs.size !== manifest.topics.length) throw new Error('Duplicate KB topic slug');

  const claimed = new Set<string>();
  for (const definition of manifest.guides) {
    for (const value of [definition.slug, ...definition.aliases]) {
      const normalized = value.toLowerCase();
      if (claimed.has(normalized)) throw new Error(`Duplicate KB slug or alias: ${value}`);
      claimed.add(normalized);
    }
    for (const topic of definition.topics) {
      if (!topicSlugs.has(topic)) {
        throw new Error(`${definition.slug} has unknown topic: ${topic}`);
      }
    }
  }

  const definitionSlugs = new Set(manifest.guides.map(guide => guide.slug));
  const documents = new Map<string, KbSourceDocument>();
  const documentFor = (sourcePath: string): KbSourceDocument => {
    const cached = documents.get(sourcePath);
    if (cached) return cached;

    const document = parsePublicKbDocument(readSource(sourcePath));
    if (document.metadata.visibility !== 'public') {
      throw new Error(`${sourcePath} is not visibility: public`);
    }
    assertNoPrivateMarkers(document.metadata.title, `${sourcePath} title`);
    assertNoPrivateMarkers(document.metadata.description, `${sourcePath} description`);
    for (const tag of document.metadata.tags) {
      assertNoPrivateMarkers(tag, `${sourcePath} tag`);
    }
    assertNoPrivateMarkers(document.body, sourcePath);
    documents.set(sourcePath, document);
    return document;
  };
  const guides: KbGuide[] = manifest.guides.map(definition => {
    assertNoPrivateMarkers(definition.title, `${definition.slug} title`);
    assertNoPrivateMarkers(definition.description, `${definition.slug} description`);
    for (const tag of definition.tags) {
      assertNoPrivateMarkers(tag, `${definition.slug} tag`);
    }

    for (const related of definition.relatedGuides) {
      if (!definitionSlugs.has(related)) {
        throw new Error(`${definition.slug} has unknown related guide: ${related}`);
      }
    }

    if (definition.sources.length === 0) {
      throw new Error(`${definition.slug} requires at least one source`);
    }
    const sourceMetadata = definition.sources.map(
      source => documentFor(source.sourcePath).metadata
    );

    if (definition.state === 'published') {
      if (!validDate(definition.lastVerifiedAt)) {
        throw new Error(`${definition.slug}: published content requires lastVerifiedAt`);
      }
      const reviewAfter = validDate(definition.reviewAfter);
      if (!reviewAfter) {
        throw new Error(`${definition.slug}: published content requires reviewAfter`);
      }
      if (reviewAfter.valueOf() <= now.valueOf()) {
        throw new Error(`${definition.slug}: review window expired`);
      }
    }

    const sourceBody = extractGuideSections(documentFor, definition.sources);
    const articleBody = articleBodyFor(definition.slug, definition.articlePath, readArticle);

    return {
      ...definition,
      body: articleBody ?? sourceBody,
      sourceMetadata,
    };
  });

  return { manifest, topics: manifest.topics, guides };
}
