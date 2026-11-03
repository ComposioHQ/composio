import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  applyArtifact,
  catalogVersion,
  commonStableVersion,
  planUpdates,
  prepare,
  stableVersion,
  validateEvent,
  verifyReleases,
} from '../scripts/update-composio-client';

const wheel = { filename: 'composio_client-2.0.1-py3-none-any.whl', yanked: false };
const sourceSha = 'a'.repeat(40);
const files = {
  'pnpm-workspace.yaml':
    "catalog:\n  '@composio/client': 2.0.0\n  effect: ^4.1.0\nminimumReleaseAgeExclude:\n  - '@composio/client'\n  - effect@4.0.3\n",
  'python/pyproject.toml': 'dependencies = [\n  "composio-client==2.0.0",\n]\n',
  'python/setup.py': 'install_requires=["composio-client==2.0.0"],\n',
  'ts/packages/cli/CHANGELOG.md':
    '# @composio/cli\n\n## Unreleased\n\n### Patch Changes\n\n- Existing note.\n',
};

test('only canonical stable versions cross the registry/event boundary', () => {
  for (const version of [
    'v2.0.1',
    '2.0.1-rc.1',
    '2.0.1+meta',
    '02.0.1',
    '2.0.1\n',
    '$(id)',
    '2.0',
  ]) {
    expect(stableVersion.safeParse(version).success).toBe(false);
  }
  const payload = {
    version: '2.0.1',
    source_sha: sourceSha,
    source_repository: 'ComposioHQ/composio-client',
  };
  expect(validateEvent('repository_dispatch', { client_payload: payload })?.version).toBe('2.0.1');
  expect(() =>
    validateEvent('repository_dispatch', { client_payload: { ...payload, ref: 'attacker' } })
  ).toThrow();
  expect(() =>
    validateEvent('repository_dispatch', {
      client_payload: { ...payload, source_repository: 'other/repo' },
    })
  ).toThrow();
  expect(() =>
    validateEvent('repository_dispatch', { client_payload: { ...payload, source_sha: 'next' } })
  ).toThrow();
  expect(validateEvent('schedule', {})).toBeUndefined();
});

test('reconciliation selects the latest common stable non-yanked release', () => {
  expect(
    commonStableVersion(
      { versions: { '2.0.0': {}, '2.0.1': {}, '2.1.0': {}, '3.0.0-rc.1': {}, '2.0.2': {} } },
      {
        releases: {
          '2.0.0': [wheel],
          '2.0.1': [wheel],
          '2.0.2': [{ ...wheel, yanked: true }],
          '3.0.0-rc.1': [wheel],
        },
      }
    )
  ).toBe('2.0.1');
  expect(() => commonStableVersion({ versions: { '2.0.1': {} } }, { releases: {} })).toThrow(
    'no common stable'
  );
  expect(() => commonStableVersion({ error: 'rate limited' }, { releases: {} })).toThrow();
});

test('exact registry metadata must confirm usable distributions from both packages', () => {
  const npm = {
    name: '@composio/client',
    version: '2.0.1',
    dist: {
      integrity: 'sha512-value',
      tarball: 'https://registry.npmjs.org/@composio/client/-/client-2.0.1.tgz',
    },
  };
  const pypi = { info: { name: 'composio-client', version: '2.0.1' }, urls: [wheel] };
  verifyReleases('2.0.1', npm, pypi);
  expect(() => verifyReleases('2.0.2', npm, pypi)).toThrow('Both registries');
  expect(() =>
    verifyReleases('2.0.1', npm, { ...pypi, urls: [{ ...wheel, yanked: true }] })
  ).toThrow();
  expect(() => verifyReleases('2.0.1', { ...npm, dist: {} }, pypi)).toThrow();
});

