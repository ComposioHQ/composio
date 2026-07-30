import { afterEach, describe, expect, test } from 'bun:test';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  collectReleaseRangePullRequests,
  resolveReleaseRange,
} from '../.github/scripts/sdk-release/collect-release-range';
import { prepareSdkVersions, type CommandInvocation } from '../.github/scripts/sdk-release/prepare';

const repositoryRoot = new URL('..', import.meta.url).pathname;
const changesetBin = join(repositoryRoot, 'node_modules/.bin/changeset');
const pythonSetter = join(repositoryRoot, 'python/scripts/set-release-version.py');
const fixtures: string[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    rmSync(fixture, { recursive: true, force: true });
  }
});

describe('exact changelog release range', () => {
  test.each([
    ['typescript', ['typescript'], 'b'.repeat(40)],
    ['python', ['python'], 'c'.repeat(40)],
    ['combined', ['typescript', 'python'], 'd'.repeat(40)],
  ] as const)(
    'resolves %s from the selected merged release anchors',
    (scope, ecosystems, boundary) => {
      const root = fixtureRoot('sdk-release-range-');
      const base = 'a'.repeat(40);
      const run = (_command: string, args: string[]): string => {
        const joined = args.join(' ');
        if (joined.includes('refs/tags/@composio/core@*')) return '@composio/core@0.14.0';
        if (joined.includes('refs/tags/py@*')) return 'py@0.18.0';
        if (joined === 'rev-parse @composio/core@0.14.0^{commit}') return 'b'.repeat(40);
        if (joined === 'rev-parse py@0.18.0^{commit}') return 'c'.repeat(40);
        if (args[0] === 'merge-base' && args[1] === '--octopus') return 'd'.repeat(40);
        if (args[0] === 'merge-base' && args[1] === '--is-ancestor') return '';
        if (args[0] === 'rev-list') return `${'e'.repeat(40)}\n${'f'.repeat(40)}`;
        throw new Error(`Unexpected command: ${joined}`);
      };
      const range = resolveReleaseRange({
        repository_root: root,
        base_commit: base,
        scope,
        run,
      });
      expect(range.boundary_commit).toBe(boundary);
      expect(range.anchors.map(anchor => anchor.ecosystem)).toEqual([...ecosystems]);
      expect(range.commits).toEqual(['e'.repeat(40), 'f'.repeat(40)]);
    }
  );

  test('deduplicates only next-targeted merged PRs associated with range commits', () => {
    const root = fixtureRoot('sdk-release-pr-range-');
    const calls: string[] = [];
    const pull = {
      number: 4001,
      title: 'Release fix',
      body: 'Verified source',
      html_url: 'https://github.com/ComposioHQ/composio/pull/4001',
      merged_at: '2026-07-29T10:00:00Z',
      merge_commit_sha: 'f'.repeat(40),
      base: { ref: 'next' },
    };
    const pullRequests = collectReleaseRangePullRequests({
      repository_root: root,
      repository: 'ComposioHQ/composio',
      range: {
        base_commit: 'a'.repeat(40),
        boundary_commit: 'b'.repeat(40),
        anchors: [
          { ecosystem: 'typescript', tag: '@composio/core@0.14.0', commit: 'b'.repeat(40) },
        ],
        commits: ['e'.repeat(40), 'f'.repeat(40)],
      },
      run: (_command, args) => {
        calls.push(args.at(-1)!);
        return JSON.stringify([pull, { ...pull, number: 4002, base: { ref: 'main' } }]);
      },
    });
    expect(pullRequests).toEqual([
      {
        number: 4001,
        title: 'Release fix',
        body: 'Verified source',
        url: 'https://github.com/ComposioHQ/composio/pull/4001',
        merged_at: '2026-07-29T10:00:00Z',
        merge_commit_sha: 'f'.repeat(40),
      },
    ]);
    expect(calls).toHaveLength(2);
  });
});

function fixtureRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  fixtures.push(root);
  return root;
}

