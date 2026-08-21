import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, parse, relative, resolve } from 'node:path';
import type {
  KbFreshness,
  KbGuideDefinition,
  KbManifest,
  KbTopic,
} from './types';

const SOURCE_REPOSITORY = 'ComposioHQ/support-knowledge';
const LEAF_FILENAMES = new Set(['public.md', 'customer-safe.md']);
const REQUIRED_SCALARS = [
  'type',
  'title',
  'description',
  'classification',
  'owner',
  'timestamp',
  'last_reviewed',
  'review_by',
] as const;
const REQUIRED_LISTS = ['product', 'category', 'tags'] as const;

export interface SupportKnowledgeDocument {
  relativePath: string;
  type: string;
  title: string;
  description: string;
  classification: 'public' | 'customer-safe';
  products: string[];
  categories: string[];
  tags: string[];
  timestamp: string;
  lastReviewed: string;
  reviewBy: string;
  body: string;
  headings: string[];
}

export interface SupportKnowledgeSnapshot {
  manifest: KbManifest;
  sourceFiles: Map<string, string>;
  articleFiles: Map<string, string>;
}

function gitOutput(sourceRoot: string, args: string[]): string {
  const result = spawnSync('git', args, {
    cwd: sourceRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    const details = result.stderr.trim();
    throw new Error(`could not verify support-knowledge checkout${details ? `: ${details}` : ''}`);
  }
  return result.stdout.trim();
}

function repositoryFromRemote(remote: string): string | undefined {
  return remote.match(/github\.com(?::|\/)([^/]+\/[^/]+?)(?:\.git)?$/i)?.[1];
}

/** Verify that the imported bytes are checked out from the repository and commit we record. */
export function verifySupportKnowledgeCheckout(input: {
  sourceRoot: string;
  sourceCommit: string;
}): string {
  const dirty = gitOutput(input.sourceRoot, [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
  ]);
  if (dirty) {
    throw new Error('support-knowledge checkout has uncommitted changes');
  }

  const ignoredKnowledgeFiles = gitOutput(input.sourceRoot, [
    'ls-files',
    '--others',
    '--ignored',
    '--exclude-standard',
    '--',
    ':(glob)**/public.md',
    ':(glob)**/customer-safe.md',
  ]);
  if (ignoredKnowledgeFiles) {
    throw new Error('support-knowledge checkout contains ignored knowledge files');
  }

  const head = gitOutput(input.sourceRoot, ['rev-parse', 'HEAD']);
  const requested = gitOutput(input.sourceRoot, [
    'rev-parse',
    '--verify',
    `${input.sourceCommit}^{commit}`,
  ]);
  if (head !== requested) {
    throw new Error(
      `support-knowledge HEAD ${head} does not match requested commit ${requested}`,
    );
  }

  const remote = gitOutput(input.sourceRoot, ['remote', 'get-url', 'origin']);
  const repository = repositoryFromRemote(remote);
  if (repository?.toLowerCase() !== SOURCE_REPOSITORY.toLowerCase()) {
    throw new Error(
      `support-knowledge origin is ${remote}; expected ${SOURCE_REPOSITORY}`,
    );
  }
  return head;
}

function sourceContentHash(sourceFiles: Map<string, string>): string {
  const hash = createHash('sha256');
  for (const [relativePath, contents] of [...sourceFiles].sort(([left], [right]) =>
    left.localeCompare(right))) {
    hash.update(relativePath, 'utf8');
    hash.update('\0');
    hash.update(contents, 'utf8');
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

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

function parseFrontmatter(raw: string, relativePath: string): {
  scalars: Map<string, string>;
  lists: Map<string, string[]>;
  body: string;
} {
  if (!raw.startsWith('---\n')) {
    throw new Error(`${relativePath}: missing YAML frontmatter`);
  }
  const closing = raw.indexOf('\n---\n', 4);
  if (closing < 0) throw new Error(`${relativePath}: YAML frontmatter is not closed`);

  const scalars = new Map<string, string>();
  const lists = new Map<string, string[]>();
  let activeList: string | null = null;

  for (const line of raw.slice(4, closing).split('\n')) {
    const listItem = line.match(/^\s+-\s+(.+)$/);
    if (listItem && activeList) {
      lists.get(activeList)?.push(unquote(listItem[1] ?? ''));
      continue;
    }

    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!field) continue;
    const key = field[1] ?? '';
    const value = field[2] ?? '';
    if ((REQUIRED_LISTS as readonly string[]).includes(key)) {
      lists.set(key, []);
      activeList = key;
      continue;
    }
    scalars.set(key, unquote(value));
    activeList = null;
  }

  return { scalars, lists, body: raw.slice(closing + 5).trim() };
}

function requiredScalar(values: Map<string, string>, key: string, path: string): string {
  const value = values.get(key)?.trim();
  if (!value) throw new Error(`${path}: missing frontmatter field ${key}`);
  return value;
}

function requiredList(values: Map<string, string[]>, key: string, path: string): string[] {
  const value = values.get(key)?.map(item => item.trim()).filter(Boolean) ?? [];
  if (value.length === 0) throw new Error(`${path}: frontmatter field ${key} must be a list`);
  return value;
}

function validateIsoDate(value: string, key: string, path: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).valueOf())) {
    throw new Error(`${path}: ${key} must be YYYY-MM-DD`);
  }
}