test('planning updates owned pins, SDK changeset and CLI release note once', () => {
  const plan = planUpdates(files, '2.0.1');
  expect(plan.typescript).toBe(true);
  expect(plan.python).toBe(true);
  expect(catalogVersion(plan.changed['pnpm-workspace.yaml']!)).toBe('2.0.1');
  expect(plan.changed['pnpm-workspace.yaml']).toContain("- '@composio/client@2.0.1'");
  expect(plan.changed['pnpm-workspace.yaml']).not.toContain("- '@composio/client'\n");
  expect(plan.changed['pnpm-workspace.yaml']).toContain('- effect@4.0.3');
  expect(plan.changed['python/setup.py']).toContain('composio-client==2.0.1');
  expect(plan.changed['python/pyproject.toml']).toContain('composio-client==2.0.1');
  expect(plan.changed['.changeset/composio-client-update.md']).toContain("'@composio/core': patch");
  expect(plan.changed['.changeset/composio-client-update.md']).not.toContain("'@composio/cli':");
  expect(plan.changed['ts/packages/cli/CHANGELOG.md']).toContain('- Existing note.');
  expect(planUpdates({ ...files, ...plan.changed }, '2.0.1').changed).toEqual({});
  expect(planUpdates(files, '2.0.1').changed).toEqual(plan.changed);
});

test('release-age exemption advances exactly the client version and preserves other exclusions', () => {
  const catalog = files['pnpm-workspace.yaml'].replace(
    "- '@composio/client'",
    "- '@composio/client@2.0.0'"
  );
  const updated = planUpdates({ ...files, 'pnpm-workspace.yaml': catalog }, '2.0.1').changed[
    'pnpm-workspace.yaml'
  ];
  expect(updated).toContain("'@composio/client@2.0.1'");
  expect(updated).not.toContain("'@composio/client@2.0.0'");
  expect(updated).toContain('- effect@4.0.3');
});

test('never lowers current or pending versions, and rejects inconsistent Python metadata', () => {
  expect(() => planUpdates(files, '1.9.9')).toThrow('downgrade');
  expect(() => planUpdates(files, '2.0.1', '2.0.2')).toThrow('downgrade');
  expect(() =>
    planUpdates({ ...files, 'python/setup.py': '"composio-client==2.0.2"' }, '2.0.3')
  ).toThrow('disagree');
  expect(() =>
    planUpdates(
      { ...files, 'pnpm-workspace.yaml': files['pnpm-workspace.yaml'].repeat(2) },
      '2.0.1'
    )
  ).toThrow('exactly one');
});

test('Python-only catchup does not create a TypeScript release', () => {
  const plan = planUpdates(
    { ...files, 'pnpm-workspace.yaml': files['pnpm-workspace.yaml'].replace('2.0.0', '2.0.1') },
    '2.0.1'
  );
  expect(plan.typescript).toBe(false);
  expect(plan.python).toBe(true);
  expect(Object.keys(plan.changed).sort()).toEqual(['python/pyproject.toml', 'python/setup.py']);
});

