import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, parse, relative, resolve } from 'node:path';
import { getKbCatalog, getKbGuideUrl, getPublishedKbGuides } from './repository';
import type { KbGuide } from './types';

export interface KbGenerationSummary {
  published: number;
  held: number;
  files: number;
}

export interface GenerateKbContentOptions {
  outputDir?: string;
  check?: boolean;
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

function guideMdx(guide: KbGuide, guides: KbGuide[], sourceCommit: string): string {
  const related = relatedResources(guide, guides);
  const frontmatter = [
    '---',
    `title: ${yamlString(guide.title)}`,
    `description: ${yamlString(guide.description)}`,
    `keywords: ${yamlArray([...guide.tags, ...guide.topics, ...guide.aliases])}`,
    `sources: ${JSON.stringify(guide.sources)}`,
    `sourceCommit: ${yamlString(sourceCommit)}`,
    `lastVerifiedAt: ${yamlString(guide.lastVerifiedAt ?? '')}`,
    `reviewAfter: ${yamlString(guide.reviewAfter ?? '')}`,
    `freshness: ${yamlString(guide.freshness)}`,
    `topics: ${yamlArray(guide.topics)}`,
    `aliases: ${yamlArray(guide.aliases)}`,
    ...relatedFrontmatter(related),
    '---',
    '',
  ];
  return `${frontmatter.join('\n')}${guide.body.trim()}\n`;
}

function rootIndex(): string {
  return `---
title: "Knowledge Base"
description: "Verified troubleshooting guides and answers for building with Composio."
---

Verified troubleshooting guides, operational answers, and known-good patterns from Composio support.
`;
}

function buildExpectedFiles(): Map<string, string> {
  const catalog = getKbCatalog();
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
    files.set(`guide/${guide.slug}.mdx`, guideMdx(guide, guides, catalog.manifest.source.commit));
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

function assertSafeOutputDirectory(outputDir: string): void {
  const resolved = resolve(outputDir);
  if (resolved === parse(resolved).root || basename(resolved) === '') {
    throw new Error(`Refusing to generate KB content into unsafe path: ${resolved}`);
  }
}

export function generateKbContent(options: GenerateKbContentOptions = {}): KbGenerationSummary {
  const outputDir = resolve(options.outputDir ?? join(process.cwd(), 'content', 'kb'));
  assertSafeOutputDirectory(outputDir);
  const expected = buildExpectedFiles();
  const catalog = getKbCatalog();
  const published = getPublishedKbGuides(catalog).length;
  const held = catalog.guides.filter(guide => guide.state === 'needs-review').length;

  if (options.check) {
    const actualFiles = listRelativeFiles(outputDir);
    const expectedFiles = [...expected.keys()].sort();
    const matches =
      actualFiles.length === expectedFiles.length &&
      expectedFiles.every(
        (path, index) =>
          actualFiles[index] === path &&
          readFileSync(join(outputDir, path), 'utf8') === expected.get(path)
      );
    if (!matches) throw new Error('Generated KB content is out of date; run bun run generate:kb');
    return { published, held, files: expected.size };
  }

  rmSync(outputDir, { recursive: true, force: true });
  for (const [path, content] of expected) {
    const target = join(outputDir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  return { published, held, files: expected.size };
}
