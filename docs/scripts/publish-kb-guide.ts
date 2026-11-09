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
import type { KbGuideDefinition } from '@/lib/kb/types';
import { z } from 'zod';

const slugSchema = z.string().min(1).max(200).regex(/^[a-z0-9-]+$/)
  .refine(value => value.split('-').every(Boolean), 'Invalid guide slug');
const requestSchema = z.object({
  action: z.enum(['upsert', 'retire']),
  slug: slugSchema,
  area: z.enum(['consumer', 'dashboard', 'faqs', 'mcp', 'platform', 'sdk', 'toolkits']).optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  body: z.string().optional(),
  topics: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

const manifestSchema = z.object({
  schemaVersion: z.literal(2),
  source: z.object({
    repository: z.string(), commit: z.string(), capturedAt: z.string(), contentHash: z.string(),
  }),
  topics: z.array(z.object({
    slug: z.string(), title: z.string(), description: z.string(), featuredRank: z.number().nullable(),
  })),
  guides: z.array(z.object({
    slug: slugSchema,
    title: z.string(),
    description: z.string(),
    articlePath: z.string().optional(),
    sources: z.array(z.object({ sourcePath: z.string(), sourceHeading: z.string().nullable() })),
    topics: z.array(z.string()),
    tags: z.array(z.string()),
    aliases: z.array(z.string()),
    relatedGuides: z.array(z.string()),
    externalResources: z.array(z.string()),
    updatedAt: z.string(),
    lastVerifiedAt: z.string().nullable(),
    reviewAfter: z.string().nullable(),
    freshness: z.enum(['evergreen', 'time-sensitive']),
    state: z.enum(['published', 'needs-review', 'retired']),
    featured: z.boolean(),
    verifyIgnoreToolSlugs: z.array(z.string()).optional(),
    managedBy: z.literal('support-portal').optional(),
  })),
});

const REVIEW_DAYS = 90;

export function publishKbGuide(input: unknown, docsRoot = process.cwd(), now = new Date()): void {
  const request = requestSchema.parse(input);
  const root = resolve(docsRoot, 'kb');
  const manifestPath = join(root, 'manifest.json');
  const manifest = manifestSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')));
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
    existing.managedBy = 'support-portal';
  } else if (request.action === 'upsert') {
    const body = text(request.body, 'body');
    if (body.startsWith('---')) throw new Error('The article must not contain frontmatter');
    if (/^#\s/m.test(body.split('\n')[0] ?? '')) throw new Error('The article must not start with a top-level heading');
    const title = existing && !request.title ? existing.title : text(request.title, 'title');
    const description = existing && !request.description ? existing.description : text(request.description, 'description');
    const topics = request.topics !== undefined ? words(request.topics) : existing?.topics ?? [];
    const tags = request.tags !== undefined ? words(request.tags) : existing?.tags ?? [];
    if (!topics.length) throw new Error('At least one topic is required');
    let guide: KbGuideDefinition;
    if (existing) {
      guide = existing;
      Object.assign(guide, { title, description, topics, tags });
    } else {
      const area = text(request.area, 'area');
      if (!request.slug.startsWith(`${area}-`)) throw new Error(`A ${area} guide's slug starts with ${area}-`);
      const sourcePath = `${area}/${request.slug.slice(area.length + 1)}/public.md`;
      if (existsSync(join(root, 'source', sourcePath))) {
        throw new Error(`${sourcePath} already exists`);
      }
      writes.push([join(root, 'source', sourcePath), [
        '---',
        'type: "guide"',
        `title: ${JSON.stringify(title)}`,
        `description: ${JSON.stringify(description)}`,
        `category: ${JSON.stringify(topics[0])}`,
        'visibility: "public"',
        `timestamp: ${JSON.stringify(`${today}T00:00:00Z`)}`,
        'tags:',
        ...(tags.length ? tags : ['support-portal']).map(tag => `  - ${JSON.stringify(tag)}`),
        '---',
        `# ${title}`,
        '',
        body,
        '',
      ].join('\n')]);
      const headings = body.split('\n').flatMap(line => {
        const heading = line.match(/^##[ \t]+(.+)$/)?.[1]?.trim();
        return heading ? [heading] : [];
      });
      guide = {
        slug: request.slug,
        title,
        description,
        articlePath: `${request.slug}.md`,
        sources: (headings.length ? headings : [null])
          .map(sourceHeading => ({ sourcePath, sourceHeading })),
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
    guide.managedBy = 'support-portal';
    guide.articlePath = `${request.slug}.md`;
    Object.assign(guide, { updatedAt: today, lastVerifiedAt: today, reviewAfter, state: 'published' });
    writes.push([join(root, 'articles', guide.articlePath), `${body}\n`]);
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
}

if (import.meta.main) {
  const requestPath = process.argv[2];
  if (!requestPath) throw new Error('Usage: bun scripts/publish-kb-guide.ts <request.json>');
  publishKbGuide(JSON.parse(readFileSync(requestPath, 'utf8')));
}