function write(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function writeJson(path: string, value: unknown): void {
  write(path, `${JSON.stringify(value, null, 2)}\n`);
}

function createChangesetsFixture(): string {
  const root = fixtureRoot('sdk-release-ts-');
  writeJson(join(root, 'package.json'), {
    name: 'fixture',
    private: true,
    workspaces: ['packages/*'],
  });
  writeJson(join(root, '.changeset/config.json'), {
    changelog: false,
    commit: false,
    fixed: [['@fixture/core', '@fixture/slim']],
    linked: [],
    access: 'restricted',
    baseBranch: 'main',
    updateInternalDependencies: 'patch',
    ignore: ['@composio/cli', '@composio/cli-local-tools'],
    privatePackages: { version: true, tag: true },
    ___experimentalUnsafeOptions_WILL_CHANGE_IN_PATCH: {
      onlyUpdatePeerDependentsWhenOutOfRange: true,
    },
  });

  const packages = [
    { name: '@fixture/core', version: '1.0.0' },
    { name: '@fixture/slim', version: '1.0.0' },
    {
      name: '@fixture/internal',
      version: '1.0.0',
      dependencies: { '@fixture/core': '^1.0.0' },
    },
    {
      name: '@fixture/peer-in-range',
      version: '1.0.0',
      peerDependencies: { '@fixture/core': '>=1 <3' },
    },
    {
      name: '@fixture/peer-out-of-range',
      version: '1.0.0',
      peerDependencies: { '@fixture/core': '^1.0.0' },
    },
    { name: '@composio/cli', version: '1.0.0' },
    { name: '@composio/cli-local-tools', version: '1.0.0' },
  ];
  for (const packageJson of packages) {
    writeJson(
      join(root, 'packages', packageJson.name.split('/').at(-1)!, 'package.json'),
      packageJson
    );
  }
  write(
    join(root, '.changeset/core-major.md'),
    '---\n"@fixture/core": major\n---\n\nBreak core.\n'
  );
  return root;
}

function createPythonFixture(
  options: { runtimeVersion?: string; missingSetup?: string } = {}
): string {
  const root = fixtureRoot('sdk-release-python-');
  write(join(root, 'pyproject.toml'), '[project]\nname = "composio"\nversion = "1.2.3"\n');
  write(
    join(root, 'composio/__version__.py'),
    `__version__ = "${options.runtimeVersion ?? '1.2.3'}"\n`
  );
  write(join(root, 'uv.lock'), 'root-lock\n');

  for (const provider of ['alpha', 'beta']) {
    write(
      join(root, `providers/${provider}/pyproject.toml`),
      `[project]\nname = "composio-${provider}"\nversion = "1.2.3"\n`
    );
    if (options.missingSetup !== provider) {
      write(
        join(root, `providers/${provider}/setup.py`),
        `from setuptools import setup\nsetup(\n    name="composio_${provider}",\n    version="1.2.3",\n)\n`
      );
    }
  }
  write(join(root, 'providers/beta/uv.lock'), 'provider-lock\n');
  return root;
}

async function fixtureRunner(
  invocations: CommandInvocation[]
): Promise<(invocation: CommandInvocation) => Promise<{ stdout: string }>> {
  return async invocation => {
    invocations.push(invocation);
    if (invocation.command === 'pnpm' && invocation.args.join(' ') === 'validate:changesets') {
      for (const name of ['ignored-cli']) {
        const path = join(invocation.cwd, `.changeset/${name}.md`);
        if (existsSync(path) && readFileSync(path, 'utf8').includes('@composio/cli')) {
          throw new Error(`${name}: @composio/cli`);
        }
      }
      return { stdout: '' };
    }
    if (invocation.command === 'pnpm' && invocation.args.join(' ') === 'changeset version') {
      const result = spawnSync(changesetBin, ['version'], {
        cwd: invocation.cwd,
        encoding: 'utf8',
      });
      if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout);
      }
      return { stdout: result.stdout };
    }
    if (invocation.command === 'python3') {
      const result = spawnSync('python3', invocation.args, {
        cwd: invocation.cwd,
        encoding: 'utf8',
      });
      if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout);
      }
      return { stdout: result.stdout };
    }
    if (invocation.command === 'uv' && invocation.args.join(' ') === 'lock') {
      return { stdout: '' };
    }
    throw new Error(`Unexpected command: ${invocation.command} ${invocation.args.join(' ')}`);
  };
}

describe('deterministic TypeScript preparation', () => {
  test('uses actual post-Changesets metadata for fixed, internal, and peer-dependent bumps', async () => {
    const root = createChangesetsFixture();
    const invocations: CommandInvocation[] = [];
    const result = await prepareSdkVersions({
      repositoryRoot: root,
      scope: 'typescript',
      run: await fixtureRunner(invocations),
    });

    expect(invocations.slice(0, 2).map(item => [item.command, ...item.args].join(' '))).toEqual([
      'pnpm validate:changesets',
      'pnpm changeset version',
    ]);
    expect(result.changeset_ids).toEqual(['core-major']);
    expect(
      Object.fromEntries(result.typescript_packages.map(item => [item.name, item.version]))
    ).toEqual({
      '@fixture/core': '2.0.0',
      '@fixture/internal': '1.0.1',
      '@fixture/peer-out-of-range': '2.0.0',
      '@fixture/slim': '2.0.0',
    });
    expect(result.typescript_packages.map(item => item.name)).not.toContain(
      '@fixture/peer-in-range'
    );
    expect(result.typescript_packages.map(item => item.name)).not.toContain('@composio/cli');
  });

  test('fails on no pending Changesets and rejects ignored CLI Changesets', async () => {
    const noPending = createChangesetsFixture();
    rmSync(join(noPending, '.changeset/core-major.md'));
    await expect(
      prepareSdkVersions({
        repositoryRoot: noPending,
        scope: 'typescript',
        run: await fixtureRunner([]),
      })
    ).rejects.toThrow('No pending Changesets');

    const ignored = createChangesetsFixture();
    write(
      join(ignored, '.changeset/ignored-cli.md'),
      '---\n"@composio/cli": patch\n---\n\nDo not release the CLI.\n'
    );
    await expect(
      prepareSdkVersions({
        repositoryRoot: ignored,
        scope: 'typescript',
        run: await fixtureRunner([]),
      })
    ).rejects.toThrow('ignored-cli: @composio/cli');
  });
});

