import { createHash } from 'node:crypto';
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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

export const snapshotDirectory = (docsRoot: string, language: Language) =>
  join(docsRoot, 'sdk-reference-snapshots', language);

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

function digestPages(directory: string): string {
  const files = pageNames(directory).map(name => [
    name,
    createHash('sha256').update(readFileSync(join(directory, name))).digest('hex'),
  ]);
  return createHash('sha256').update(JSON.stringify(files)).digest('hex');
}

export function verifySnapshot(directory: string): Snapshot {
  const snapshot = readSnapshot(directory);
  if (snapshot.digest !== digestPages(join(directory, 'pages'))) {
    throw new Error(`SDK reference snapshot digest mismatch: ${directory}`);
  }
  return snapshot;
}

function compareVersions(left: string, right: string): number {
  const current = right.split('.').map(Number);
  const diffs = left.split('.').map((value, index) => Number(value) - current[index]);
  return diffs.find(diff => diff !== 0) ?? 0;
}

export function assertForwardSnapshot(current: Snapshot, proposed: Snapshot): void {
  const versionOrder = compareVersions(proposed.version, current.version);
  if (versionOrder > 0) return;
  if (versionOrder === 0 && proposed.sourceCommit === current.sourceCommit) {
    if (proposed.revision === current.revision && proposed.digest === current.digest) return;
    if (proposed.revision > current.revision && proposed.digest !== current.digest) return;
  }
  throw new Error(
    `Invalid SDK reference promotion from ${current.version} revision ${current.revision} to ${proposed.version} revision ${proposed.revision}`
  );
}

function writeManifest(directory: string, snapshot: Snapshot): void {
  writeFileSync(manifestPath(directory), `${JSON.stringify(snapshot, null, 2)}\n`);
}

export function promoteSnapshot(
  directory: string,
  pages: string,
  version: string,
  sourceCommit: string
): boolean {
  const snapshot = Manifest.parse({ version, sourceCommit, revision: 1, digest: digestPages(pages) });
  if (existsSync(manifestPath(directory))) {
    const current = verifySnapshot(directory);
    if (compareVersions(version, current.version) <= 0) return false;
  }
  const destination = join(directory, 'pages');
  rmSync(destination, { recursive: true, force: true });
  cpSync(pages, destination, { recursive: true });
  writeManifest(directory, snapshot);
  return true;
}

export function reviseSnapshot(directory: string): boolean {
  const current = readSnapshot(directory);
  const digest = digestPages(join(directory, 'pages'));
  if (digest === current.digest) return false;
  writeManifest(directory, { ...current, revision: current.revision + 1, digest });
  return true;
}
