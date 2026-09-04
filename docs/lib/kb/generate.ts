import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, parse, posix, relative, resolve } from 'node:path';
import GithubSlugger from 'github-slugger';
import { getKbCatalog, getKbGuideUrl, getPublishedKbGuides } from './repository';
import type { KbCatalog, KbGuide } from './types';
import toolkitsData from '@/public/data/toolkits-list.json';
import type { ToolkitSummary } from '@/types/toolkit';

export interface KbGenerationSummary {
  published: number;
  held: number;
  files: number;
}

export interface GenerateKbContentOptions {
  outputDir?: string;
  check?: boolean;
  catalog?: KbCatalog;
}

const EXTERNAL_RESOURCES: Record<string, { title: string; href: string; description: string }> = {
  'docs-sessions': {
    title: 'Configure Composio sessions',
    href: '/docs/configuring-sessions',
    description: 'Create and configure Tool Router sessions.',
  },
  'docs-api-reference': {
    title: 'Composio API reference',
    href: '/reference',
    description: 'Inspect current endpoint schemas and parameters.',
  },
};

const toolkitSlugByLooseKey = new Map(
  (toolkitsData as ToolkitSummary[]).map(toolkit => [
    toolkit.slug.toLowerCase().replace(/[-_\s]+/g, ''),
    toolkit.slug,
  ]),
);

function toolkitSlugsForGuide(guide: KbGuide): string[] {
  return [...new Set(guide.sources.flatMap(source => {
    const sourceSlug = source.sourcePath.match(/^toolkits\/([^/]+)\/public\.md$/)?.[1];
    if (!sourceSlug) return [];
    const looseKey = sourceSlug.toLowerCase().replace(/[-_\s]+/g, '');
    return [toolkitSlugByLooseKey.get(looseKey) ?? sourceSlug];
  }))].sort();
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function yamlArray(values: string[]): string {
  return JSON.stringify(values);
}

function relatedResources(guide: KbGuide, guides: KbGuide[]) {
  const bySlug = new Map(guides.map(candidate => [candidate.slug, candidate]));
  const internal = guide.relatedGuides.flatMap(slug => {
    const related = bySlug.get(slug);
    if (!related) return [];
    return [
      {
        title: related.title,
        href: getKbGuideUrl(related),
        description: related.description,
      },
    ];
  });
  const external = guide.externalResources.flatMap(id => {
    const resource = EXTERNAL_RESOURCES[id];
    return resource ? [resource] : [];
  });
  return [...internal, ...external];
}

function relatedFrontmatter(
  resources: Array<{ title: string; href: string; description: string }>
): string[] {
  if (resources.length === 0) return [];
  return [
    'related:',
    ...resources.flatMap(resource => [
      `  - title: ${yamlString(resource.title)}`,
      `    href: ${yamlString(resource.href)}`,
      `    description: ${yamlString(resource.description)}`,
    ]),
  ];
}

/**
 * Identifier URLs cite machine identifiers — OAuth scope URIs and API
 * surface roots such as `https://api.example.com/v3` — not documents. They
 * respond 404 by design, so they must never publish as links the nightly
 * external-link sweep would have to keep alive: they render as code spans.
 */
export function isIdentifierUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.search || url.hash) {
    return false;
  }
  // Google OAuth scope URIs (https://www.googleapis.com/auth/…) identify a
  // permission; the namespace serves no pages.
  if (url.hostname === 'www.googleapis.com' && url.pathname.startsWith('/auth/')) {
    return true;
  }
  // An API surface root: a version-only path such as `/v3` or `/v1beta/`.
  // Deep paths (`/v3/tools/X`) stay links because they name real resources.
  return /^\/v\d[\w.-]*\/?$/.test(url.pathname);
}

/**
 * Wraps bare identifier URLs in code spans. URLs already presented as links —
 * markdown link labels `[url](…)`, link targets `](url)`, and anything
 * adjacent to a code span — keep their form; only bare citations and
 * `<url>` autolinks (normalized earlier) become code.
 */
