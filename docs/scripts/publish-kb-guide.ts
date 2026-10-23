/**
 * Publish one KB guide approved in the support portal: create it, rewrite it, or retire it.
 *
 * Reads a JSON request from the path given as the first argument (the docs-kb-publish workflow writes
 * it from the repository_dispatch payload), updates kb/manifest.json, the guide's article and, for a new
 * guide, its public source page, and validates the result with the same catalog checks the site uses.
 * Run `bun run generate:kb` afterwards.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { buildKbCatalog } from '@/lib/kb/catalog';
import { createKbArticleReader, createKbSourceReader } from '@/lib/kb/repository';
import type { KbGuideDefinition, KbManifest } from '@/lib/kb/types';

interface PublishRequest {
  action: 'upsert' | 'retire';
  slug: string;
  /** For a new guide: the source area, such as dashboard or toolkits. Its slug starts with it. */
  area?: string;
  title?: string;
  description?: string;
  /** The article in markdown, without frontmatter or a top-level heading. */
  body?: string;
  topics?: string[];
  tags?: string[];
}

const AREAS = new Set(['consumer', 'dashboard', 'faqs', 'mcp', 'platform', 'sdk', 'toolkits']);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REVIEW_DAYS = 90;

const requestPath = process.argv[2];
if (!requestPath) throw new Error('Usage: bun scripts/publish-kb-guide.ts <request.json>');
const request = JSON.parse(readFileSync(requestPath, 'utf8')) as PublishRequest;
if (!SLUG.test(request.slug ?? '')) throw new Error(`Invalid guide slug: ${request.slug}`);

const root = resolve(process.cwd(), 'kb');
const manifestPath = join(root, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as KbManifest;
const now = new Date();
const today = now.toISOString().slice(0, 10);
const reviewAfter = new Date(now.valueOf() + REVIEW_DAYS * 86_400_000).toISOString().slice(0, 10);
const existing = manifest.guides.find(guide => guide.slug === request.slug);
const writes: [string, string][] = [];

function text(value: string | undefined, name: string): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) throw new Error(`${name} is required`);
  return trimmed;
}

function words(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map(value => value.trim().toLowerCase()).filter(Boolean))].sort();
}

if (request.action === 'retire') {
  if (!existing) throw new Error(`No guide ${request.slug} to retire`);
  existing.state = 'retired';
  existing.updatedAt = today;
} else if (request.action === 'upsert') {
  const body = text(request.body, 'body');
  if (body.startsWith('---')) throw new Error('The article must not contain frontmatter');
  if (/^#\s/m.test(body.split('\n')[0] ?? '')) throw new Error('The article must not start with a top-level heading');
  const title = existing && !request.title ? existing.title : text(request.title, 'title');
  const description = existing && !request.description ? existing.description : text(request.description, 'description');
  const topics = request.topics?.length ? words(request.topics) : existing?.topics ?? [];
  const tags = request.tags?.length ? words(request.tags) : existing?.tags ?? [];
  if (!topics.length) throw new Error('At least one topic is required');
  let guide: KbGuideDefinition;
  if (existing) {
    guide = existing;
    Object.assign(guide, { title, description, topics, tags });
  } else {
    const area = text(request.area, 'area');
    if (!AREAS.has(area)) throw new Error(`Unknown area: ${area}`);
    if (!request.slug.startsWith(`${area}-`)) throw new Error(`A ${area} guide's slug starts with ${area}-`);
    const sourcePath = `${area}/${request.slug.slice(area.length + 1)}/public.md`;
    if (existsSync(join(root, 'source', sourcePath))) throw new Error(`${sourcePath} already exists`);
    // The source page is what the catalog requires behind every guide; the article is what readers see.
    writes.push([join(root, 'source', sourcePath), [
      '---',
      'type: "guide"',
      `title: ${JSON.stringify(title)}`,
      `description: ${JSON.stringify(description)}`,
      `category: ${JSON.stringify(topics[0])}`,
      'visibility: "public"',
      `timestamp: ${JSON.stringify(`${today}T00:00:00Z`)}`,
      'tags:',
      ...tags.map(tag => `  - ${JSON.stringify(tag)}`),
      '---',
      `# ${title}`,
      '',
      body,
      '',
    ].join('\n')]);
    // A source with sections is referenced section by section.
    const headings = [...body.matchAll(/^##\s+(.+?)\s*$/gm)].map(match => match[1] ?? '');
    guide = {
      slug: request.slug,
      title,
      description,
      articlePath: `${request.slug}.md`,
      sources: (headings.length ? headings : [null]).map(sourceHeading => ({ sourcePath, sourceHeading })),
      topics,
      tags,
      aliases: [],
      relatedGuides: [],
      externalResources: [],
      updatedAt: today,
      lastVerifiedAt: today,
      reviewAfter,
      freshness: 'evergreen',
      state: 'published',
      featured: false,
    };
    manifest.guides.push(guide);
  }
  guide.articlePath = `${request.slug}.md`;
  Object.assign(guide, { updatedAt: today, lastVerifiedAt: today, reviewAfter, state: 'published' });
  writes.push([join(root, 'articles', guide.articlePath), `${body}\n`]);
} else {
  throw new Error(`Unknown action: ${String(request.action)}`);
}

const pending = new Map(writes);
const readStaged = (base: string, read: (path: string) => string) => (path: string) =>
  pending.get(join(root, base, path)) ?? read(path);
buildKbCatalog(
  manifest,
  readStaged('source', createKbSourceReader(join(root, 'source'))),
  now,
  readStaged('articles', createKbArticleReader(join(root, 'articles'))),
);

for (const [path, content] of writes) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${request.action === 'retire' ? 'Retired' : existing ? 'Updated' : 'Created'} ${request.slug}.`);
