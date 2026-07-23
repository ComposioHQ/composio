import { extractGuideSections, parsePublicKbDocument } from './source-document';
import type { KbCatalog, KbGuide, KbManifest, KbSourceDocument } from './types';

const PRIVATE_MARKERS = [
  { label: 'Plain thread reference', pattern: /\bT-\d{2,}\b/ },
  { label: 'Plain URL', pattern: /app\.plain\.com/i },
  { label: 'internal Slack URL', pattern: /slack\.com\/archives\//i },
  { label: 'internal Linear URL', pattern: /linear\.app\/composio/i },
  { label: 'email address', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
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

export function buildKbCatalog(
  manifest: KbManifest,
  readSource: (sourcePath: string) => string,
  now = new Date()
): KbCatalog {
  if (manifest.schemaVersion !== 2) throw new Error('Unsupported KB manifest schema');

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
    for (const marker of PRIVATE_MARKERS) {
      if (marker.pattern.test(document.body)) {
        throw new Error(`${sourcePath} contains ${marker.label}`);
      }
    }
    documents.set(sourcePath, document);
    return document;
  };
  const guides: KbGuide[] = manifest.guides.map(definition => {
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

    return {
      ...definition,
      body: extractGuideSections(documentFor, definition.sources),
      sourceMetadata,
    };
  });

  return { manifest, topics: manifest.topics, guides };
}
