import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { collectChangelogInput } from './collect-changelog-input';
import { readTypeScriptPackageMetadata } from './collect-typescript-release';

const VersionsSchema = z
  .object({
    typescript_packages: z.array(
      z
        .object({
          name: z.string().min(1),
          version: z.string().min(1),
          ecosystem: z.literal('typescript'),
          registry: z.literal('npm'),
          dist_tag: z.string().min(1),
        })
        .passthrough()
    ),
    python_packages: z.array(
      z
        .object({
          name: z.string().min(1),
          version: z.string().min(1),
          ecosystem: z.literal('python'),
          registry: z.literal('pypi'),
        })
        .passthrough()
    ),
  })
  .passthrough();
const ChangesetSchema = z.object({ id: z.string(), summary: z.string() }).strict();
const PullRequestSchema = z
  .object({
    number: z.number().int().positive(),
    title: z.string(),
    body: z.string(),
    url: z.string().url(),
    merged_at: z.string(),
    merge_commit_sha: z.string(),
  })
  .strict();

export function prepareReleaseHandoff(options: {
  worktree: string;
  release_id: string;
  date: string;
  versions: unknown;
  changesets: unknown;
  pull_requests: unknown;
}): {
  legacy_packages: Array<Record<string, unknown>>;
  changelog_input: ReturnType<typeof collectChangelogInput>;
} {
  const worktree = resolve(options.worktree);
  const versions = VersionsSchema.parse(options.versions);
  const changesets = z.array(ChangesetSchema).parse(options.changesets);
  const pullRequests = z.array(PullRequestSchema).parse(options.pull_requests);
  const metadata = readTypeScriptPackageMetadata(worktree);
  const typescript = versions.typescript_packages.map(expected => {
    const observed = metadata.get(expected.name);
    if (!observed || observed.version !== expected.version) {
      throw new Error(`Legacy Changesets outcome drift for ${expected.name}`);
    }
    return {
      ecosystem: 'typescript' as const,
      name: expected.name,
      version: observed.version,
      registry: 'npm' as const,
      dist_tag: expected.dist_tag,
    };
  });
  const rootPyproject = readFileSync(resolve(worktree, 'python/pyproject.toml'), 'utf8');
  const pythonVersion = /^version\s*=\s*"([^"]+)"/m.exec(rootPyproject)?.[1];
  const python = versions.python_packages.map(expected => {
    if (pythonVersion !== expected.version) {
      throw new Error(`Legacy Python build outcome drift for ${expected.name}`);
    }
    return {
      ecosystem: 'python' as const,
      name: expected.name,
      version: pythonVersion,
      registry: 'pypi' as const,
    };
  });
  const packages = [...versions.typescript_packages, ...versions.python_packages];
  return {
    legacy_packages: [...typescript, ...python],
    changelog_input: collectChangelogInput({
      release_id: options.release_id,
      date: options.date,
      packages,
      changesets,
      pull_requests: pullRequests,
    }),
  };
}

function argumentValue(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index === -1 ? undefined : args[index + 1];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function main(args: string[]): Promise<void> {
  const result = prepareReleaseHandoff({
    worktree: argumentValue(args, '--worktree'),
    release_id: argumentValue(args, '--release-id'),
    date: argumentValue(args, '--date'),
    versions: JSON.parse(readFileSync(argumentValue(args, '--versions'), 'utf8')),
    changesets: JSON.parse(readFileSync(argumentValue(args, '--changesets'), 'utf8')),
    pull_requests: JSON.parse(readFileSync(argumentValue(args, '--pull-requests'), 'utf8')),
  });
  writeFileSync(
    argumentValue(args, '--legacy-output'),
    `${JSON.stringify(result.legacy_packages, null, 2)}\n`
  );
  writeFileSync(
    argumentValue(args, '--changelog-output'),
    `${JSON.stringify(result.changelog_input, null, 2)}\n`
  );
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
