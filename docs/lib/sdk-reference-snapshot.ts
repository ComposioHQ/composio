import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { z } from 'zod';

export const languages = ['typescript', 'python'] as const;
export type Language = (typeof languages)[number];

const Manifest = z.strictObject({
  version: z.string().regex(/^(?:0|[1-9][0-9]{0,8})\.(?:0|[1-9][0-9]{0,8})\.(?:0|[1-9][0-9]{0,8})$/),
  sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
  revision: z.number().int().positive(),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
});
export type Snapshot = z.infer<typeof Manifest>;

/** One committed snapshot file. `meta.json` travels with the pages verbatim. */
export interface StablePage {
  name: string;
  source: string;
}

export const snapshotDirectory = (docsRoot: string, language: Language) =>
  join(docsRoot, 'sdk-reference-snapshots', language);

export const stableReferenceRoot = (docsRoot: string): string => join(docsRoot, '.stable-reference');

type StableReference = { kind: 'assembled'; dir: string } | { kind: 'workspace'; dir: string };

export const resolveStableReference = (docsRoot: string): StableReference => {
  const dir = process.env.COMPOSIO_STABLE_REFERENCE_DIR;
  return dir ? { kind: 'assembled', dir } : { kind: 'workspace', dir: join(docsRoot, 'content/reference') };
};

/**
 * Production serves the frozen copy; previews keep serving the workspace pages.
 * `vercel-build.sh` treats an unset VERCEL_ENV as production, so this must too,
 * otherwise a local production build silently indexes different content than it serves.
 */
export const shouldRenderStableReference = (reference: StableReference): boolean =>
  reference.kind === 'workspace' && (process.env.VERCEL_ENV ?? 'production') === 'production';

export function resolveStableReferenceSource(
  docsRoot: string,
  assembledDir: string,
  absolutePath: string
): string {
  const relativePath = relative(assembledDir, absolutePath).replaceAll('\\', '/');
  const language = languages.find(item => relativePath.startsWith(`sdk-reference/${item}/`));
  return language !== undefined
    ? join(snapshotDirectory(docsRoot, language), 'pages', relativePath.slice(`sdk-reference/${language}/`.length))
    : join(docsRoot, 'content/reference', relativePath);
}

const manifestPath = (directory: string) => join(directory, 'manifest.json');

export const parseSnapshot = (source: string): Snapshot => Manifest.parse(JSON.parse(source));

export function readSnapshot(directory: string): Snapshot {
  return parseSnapshot(readFileSync(manifestPath(directory), 'utf8'));
}

export function pageNames(directory: string): string[] {
  const files = readdirSync(directory, { withFileTypes: true });
  for (const file of files) {
    if (!file.isFile() || !/^(?:meta\.json|[a-z][a-z0-9-]*\.mdx)$/.test(file.name)) {
      throw new Error(`Unexpected SDK reference file: ${join(directory, file.name)}`);
    }
  }
  const names = files.map(file => file.name).sort();
  const metadata = z.object({ pages: z.array(z.string()).min(1) })
    .parse(JSON.parse(readFileSync(join(directory, 'meta.json'), 'utf8')));
  const expected = ['index.mdx', 'meta.json', ...metadata.pages.map(name => `${name}.mdx`)].sort();
  if (expected.length !== names.length || expected.some((name, index) => names[index] !== name)) {
    throw new Error(`SDK reference files do not match meta.json: ${directory}`);
  }
  return names;
}

/** Read a snapshot directory as committed bytes, ordered by page name. */
export function readSnapshotPages(directory: string): StablePage[] {
  return pageNames(directory).map(name => ({ name, source: readFileSync(join(directory, name), 'utf8') }));
}

export function digestPages(pages: readonly StablePage[]): string {
  const files = [...pages]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(page => [page.name, createHash('sha256').update(page.source).digest('hex')]);
  return createHash('sha256').update(JSON.stringify(files)).digest('hex');
}

export function verifySnapshot(directory: string): Snapshot {
  const snapshot = readSnapshot(directory);
  if (snapshot.digest !== digestPages(readSnapshotPages(join(directory, 'pages')))) {
    throw new Error(`SDK reference snapshot digest mismatch: ${directory}`);
  }
  return snapshot;
}

/**
 * Compare dotted release versions. -1, 0, or 1 — a bare difference would still
 * order correctly but invites a future caller to use it as a distance.
 */
function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < leftParts.length; index++) {
    if (leftParts[index] === rightParts[index]) continue;
    return leftParts[index] > rightParts[index] ? 1 : -1;
  }
  return 0;
}

/**
 * A promotion may move the version forward, or replace its own earlier first
 * promotion of the same version. It may never go backwards, and it may never
 * overwrite a revision that a human corrected — those only move through
 * `reviseSnapshot`, which bumps the revision.
 */
export const isForwardSnapshot = (current: Snapshot, proposed: Snapshot): boolean => {
  const order = compareVersions(proposed.version, current.version);
  if (order !== 0) return order > 0;
  if (proposed.sourceCommit !== current.sourceCommit) return false;
  if (proposed.revision !== current.revision) {
    return proposed.revision > current.revision && proposed.digest !== current.digest;
  }
  // Same version, same commit, same revision: identical bytes, or repairing a
  // first promotion that no one corrected yet.
  return proposed.digest === current.digest || current.revision === 1;
};

export function assertForwardSnapshot(current: Snapshot, proposed: Snapshot): void {
  if (isForwardSnapshot(current, proposed)) return;
  throw new Error(
    `Invalid SDK reference promotion from ${current.version} revision ${current.revision} to ${proposed.version} revision ${proposed.revision}. ` +
      'Correct an already published snapshot with `bun docs/scripts/sdk-reference-snapshot.ts revise <language>`.'
  );
}

export function writeSnapshot(directory: string, pages: readonly StablePage[], snapshot: Snapshot): void {
  const destination = join(directory, 'pages');
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  for (const { name, source } of pages) writeFileSync(join(destination, name), source);
  writeFileSync(manifestPath(directory), `${JSON.stringify(snapshot, null, 2)}\n`);
}

/**
 * Write already-rendered pages as the frozen copy for `version`. The caller
 * renders, because pins and the version banner are content concerns this module
 * deliberately knows nothing about.
 */
export function promoteSnapshot(
  directory: string,
  pages: readonly StablePage[],
  version: string,
  sourceCommit: string
): string {
  const proposed = Manifest.parse({ version, sourceCommit, revision: 1, digest: digestPages(pages) });
  if (existsSync(manifestPath(directory))) {
    const current = verifySnapshot(directory);
    if (!isForwardSnapshot(current, proposed)) {
      return `not ahead of ${current.version} revision ${current.revision}`;
    }
    if (
      current.version === proposed.version &&
      current.sourceCommit === proposed.sourceCommit &&
      current.digest === proposed.digest
    ) {
      return 'already current';
    }
  }
  writeSnapshot(directory, pages, proposed);
  return `prepared ${version}`;
}

/** Accept an edit already made on disk and bump the revision that records it. */
export function reviseSnapshot(directory: string): boolean {
  const current = readSnapshot(directory);
  const digest = digestPages(readSnapshotPages(join(directory, 'pages')));
  if (digest === current.digest) return false;
  writeFileSync(manifestPath(directory), `${JSON.stringify({ ...current, revision: current.revision + 1, digest }, null, 2)}\n`);
  return true;
}
