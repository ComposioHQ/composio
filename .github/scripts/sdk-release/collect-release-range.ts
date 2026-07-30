import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const GitShaSchema = z.string().regex(/^[a-f0-9]{40}$/);
const ScopeSchema = z.enum(['typescript', 'python', 'combined']);
const PullRequestSchema = z
  .object({
    number: z.number().int().positive(),
    title: z.string().min(1).max(256),
    body: z.string().nullable(),
    html_url: z.string().url(),
    merged_at: z.string().datetime({ offset: true }).nullable(),
    merge_commit_sha: GitShaSchema.nullable(),
    base: z.object({ ref: z.string().min(1) }).passthrough(),
  })
  .passthrough();

export interface ReleaseRange {
  base_commit: string;
  boundary_commit: string;
  anchors: Array<{ ecosystem: 'typescript' | 'python'; tag: string; commit: string }>;
  commits: string[];
}

export interface ReleaseRangePullRequest {
  number: number;
  title: string;
  body: string;
  url: string;
  merged_at: string;
  merge_commit_sha: string;
}

type CommandRunner = (command: string, args: string[], cwd: string) => string;

function commandOutput(command: string, args: string[], cwd: string): string {
  const result = Bun.spawnSync([command, ...args], { cwd });
  if (result.exitCode !== 0) {
    const detail = new TextDecoder().decode(result.stderr).trim();
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return new TextDecoder().decode(result.stdout).trim();
}

function latestMergedTag(
  repositoryRoot: string,
  baseCommit: string,
  pattern: string,
  ecosystem: 'typescript' | 'python',
  run: CommandRunner
): ReleaseRange['anchors'][number] {
  const tag = run(
    'git',
    [
      'for-each-ref',
      `--merged=${baseCommit}`,
      '--sort=-creatordate',
      '--count=1',
      '--format=%(refname:strip=2)',
      `refs/tags/${pattern}`,
    ],
    repositoryRoot
  );
  if (!tag) {
    throw new Error(`No merged ${ecosystem} release tag can anchor the changelog range`);
  }
  return {
    ecosystem,
    tag,
    commit: GitShaSchema.parse(run('git', ['rev-parse', `${tag}^{commit}`], repositoryRoot)),
  };
}

export function resolveReleaseRange(options: {
  repository_root: string;
  base_commit: string;
  scope: 'typescript' | 'python' | 'combined';
  run?: CommandRunner;
}): ReleaseRange {
  const repositoryRoot = resolve(options.repository_root);
  const baseCommit = GitShaSchema.parse(options.base_commit);
  const scope = ScopeSchema.parse(options.scope);
  const run = options.run ?? commandOutput;
  const anchors: ReleaseRange['anchors'] = [];
  if (scope !== 'python') {
    anchors.push(
      latestMergedTag(repositoryRoot, baseCommit, '@composio/core@*', 'typescript', run)
    );
  }
  if (scope !== 'typescript') {
    anchors.push(latestMergedTag(repositoryRoot, baseCommit, 'py@*', 'python', run));
  }
  const boundaryCommit =
    anchors.length === 1
      ? anchors[0]!.commit
      : GitShaSchema.parse(
          run(
            'git',
            ['merge-base', '--octopus', ...anchors.map(anchor => anchor.commit)],
            repositoryRoot
          )
        );
  run('git', ['merge-base', '--is-ancestor', boundaryCommit, baseCommit], repositoryRoot);
  const commits = run(
    'git',
    ['rev-list', '--reverse', `${boundaryCommit}..${baseCommit}`],
    repositoryRoot
  )
    .split('\n')
    .filter(Boolean)
    .map(commit => GitShaSchema.parse(commit));
  if (commits.length === 0) {
    throw new Error('Release range is empty; the selected SDKs have no commits after their anchor');
  }
  if (commits.length > 500) {
    throw new Error(
      `Release range contains ${commits.length} commits; explicit boundary review is required`
    );
  }
  return {
    base_commit: baseCommit,
    boundary_commit: boundaryCommit,
    anchors,
    commits,
  };
}

export function collectReleaseRangePullRequests(options: {
  repository_root: string;
  repository: string;
  range: ReleaseRange;
  run?: CommandRunner;
}): ReleaseRangePullRequest[] {
  const run = options.run ?? commandOutput;
  const byNumber = new Map<number, ReleaseRangePullRequest>();
  for (const commit of options.range.commits) {
    const raw = run(
      'gh',
      [
        'api',
        '-H',
        'Accept: application/vnd.github+json',
        `repos/${options.repository}/commits/${commit}/pulls`,
      ],
      resolve(options.repository_root)
    );
    const pullRequests = z.array(PullRequestSchema).parse(JSON.parse(raw || '[]'));
    for (const pullRequest of pullRequests) {
      if (
        pullRequest.merged_at === null ||
        pullRequest.merge_commit_sha === null ||
        pullRequest.base.ref !== 'next'
      ) {
        continue;
      }
      byNumber.set(pullRequest.number, {
        number: pullRequest.number,
        title: pullRequest.title,
        body: (pullRequest.body ?? '').slice(0, 8_000),
        url: pullRequest.html_url,
        merged_at: pullRequest.merged_at,
        merge_commit_sha: pullRequest.merge_commit_sha,
      });
    }
  }
  const pullRequests = [...byNumber.values()].sort((left, right) => left.number - right.number);
  if (pullRequests.length > 64) {
    throw new Error(
      `Release range maps to ${pullRequests.length} pull requests; narrow the reviewed boundary`
    );
  }
  return pullRequests;
}

function argumentValue(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index === -1 ? undefined : args[index + 1];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function main(args: string[]): Promise<void> {
  const repositoryRoot = argumentValue(args, '--repository-root');
  const range = resolveReleaseRange({
    repository_root: repositoryRoot,
    base_commit: argumentValue(args, '--base-commit'),
    scope: ScopeSchema.parse(argumentValue(args, '--scope')),
  });
  const pullRequests = collectReleaseRangePullRequests({
    repository_root: repositoryRoot,
    repository: argumentValue(args, '--repository'),
    range,
  });
  writeFileSync(argumentValue(args, '--output'), `${JSON.stringify(pullRequests, null, 2)}\n`);
  const rangeOutput = args.indexOf('--range-output');
  if (rangeOutput !== -1) {
    writeFileSync(argumentValue(args, '--range-output'), `${JSON.stringify(range, null, 2)}\n`);
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