describe('deterministic Python preparation', () => {
  test('sets one exact version across every provider and is idempotent', () => {
    const root = createPythonFixture();
    const first = spawnSync(
      'python3',
      [pythonSetter, '--python-root', root, '--version', '2.0.0'],
      { encoding: 'utf8' }
    );
    expect(first.status, first.stderr).toBe(0);
    const firstReport = JSON.parse(first.stdout);
    expect(firstReport.packages.map((item: { name: string }) => item.name)).toEqual([
      'composio',
      'composio-alpha',
      'composio-beta',
    ]);

    const metadataPaths = [
      'pyproject.toml',
      'composio/__version__.py',
      'providers/alpha/pyproject.toml',
      'providers/alpha/setup.py',
      'providers/beta/pyproject.toml',
      'providers/beta/setup.py',
    ];
    const afterFirst = metadataPaths.map(path => readFileSync(join(root, path), 'utf8'));
    const second = spawnSync(
      'python3',
      [pythonSetter, '--python-root', root, '--version', '2.0.0'],
      { encoding: 'utf8' }
    );
    expect(second.status, second.stderr).toBe(0);
    expect(metadataPaths.map(path => readFileSync(join(root, path), 'utf8'))).toEqual(afterFirst);
  });

  test('fails before mutation on missing provider metadata or an existing runtime mismatch', () => {
    const missing = createPythonFixture({ missingSetup: 'beta' });
    const beforeMissing = readFileSync(join(missing, 'pyproject.toml'), 'utf8');
    const missingResult = spawnSync(
      'python3',
      [pythonSetter, '--python-root', missing, '--version', '2.0.0'],
      { encoding: 'utf8' }
    );
    expect(missingResult.status).not.toBe(0);
    expect(missingResult.stderr).toContain('providers/beta/setup.py');
    expect(readFileSync(join(missing, 'pyproject.toml'), 'utf8')).toBe(beforeMissing);

    const mismatch = createPythonFixture({ runtimeVersion: '1.2.2' });
    const mismatchResult = spawnSync(
      'python3',
      [pythonSetter, '--python-root', mismatch, '--version', '2.0.0'],
      { encoding: 'utf8' }
    );
    expect(mismatchResult.status).not.toBe(0);
    expect(mismatchResult.stderr).toContain('runtime version');
    expect(readFileSync(join(mismatch, 'pyproject.toml'), 'utf8')).toContain('version = "1.2.3"');
  });

  test('defers TypeScript Changesets in Python-only mode and locks only existing lock projects', async () => {
    const repository = createChangesetsFixture();
    const pythonRoot = createPythonFixture();
    cpSync(pythonRoot, join(repository, 'python'), { recursive: true });

    const invocations: CommandInvocation[] = [];
    const result = await prepareSdkVersions({
      repositoryRoot: repository,
      scope: 'python',
      pythonVersion: '2.0.0',
      expectedPythonFamily: ['composio', 'composio-alpha', 'composio-beta'],
      run: await fixtureRunner(invocations),
    });

    expect(result.changeset_ids).toEqual([]);
    expect(result.deferred_changeset_ids).toEqual(['core-major']);
    expect(result.python_packages.map(item => item.name)).toEqual([
      'composio',
      'composio-alpha',
      'composio-beta',
    ]);
    expect(
      invocations
        .filter(item => item.command === 'uv')
        .map(item => relative(repository, item.cwd) || '.')
    ).toEqual(['.', 'python/providers/beta']);
    expect(invocations.some(item => item.command === 'pnpm')).toBe(false);

    const metadataPaths = [
      'python/pyproject.toml',
      'python/composio/__version__.py',
      'python/providers/alpha/pyproject.toml',
      'python/providers/alpha/setup.py',
      'python/providers/beta/pyproject.toml',
      'python/providers/beta/setup.py',
    ];
    const afterFirst = metadataPaths.map(path => readFileSync(join(repository, path), 'utf8'));
    const repeated = await prepareSdkVersions({
      repositoryRoot: repository,
      scope: 'python',
      pythonVersion: '2.0.0',
      expectedPythonFamily: ['composio', 'composio-alpha', 'composio-beta'],
      run: await fixtureRunner([]),
    });
    expect(repeated).toEqual(result);
    expect(metadataPaths.map(path => readFileSync(join(repository, path), 'utf8'))).toEqual(
      afterFirst
    );
  });
});