function leafClassification(
  scalars: Map<string, string>,
  relativePath: string,
): 'public' | 'customer-safe' {
  const classification = requiredScalar(scalars, 'classification', relativePath);
  if (classification !== 'public' && classification !== 'customer-safe') {
    throw new Error(`${relativePath}: unsupported classification ${classification}`);
  }
  const expectedClassification = basename(relativePath) === 'public.md'
    ? 'public'
    : basename(relativePath) === 'customer-safe.md'
      ? 'customer-safe'
      : null;
  if (!expectedClassification || classification !== expectedClassification) {
    throw new Error(`${relativePath}: classification does not match filename`);
  }
  return classification;
}

export function parseSupportKnowledgeDocument(
  raw: string,
  relativePath: string,
): SupportKnowledgeDocument {
  const { scalars, lists, body } = parseFrontmatter(raw, relativePath);
  for (const key of REQUIRED_SCALARS) requiredScalar(scalars, key, relativePath);
  const classification = leafClassification(scalars, relativePath);

  const lastReviewed = requiredScalar(scalars, 'last_reviewed', relativePath);
  const reviewBy = requiredScalar(scalars, 'review_by', relativePath);
  validateIsoDate(lastReviewed, 'last_reviewed', relativePath);
  validateIsoDate(reviewBy, 'review_by', relativePath);

  const levelOneHeadings = [...body.matchAll(/^#\s+(.+?)\s*$/gm)];
  if (levelOneHeadings.length !== 1) {
    throw new Error(`${relativePath}: requires exactly one level-one title`);
  }

  const sections = [...body.matchAll(/^##\s+(.+?)\s*$\n([\s\S]*?)(?=^##\s+|\s*$)/gm)];
  if (sections.length === 0) {
    throw new Error(`${relativePath}: requires at least one level-two answer section`);
  }
  for (const section of sections) {
    if (!(section[2] ?? '').trim()) {
      throw new Error(`${relativePath}: level-two answer section "${section[1]}" is empty`);
    }
  }

  return {
    relativePath,
    type: requiredScalar(scalars, 'type', relativePath),
    title: requiredScalar(scalars, 'title', relativePath),
    description: requiredScalar(scalars, 'description', relativePath),
    classification,
    products: requiredList(lists, 'product', relativePath),
    categories: requiredList(lists, 'category', relativePath),
    tags: requiredList(lists, 'tags', relativePath),
    timestamp: requiredScalar(scalars, 'timestamp', relativePath),
    lastReviewed,
    reviewBy,
    body,
    headings: sections.map(section => (section[1] ?? '').trim()),
  };
}

function discoverLeaves(root: string): string[] {
  const visit = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
    .flatMap(entry => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return visit(path);
      return entry.isFile() && LEAF_FILENAMES.has(entry.name) ? [path] : [];
    });
  return visit(root).sort();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.md$/i, '')
    .replace(/[_/]+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function titleize(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function articleBody(body: string): string {
  const lines = body.split('\n');
  const titleIndex = lines.findIndex(line => /^#\s+/.test(line));
  if (titleIndex >= 0) lines.splice(titleIndex, 1);
  return `${lines.join('\n').trim()}\n`;
}

function normalizedSource(document: SupportKnowledgeDocument): string {
  const frontmatter = [
    '---',
    `type: ${JSON.stringify(document.type)}`,
    `title: ${JSON.stringify(document.title)}`,
    `description: ${JSON.stringify(document.description)}`,
    `category: ${JSON.stringify(document.categories[0])}`,
    'visibility: "public"',
    `timestamp: ${JSON.stringify(document.timestamp)}`,
    'tags:',
    ...document.tags.map(tag => `  - ${JSON.stringify(tag)}`),
    '---',
  ];
  return `${frontmatter.join('\n')}\n${document.body.trim()}\n`;
}

function importedFreshness(document: SupportKnowledgeDocument): KbFreshness {
  const reviewed = new Date(`${document.lastReviewed}T00:00:00Z`).valueOf();
  const reviewBy = new Date(`${document.reviewBy}T00:00:00Z`).valueOf();
  const days = (reviewBy - reviewed) / 86_400_000;
  return days <= 45 ? 'time-sensitive' : 'evergreen';
}

function topicDefinitions(
  documents: SupportKnowledgeDocument[],
  previousManifest: KbManifest | undefined,
): KbTopic[] {
  const previous = new Map(previousManifest?.topics.map(topic => [topic.slug, topic]) ?? []);
  const categorySlugs = new Set(documents.flatMap(document => document.categories));
  return [...categorySlugs]
    .sort()
    .map((slug, index) => previous.get(slug) ?? {
      slug,
      title: titleize(slug),
      description: `Support guidance for ${titleize(slug).toLowerCase()}.`,
      featuredRank: index + 1,
    });
}

function previousAliasesBySource(
  documents: SupportKnowledgeDocument[],
  previousManifest: KbManifest | undefined,
): Map<string, string[]> {
  const currentPaths = new Set(documents.map(document => document.relativePath));
  const aliases = new Map<string, string[]>();
  for (const guide of previousManifest?.guides ?? []) {
    const counts = new Map<string, number>();
    for (const source of guide.sources) {
      if (currentPaths.has(source.sourcePath)) {
        counts.set(source.sourcePath, (counts.get(source.sourcePath) ?? 0) + 1);
      }
    }
    const owner = [...counts].sort(([leftPath, leftCount], [rightPath, rightCount]) => {
      const guideIdentity = slugify(`${guide.slug}-${guide.title}`).replaceAll('-', '');
      const affinity = (path: string): number => {
        const directory = path.replace(/\/public\.md$/, '').split('/').at(-1) ?? path;
        const identity = slugify(directory).replaceAll('-', '');
        return guideIdentity.includes(identity) ? identity.length : 0;
      };
      return rightCount - leftCount || affinity(rightPath) - affinity(leftPath) ||
        leftPath.localeCompare(rightPath);
    })[0]?.[0];
    if (!owner) continue;
    const primaryTopic = guide.topics[0];
    const primaryPath = primaryTopic ? `/kb/${primaryTopic}/${guide.slug}` : null;
    aliases.set(owner, [
      ...(aliases.get(owner) ?? []),
      ...(primaryPath ? [primaryPath] : []),
      guide.slug,
      ...guide.aliases,
    ]);
  }
  return new Map([...aliases].map(([path, values]) => [path, [...new Set(values)].sort()]));
}

function guideFor(
  document: SupportKnowledgeDocument,
  previousAliases: string[],
): KbGuideDefinition {
  const slug = slugify(document.relativePath.replace(/\/public\.md$/, ''));
  return {
    slug,
    title: document.title,
    description: document.description,
    articlePath: `${slug}.md`,
    sources: document.headings.map(sourceHeading => ({
      sourcePath: document.relativePath,
      sourceHeading,
    })),
    topics: [...document.categories].sort(),
    tags: [...new Set([...document.tags, ...document.products])].sort(),
    aliases: previousAliases.filter(value => value !== slug),
    relatedGuides: [],
    externalResources: [],
    updatedAt: document.timestamp.slice(0, 10),
    lastVerifiedAt: document.lastReviewed,
    reviewAfter: document.reviewBy,
    freshness: importedFreshness(document),
    state: 'published',
    featured: false,
  };
}

export function buildSupportKnowledgeSnapshot(input: {
  sourceRoot: string;
  sourceCommit: string;
  previousManifest?: KbManifest;
  now: Date;
}): SupportKnowledgeSnapshot {
  if (!input.sourceCommit.trim()) throw new Error('sourceCommit is required');

  const documents = discoverLeaves(input.sourceRoot).flatMap(path => {
    const relativePath = relative(input.sourceRoot, path).replace(/\\/g, '/');
    const raw = readFileSync(path, 'utf8');
    const { scalars } = parseFrontmatter(raw, relativePath);
    if (leafClassification(scalars, relativePath) === 'customer-safe') return [];
    return [parseSupportKnowledgeDocument(raw, relativePath)];
  });
  const publicDocuments = documents
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  if (publicDocuments.length === 0) throw new Error('support-knowledge contains no public leaves');

  const sourceFiles = new Map<string, string>();
  const articleFiles = new Map<string, string>();
  const previousAliases = previousAliasesBySource(publicDocuments, input.previousManifest);
  const guides = publicDocuments.map(document => {
    const guide = guideFor(document, previousAliases.get(document.relativePath) ?? []);
    sourceFiles.set(document.relativePath, normalizedSource(document));
    articleFiles.set(guide.articlePath!, articleBody(document.body));
    return guide;
  });

  return {
    manifest: {
      schemaVersion: 2,
      source: {
        repository: SOURCE_REPOSITORY,
        commit: input.sourceCommit.trim(),
        capturedAt: input.now.toISOString().slice(0, 10),
        contentHash: sourceContentHash(sourceFiles),
      },
      topics: topicDefinitions(publicDocuments, input.previousManifest),
      guides,
    },
    sourceFiles,
    articleFiles,
  };
}

function writeSnapshotDirectory(snapshot: SupportKnowledgeSnapshot, root: string): void {
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, 'manifest.json'),
    `${JSON.stringify(snapshot.manifest, null, 2)}\n`,
    'utf8',
  );
  for (const [relativePath, contents] of snapshot.sourceFiles) {
    const target = join(root, 'source', relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents, 'utf8');
  }
  for (const [relativePath, contents] of snapshot.articleFiles) {
    const target = join(root, 'articles', relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents, 'utf8');
  }
}

export function writeSupportKnowledgeSnapshot(input: {
  snapshot: SupportKnowledgeSnapshot;
  targetRoot: string;
  validate: (stagedRoot: string) => void;
}): void {
  const targetRoot = resolve(input.targetRoot);
  if (targetRoot === parse(targetRoot).root) {
    throw new Error(`Refusing to replace unsafe snapshot path: ${targetRoot}`);
  }

  const parent = dirname(targetRoot);
  mkdirSync(parent, { recursive: true });
  const stagedRoot = mkdtempSync(join(parent, '.kb-import-'));
  const backupRoot = join(parent, `.kb-backup-${process.pid}-${Date.now()}`);
  let movedPrevious = false;

  try {
    writeSnapshotDirectory(input.snapshot, stagedRoot);
    const externalSources = join(targetRoot, 'external-sources');
    if (existsSync(externalSources)) {
      if (lstatSync(externalSources).isSymbolicLink()) {
        throw new Error('KB external-sources must not be a symbolic link');
      }
      cpSync(externalSources, join(stagedRoot, 'external-sources'), { recursive: true });
    }
    input.validate(stagedRoot);
    if (existsSync(targetRoot)) {
      renameSync(targetRoot, backupRoot);
      movedPrevious = true;
    }
    renameSync(stagedRoot, targetRoot);
    if (movedPrevious) rmSync(backupRoot, { recursive: true, force: true });
  } catch (error) {
    if (movedPrevious && !existsSync(targetRoot) && existsSync(backupRoot)) {
      renameSync(backupRoot, targetRoot);
    }
    throw error;
  } finally {
    rmSync(stagedRoot, { recursive: true, force: true });
    if (existsSync(backupRoot) && existsSync(targetRoot)) {
      rmSync(backupRoot, { recursive: true, force: true });
    }
  }
}
