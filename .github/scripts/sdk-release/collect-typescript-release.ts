import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { z } from 'zod';
import { IGNORED_TYPESCRIPT_RELEASE_PACKAGES } from './contracts';

export interface TypeScriptPackageMetadata {
  path: string;
  name: string;
  version: string;
  private: boolean;
}

export interface TypeScriptReleasePackage {
  ecosystem: 'typescript';
  name: string;
  version: string;
  registry: 'npm';
  dist_tag: string;
}

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
const WorkspaceRootSchema = z.object({
  workspaces: z.union([
    z.array(z.string()),
    z.object({ packages: z.array(z.string()).optional() }).passthrough(),
  ]),
});
const PackageMetadataSchema = z
  .object({
    name: z.string().min(1),
    version: z.string().min(1),
    private: z.boolean().optional(),
  })
  .passthrough();

function packageDirectories(repositoryRoot: string): string[] {
  const rootPackageJson = WorkspaceRootSchema.parse(
    JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8'))
  );
  const workspaces = Array.isArray(rootPackageJson.workspaces)
    ? rootPackageJson.workspaces
    : rootPackageJson.workspaces?.packages;
  if (!workspaces) {
    throw new Error('Root package.json must define workspace package paths');
  }

  const directories = new Set<string>();
  for (const workspace of workspaces) {
    if (!workspace.endsWith('/*')) {
      const packageJsonPath = join(repositoryRoot, workspace, 'package.json');
      if (existsSync(packageJsonPath)) {
        directories.add(join(repositoryRoot, workspace));
      }
      continue;
    }

    const parent = join(repositoryRoot, workspace.slice(0, -2));
    if (!existsSync(parent)) continue;
    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(join(parent, entry.name, 'package.json'))) {
        directories.add(join(parent, entry.name));
      }
    }
  }
  return [...directories].sort(compareText);
}

export function readTypeScriptPackageMetadata(
  repositoryRoot: string
): Map<string, TypeScriptPackageMetadata> {
  const packages = new Map<string, TypeScriptPackageMetadata>();
  for (const directory of packageDirectories(repositoryRoot)) {
    const path = join(directory, 'package.json');
    const packageJson = PackageMetadataSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
    if (packages.has(packageJson.name)) {
      throw new Error(`Duplicate workspace package name: ${packageJson.name}`);
    }
    packages.set(packageJson.name, {
      path: relative(repositoryRoot, path),
      name: packageJson.name,
      version: packageJson.version,
      private: packageJson.private === true,
    });
  }
  return packages;
}

function distTag(version: string): string {
  return version.includes('-') ? 'next' : 'latest';
}

export function collectTypeScriptRelease(
  before: Map<string, TypeScriptPackageMetadata>,
  repositoryRoot: string
): TypeScriptReleasePackage[] {
  const after = readTypeScriptPackageMetadata(repositoryRoot);
  const ignored = new Set<string>(IGNORED_TYPESCRIPT_RELEASE_PACKAGES);
  const changed: TypeScriptReleasePackage[] = [];

  for (const [name, current] of after) {
    const previous = before.get(name);
    if (!previous) {
      throw new Error(`Unexpected workspace package added during Changesets versioning: ${name}`);
    }
    if (previous.path !== current.path) {
      throw new Error(`Workspace package path changed during Changesets versioning: ${name}`);
    }
    if (previous.version === current.version) continue;
    if (ignored.has(name)) {
      throw new Error(`Ignored CLI package was unexpectedly versioned: ${name}`);
    }
    changed.push({
      ecosystem: 'typescript',
      name,
      version: current.version,
      registry: 'npm',
      dist_tag: distTag(current.version),
    });
  }

  for (const name of before.keys()) {
    if (!after.has(name)) {
      throw new Error(`Workspace package disappeared during Changesets versioning: ${name}`);
    }
  }
  if (changed.length === 0) {
    throw new Error('Changesets versioning produced no package metadata changes');
  }
  return changed.sort((left, right) => compareText(left.name, right.name));
}

export function listPendingChangesetIds(repositoryRoot: string): string[] {
  const changesetDirectory = join(repositoryRoot, '.changeset');
  if (!existsSync(changesetDirectory)) {
    throw new Error('Missing .changeset directory');
  }
  return readdirSync(changesetDirectory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md')
    .map(entry => entry.name.slice(0, -3))
    .sort(compareText);
}
