import type { KbSourceDocument, KbSourceMetadata, KbSourceReference } from './types';

const REQUIRED_KEYS = [
  'type',
  'title',
  'description',
  'category',
  'visibility',
  'timestamp',
  'tags',
] as const;

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parsePublicKbDocument(raw: string): KbSourceDocument {
  if (!raw.startsWith('---\n')) {
    throw new Error('Public KB source is missing YAML frontmatter');
  }

  const closing = raw.indexOf('\n---\n', 4);
  if (closing < 0) throw new Error('Public KB frontmatter is not closed');

  const values = new Map<string, string | string[]>();
  let listKey: string | null = null;

  for (const line of raw.slice(4, closing).split('\n')) {
    const listItem = line.match(/^\s+-\s+(.+)$/);
    if (listItem && listKey) {
      const current = values.get(listKey);
      if (!Array.isArray(current)) throw new Error(`${listKey} is not a list`);
      current.push(unquote(listItem[1] ?? ''));
      continue;
    }

    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!field) continue;
    const [, key, rawValue] = field;
    if (!key) continue;
    if (values.has(key)) throw new Error(`Duplicate frontmatter key: ${key}`);
    if (key === 'tags') {
      values.set(key, []);
      listKey = key;
    } else {
      values.set(key, unquote(rawValue ?? ''));
      listKey = null;
    }
  }

  const actualKeys = [...values.keys()].sort();
  const expectedKeys = [...REQUIRED_KEYS].sort();
  if (actualKeys.join('|') !== expectedKeys.join('|')) {
    throw new Error(`Public KB frontmatter must contain exactly: ${REQUIRED_KEYS.join(', ')}`);
  }

  const stringValue = (key: string): string => {
    const value = values.get(key);
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`Frontmatter field ${key} must be a non-empty string`);
    }
    return value.trim();
  };
  const tags = values.get('tags');
  if (!Array.isArray(tags) || tags.length === 0) {
    throw new Error('Frontmatter field tags must be a non-empty list');
  }

  const metadata: KbSourceMetadata = {
    type: stringValue('type'),
    title: stringValue('title'),
    description: stringValue('description'),
    category: stringValue('category'),
    visibility: stringValue('visibility'),
    timestamp: stringValue('timestamp'),
    tags,
  };

  return { metadata, body: raw.slice(closing + 5).trim() };
}

function normalizedHeading(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function guideSection(
  document: KbSourceDocument,
  sourceHeading: string | null
): { heading: string | null; body: string } {
  const lines = document.body.split('\n');
  if (!sourceHeading) {
    if (lines.some(line => /^##\s+/.test(line))) {
      throw new Error('A source without a heading cannot contain level-two sections');
    }
    const firstContent = lines.findIndex(line => line.trim().length > 0);
    if (firstContent >= 0 && /^#\s+/.test(lines[firstContent] ?? '')) {
      lines.splice(firstContent, 1);
    }
    return { heading: null, body: lines.join('\n').trim() };
  }

  const target = normalizedHeading(sourceHeading);
  const matches = lines
    .map((line, index) => ({ index, match: line.match(/^##\s+(.+?)\s*$/) }))
    .filter(item => item.match && normalizedHeading(item.match[1] ?? '') === target);

  if (matches.length === 0) throw new Error(`Heading "${sourceHeading}" was not found`);
  if (matches.length > 1) throw new Error(`Heading "${sourceHeading}" is duplicated`);

  const match = matches[0];
  const start = (match?.index ?? 0) + 1;
  let end = lines.length;
  for (let index = start; index < lines.length; index++) {
    if (/^##\s+/.test(lines[index] ?? '')) {
      end = index;
      break;
    }
  }
  return { heading: match?.match?.[1] ?? null, body: lines.slice(start, end).join('\n').trim() };
}

export function extractGuideBody(document: KbSourceDocument, sourceHeading: string | null): string {
  return guideSection(document, sourceHeading).body;
}

export function extractGuideSections(
  document: KbSourceDocument | ((sourcePath: string) => KbSourceDocument),
  references: KbSourceReference[]
): string {
  const resolveDocument =
    typeof document === 'function' ? document : (_sourcePath: string) => document;
  const includeHeadings = references.length > 1;

  return references
    .map(reference => {
      const section = guideSection(resolveDocument(reference.sourcePath), reference.sourceHeading);
      return includeHeadings && section.heading
        ? `## ${section.heading}\n\n${section.body}`
        : section.body;
    })
    .join('\n\n');
}