test('artifact transfer rejects unexpected paths, duplicates and advancing next before writes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'client-update-'));
  const artifact = {
    version: '2.0.1',
    base_sha: sourceSha,
    files: [{ path: 'python/setup.py', content: 'updated' }],
  };
  try {
    await expect(applyArtifact(root, artifact, 'b'.repeat(40))).rejects.toThrow('next advanced');
    await expect(
      applyArtifact(
        root,
        { ...artifact, files: [{ path: '../escape', content: 'bad' }] },
        sourceSha
      )
    ).rejects.toThrow();
    await expect(
      applyArtifact(root, { ...artifact, files: [...artifact.files, ...artifact.files] }, sourceSha)
    ).rejects.toThrow('Duplicate');
    expect(await applyArtifact(root, artifact, sourceSha)).toBe('2.0.1');
    expect(await readFile(join(root, 'python/setup.py'), 'utf8')).toBe('updated');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('offline preparation runs scoped lock commands and publishes no artifact on failure', async () => {
  for (const failLock of [false, true]) {
    const root = await mkdtemp(join(tmpdir(), 'client-update-prepare-'));
    const commands: string[][] = [];
    try {
      for (const [path, content] of Object.entries(files)) {
        await mkdir(dirname(join(root, path)), { recursive: true });
        await writeFile(join(root, path), content);
      }
      for (const args of [
        ['init', '--quiet'],
        ['add', '.'],
        [
          '-c',
          'user.name=Fixture',
          '-c',
          'user.email=fixture@example.com',
          'commit',
          '--quiet',
          '-m',
          'fixture',
        ],
      ]) {
        expect(Bun.spawnSync(['git', ...args], { cwd: root }).exitCode).toBe(0);
      }
      const registry = async (url: string): Promise<unknown> => {
        if (url.endsWith('/2.0.1'))
          return {
            name: '@composio/client',
            version: '2.0.1',
            dist: { integrity: 'sha512-value', tarball: 'https://registry.npmjs.org/client.tgz' },
          };
        if (url.endsWith('/2.0.1/json'))
          return { info: { name: 'composio-client', version: '2.0.1' }, urls: [wheel] };
        if (url.includes('pypi.org')) return { releases: { '2.0.1': [wheel] } };
        return { versions: { '2.0.1': {} } };
      };
      const run = prepare(root, {
        eventName: 'schedule',
        event: {},
        registry,
        runCommand: async args => {
          commands.push(args);
          if (args[0] === 'pnpm') {
            expect(await readFile(join(root, 'pnpm-workspace.yaml'), 'utf8')).toContain(
              "'@composio/client@2.0.0 || 2.0.1'"
            );
          }
          if (failLock) throw new Error('lock resolution failed');
          await writeFile(
            join(root, args[0] === 'pnpm' ? 'pnpm-lock.yaml' : 'uv.lock'),
            'fixture lock'
          );
        },
        setOutput: async () => {},
      });
      const artifactPath = join(root, '.artifacts/client-update/update.json');
      if (failLock) {
        await expect(run).rejects.toThrow('lock resolution failed');
        await expect(readFile(artifactPath)).rejects.toThrow();
      } else {
        await run;
        expect(commands).toEqual([
          ['pnpm', 'install', '--lockfile-only', '--ignore-scripts', '--no-frozen-lockfile'],
          [
            'uv',
            'lock',
            '--python',
            Bun.which('python') ?? '',
            '--upgrade-package',
            'composio-client',
          ],
        ]);
        expect(JSON.parse(await readFile(artifactPath, 'utf8')).version).toBe('2.0.1');
        expect(await readFile(join(root, 'pnpm-workspace.yaml'), 'utf8')).not.toContain('||');
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test('registry outages and dispatch/CDN races fail before mutation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'client-update-registry-'));
  try {
    await expect(
      prepare(root, {
        eventName: 'schedule',
        event: {},
        registry: async () => {
          throw new Error('Registry request failed (503)');
        },
      })
    ).rejects.toThrow('Registry request failed');
    await expect(
      prepare(root, {
        eventName: 'repository_dispatch',
        event: {
          client_payload: {
            version: '2.0.2',
            source_sha: sourceSha,
            source_repository: 'ComposioHQ/composio-client',
          },
        },
        registry: async url =>
          url.includes('pypi.org')
            ? { releases: { '2.0.1': [wheel] } }
            : { versions: { '2.0.1': {} } },
      })
    ).rejects.toThrow('not yet available on both registries');
    await expect(readFile(join(root, '.artifacts/client-update/update.json'))).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('workflow keeps dispatched data out of code and scopes App credentials to publishing', async () => {
  const workflow = Bun.YAML.parse(
    await readFile(new URL('../.github/workflows/client.update.yml', import.meta.url), 'utf8')
  );
  const schema = (await import('zod')).z;
  const parsed = schema
    .object({
      on: schema.object({
        repository_dispatch: schema.object({ types: schema.array(schema.string()) }),
        schedule: schema.array(schema.object({ cron: schema.string() })),
      }),
      concurrency: schema.object({ 'cancel-in-progress': schema.literal(false) }),
      jobs: schema.object({
        prepare: schema.object({
          if: schema.string(),
          steps: schema.array(schema.record(schema.string(), schema.unknown())),
        }),
        publish: schema.object({
          steps: schema.array(schema.record(schema.string(), schema.unknown())),
        }),
      }),
    })
    .parse(workflow);
  expect(parsed.on.repository_dispatch.types).toContain('composio-client-published');
  expect(parsed.jobs.prepare.if).toContain("github.actor == 'sdkrelease[bot]'");
  expect(JSON.stringify(parsed.jobs.prepare)).not.toContain('RELEASE_BOT_APP_PRIVATE_KEY');
  const text = JSON.stringify(parsed.jobs.publish.steps);
  expect(text).toContain('permission-pull-requests');
  expect(text).not.toContain('auto-merge');
  expect(text.indexOf('update-composio-client.ts apply')).toBeLessThan(
    text.indexOf('RELEASE_BOT_APP_PRIVATE_KEY')
  );
});
