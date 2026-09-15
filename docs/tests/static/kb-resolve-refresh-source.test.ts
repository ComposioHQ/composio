import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const resolverPath = resolve(process.cwd(), 'scripts', 'resolve-kb-refresh-source.sh');

function git(root: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function runResolver(
  cwd: string,
  env: Record<string, string>,
): { status: number | null; output: string; stdout: string; stderr: string } {
  const outputPath = join(cwd, 'github-output.txt');
  writeFileSync(outputPath, '', 'utf8');
  const result = spawnSync('bash', [resolverPath], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env, GITHUB_OUTPUT: outputPath },
  });
  return {
    status: result.status,
    output: readFileSync(outputPath, 'utf8'),
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function createFixture(): {
  root: string;
  sourceRoot: string;
  docsRoot: string;
  currentCommit: string;
} {
  const root = mkdtempSync(join(tmpdir(), 'kb-resolve-source-'));
  const sourceRoot = join(root, 'support-knowledge');
  const docsRoot = join(root, 'docs');
  mkdirSync(join(sourceRoot, 'toolkits', 'github'), { recursive: true });
  mkdirSync(join(docsRoot, 'kb'), { recursive: true });

  git(sourceRoot, 'init');
  git(sourceRoot, 'config', 'user.name', 'KB Workflow Test');
  git(sourceRoot, 'config', 'user.email', 'kb-workflow@example.com');
  writeFileSync(join(sourceRoot, 'toolkits/github/public.md'), 'public v1\n', 'utf8');
  writeFileSync(
    join(sourceRoot, 'toolkits/github/customer-safe.md'),
    'customer-safe v1\n',
    'utf8',
  );
  git(sourceRoot, 'add', '.');
  git(sourceRoot, 'commit', '-m', 'initial knowledge');
  const currentCommit = git(sourceRoot, 'rev-parse', 'HEAD');
  writeFileSync(
    join(docsRoot, 'kb/manifest.json'),
    `${JSON.stringify({ source: { commit: currentCommit } })}\n`,
    'utf8',
  );

  return { root, sourceRoot, docsRoot, currentCommit };
}

describe('support knowledge refresh source resolver', () => {
  test('ignores customer-safe-only changes and coalesces delayed events to the newest public change', () => {
    const fixture = createFixture();

    try {
      writeFileSync(
        join(fixture.sourceRoot, 'toolkits/github/customer-safe.md'),
        'customer-safe v2\n',
        'utf8',
      );
      git(fixture.sourceRoot, 'add', '.');
      git(fixture.sourceRoot, 'commit', '-m', 'customer-safe only');
      git(fixture.sourceRoot, 'update-ref', 'refs/remotes/origin/main', 'HEAD');

      const privateOnly = runResolver(fixture.docsRoot, {
        SOURCE_ROOT: fixture.sourceRoot,
        HAVE_UPSTREAM: 'true',
        EVENT_NAME: 'schedule',
        REQUESTED_SOURCE_COMMIT: '',
      });
      expect(privateOnly.status).toBe(0);
      expect(privateOnly.output).toBe(
        `commit=${fixture.currentCommit}\nupstream_changed=false\n`,
      );

      writeFileSync(
        join(fixture.sourceRoot, 'toolkits/github/public.md'),
        'public v2\n',
        'utf8',
      );
      git(fixture.sourceRoot, 'add', '.');
      git(fixture.sourceRoot, 'commit', '-m', 'public knowledge');
      const publicCommit = git(fixture.sourceRoot, 'rev-parse', 'HEAD');
      writeFileSync(
        join(fixture.sourceRoot, 'toolkits/github/customer-safe.md'),
        'customer-safe v3\n',
        'utf8',
      );
      git(fixture.sourceRoot, 'add', '.');
      git(fixture.sourceRoot, 'commit', '-m', 'customer-safe after public knowledge');
      git(fixture.sourceRoot, 'update-ref', 'refs/remotes/origin/main', 'HEAD');

      const publicThenPrivate = runResolver(fixture.docsRoot, {
        SOURCE_ROOT: fixture.sourceRoot,
        HAVE_UPSTREAM: 'true',
        EVENT_NAME: 'schedule',
        REQUESTED_SOURCE_COMMIT: '',
      });
      expect(publicThenPrivate.status).toBe(0);
      expect(publicThenPrivate.output).toBe(
        `commit=${fixture.currentCommit}\ncommit=${publicCommit}\nupstream_changed=true\n`,
      );

      writeFileSync(
        join(fixture.sourceRoot, 'toolkits/github/public.md'),
        'public v3\n',
        'utf8',
      );
      git(fixture.sourceRoot, 'add', '.');
      git(fixture.sourceRoot, 'commit', '-m', 'newer public knowledge');
      const newestPublicCommit = git(fixture.sourceRoot, 'rev-parse', 'HEAD');
      git(fixture.sourceRoot, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
      git(fixture.sourceRoot, 'checkout', '--detach', publicCommit);

      const delayedDispatch = runResolver(fixture.docsRoot, {
        SOURCE_ROOT: fixture.sourceRoot,
        HAVE_UPSTREAM: 'true',
        EVENT_NAME: 'repository_dispatch',
        REQUESTED_SOURCE_COMMIT: publicCommit,
      });
      expect(delayedDispatch.status).toBe(0);
      expect(delayedDispatch.output).toBe(
        `commit=${fixture.currentCommit}\ncommit=${newestPublicCommit}\nupstream_changed=true\n`,
      );
      expect(git(fixture.sourceRoot, 'rev-parse', 'HEAD')).toBe(newestPublicCommit);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('rejects dispatched refreshes without a pinned commit or upstream access', () => {
    const fixture = createFixture();

    try {
      const unpinned = runResolver(fixture.docsRoot, {
        SOURCE_ROOT: fixture.sourceRoot,
        HAVE_UPSTREAM: 'true',
        EVENT_NAME: 'repository_dispatch',
        REQUESTED_SOURCE_COMMIT: '',
      });
      expect(unpinned.status).toBe(1);
      expect(unpinned.stdout).toContain(
        'Dispatched support knowledge refresh is missing source_commit.',
      );

      const unreadable = runResolver(fixture.docsRoot, {
        SOURCE_ROOT: fixture.sourceRoot,
        HAVE_UPSTREAM: 'false',
        EVENT_NAME: 'repository_dispatch',
        REQUESTED_SOURCE_COMMIT: fixture.currentCommit,
      });
      expect(unreadable.status).toBe(1);
      expect(unreadable.stdout).toContain(
        'Cannot process a dispatched support knowledge refresh without an upstream token.',
      );
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