function identifierUrlsToCodeSpans(segment: string): string {
  return segment.replace(/(?<![`(\]\[])https?:\/\/[^\s`<>\[\]()]+/g, match => {
    // GFM autolinks drop trailing punctuation; keep it outside the code span.
    const url = match.replace(/[.,;:!?'"]+$/, '');
    if (!isIdentifierUrl(url)) return match;
    return `\`${url}\`${match.slice(url.length)}`;
  });
}

function escapeMdxProse(line: string): string {
  const escapeSegment = (segment: string): string => identifierUrlsToCodeSpans(
    segment
      .replace(/<(https?:\/\/[^>\s]+)>/g, (match, url: string) =>
        isIdentifierUrl(url) ? `\`${url}\`` : `[${url}](${url})`)
      .replace(/<([^>\n]+)>/g, '&lt;$1&gt;')
      .replace(/\{/g, '&#123;')
      .replace(/\}/g, '&#125;'),
  );

  let result = '';
  let cursor = 0;
  while (cursor < line.length) {
    const opening = line.indexOf('`', cursor);
    if (opening < 0) return result + escapeSegment(line.slice(cursor));
    result += escapeSegment(line.slice(cursor, opening));

    let markerEnd = opening;
    while (line[markerEnd] === '`') markerEnd += 1;
    const marker = line.slice(opening, markerEnd);
    const closing = line.indexOf(marker, markerEnd);
    if (closing < 0) return result + escapeSegment(line.slice(opening));
    result += line.slice(opening, closing + marker.length);
    cursor = closing + marker.length;
  }
  return result;
}

/**
 * Converts authoritative CommonMark into MDX-safe Markdown. The source and
 * article snapshots stay verbatim; only the generated presentation escapes MDX
 * expressions, normalizes autolinks, demotes identifier URLs to code spans,
 * and opts support snippets out of Twoslash.
 */
export function markdownForMdx(markdown: string): string {
  let fence: { marker: string; length: number } | null = null;
  return markdown.split('\n').map(line => {
    const match = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
    if (match) {
      const indentation = match[1] ?? '';
      const marker = match[2] ?? '';
      const info = match[3] ?? '';
      if (!fence) {
        fence = { marker: marker[0] ?? '`', length: marker.length };
        const safeInfo = info.replace(
          /^(\s*)(?:ts|tsx|typescript|js|jsx|javascript)(?=\s|$)/i,
          '$1text',
        );
        return `${indentation}${marker}${safeInfo}`;
      }
      if (marker[0] === fence.marker && marker.length >= fence.length && info.trim() === '') {
        fence = null;
      }
      return line;
    }
    return fence ? line : escapeMdxProse(line);
  }).join('\n');
}

function rewriteSourceRepositoryLinks(markdown: string, guide: KbGuide, guides: KbGuide[]): string {
  const guideBySourcePath = new Map(
    guides.flatMap(candidate => candidate.sources.map(source => [source.sourcePath, candidate] as const)),
  );
  const headingFragmentsByGuide = new Map(guides.map(candidate => {
    const slugger = new GithubSlugger();
    const fragments = candidate.body.split('\n').flatMap(line => {
      const heading = line.match(/^#{1,6}\s+(.+)$/)?.[1];
      return heading ? [slugger.slug(heading)] : [];
    });
    return [candidate.slug, new Set(fragments)] as const;
  }));
  const sourcePaths = [...new Set(guide.sources.map(source => source.sourcePath))];

  return markdown.replace(
    /\]\((\.\.?\/[^)\s]*?public\.md)(#[^)\s]+)?\)/g,
    (match, relativeTarget: string, fragment = '') => {
      const targets = new Set(
        sourcePaths.flatMap(sourcePath => {
          const resolved = posix.normalize(posix.join(posix.dirname(sourcePath), relativeTarget));
          const target = guideBySourcePath.get(resolved);
          return target ? [target] : [];
        }),
      );
      if (targets.size !== 1) return match;
      const [target] = targets;
      const validFragment = fragment
        && headingFragmentsByGuide.get(target!.slug)?.has(fragment.slice(1))
        ? fragment
        : '';
      return `](${getKbGuideUrl(target!)}${validFragment})`;
    },
  );
}

function guideMdx(guide: KbGuide, guides: KbGuide[]): string {
  const related = relatedResources(guide, guides);
  const toolkitSlugs = toolkitSlugsForGuide(guide);
  const frontmatter = [
    '---',
    `title: ${yamlString(guide.title)}`,
    `description: ${yamlString(guide.description)}`,
    `keywords: ${yamlArray([...guide.tags, ...guide.topics, ...guide.aliases])}`,
    `sources: ${JSON.stringify(guide.sources)}`,
    `lastVerifiedAt: ${yamlString(guide.lastVerifiedAt ?? '')}`,
    `reviewAfter: ${yamlString(guide.reviewAfter ?? '')}`,
    `freshness: ${yamlString(guide.freshness)}`,
    `topics: ${yamlArray(guide.topics)}`,
    ...(toolkitSlugs.length > 0 ? [`toolkitSlugs: ${yamlArray(toolkitSlugs)}`] : []),
    `aliases: ${yamlArray(guide.aliases)}`,
    ...relatedFrontmatter(related),
    '---',
    '',
  ];
  const body = rewriteSourceRepositoryLinks(guide.body.trim(), guide, guides);
  return `${frontmatter.join('\n')}${markdownForMdx(body)}\n`;
}

function rootIndex(): string {
  return `---
title: "Knowledge Base"
description: "Verified troubleshooting guides and answers for building with Composio."
---

Verified troubleshooting guides, operational answers, and known-good patterns from Composio support.
`;
}

function buildExpectedFiles(catalog: KbCatalog): Map<string, string> {
  const guides = getPublishedKbGuides(catalog);
  const files = new Map<string, string>();
  files.set('index.mdx', rootIndex());
  files.set(
    'meta.json',
    `${JSON.stringify({ title: 'Knowledge Base', root: true, pages: ['index', 'guide'] }, null, 2)}\n`
  );
  files.set(
    'guide/meta.json',
    `${JSON.stringify({ title: 'Guides', pages: guides.map(guide => guide.slug) }, null, 2)}\n`
  );
  for (const guide of guides) {
    files.set(`guide/${guide.slug}.mdx`, guideMdx(guide, guides));
  }
  return files;
}

function listRelativeFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => relative(directory, join(entry.parentPath, entry.name)))
    .sort();
}

function planFileChanges(outputDir: string, expected: Map<string, string>) {
  const actualFiles = listRelativeFiles(outputDir);
  const actualFileSet = new Set(actualFiles);
  const writes = [...expected].filter(
    ([path, content]) =>
      !actualFileSet.has(path) || readFileSync(join(outputDir, path), 'utf8') !== content,
  );
  const removals = actualFiles.filter(path => !expected.has(path));
  return { writes, removals };
}

function assertSafeOutputDirectory(outputDir: string): void {
  const resolved = resolve(outputDir);
  if (resolved === parse(resolved).root || basename(resolved) === '') {
    throw new Error(`Refusing to generate KB content into unsafe path: ${resolved}`);
  }
}

export function generateKbContent(options: GenerateKbContentOptions = {}): KbGenerationSummary {
  const outputDir = resolve(options.outputDir ?? join(process.cwd(), 'content', 'kb'));
  assertSafeOutputDirectory(outputDir);
  const catalog = options.catalog ?? getKbCatalog();
  const expected = buildExpectedFiles(catalog);
  const published = getPublishedKbGuides(catalog).length;
  const held = catalog.guides.filter(guide => guide.state === 'needs-review').length;
  const changes = planFileChanges(outputDir, expected);

  if (options.check) {
    if (changes.writes.length > 0 || changes.removals.length > 0) {
      throw new Error('Generated KB content is out of date; run bun run generate:kb');
    }
    return { published, held, files: expected.size };
  }

  for (const [path, content] of changes.writes) {
    const target = join(outputDir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  for (const path of changes.removals) {
    rmSync(join(outputDir, path), { force: true });
  }
  return { published, held, files: expected.size };
}
