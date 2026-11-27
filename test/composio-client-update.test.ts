import { expect, test } from 'bun:test';
import { dirname, join } from 'node:path';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import { Effect, FileSystem, Schema } from 'effect';
import {
  ClientUpdateCommandError,
  ClientUpdateIoError,
  ClientUpdateRegistryError,
  applyArtifact,
  catalogVersion,
  commonStableVersion,
  isStableVersion,
  planUpdates,
  prepare,
  validateEvent,
  verifyReleases,
} from '../scripts/update-composio-client';

const wheel = { filename: 'composio_client-2.0.1-py3-none-any.whl', yanked: false };
const sourceSha = 'a'.repeat(40);
const run = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
  Effect.runPromise(effect.pipe(Effect.provide(BunFileSystem.layer)));
const withFs = <A, E>(action: (fs: FileSystem.FileSystem) => Effect.Effect<A, E>) =>
  Effect.gen(function* () {
    return yield* action(yield* FileSystem.FileSystem);
  });
const fixtureIo = <A, E>(action: (fs: FileSystem.FileSystem) => Effect.Effect<A, E>) =>
  withFs(action).pipe(
    Effect.mapError(
      cause =>
        new ClientUpdateIoError({
          operation: 'fixture I/O',
          path: 'fixture',
          message: 'Fixture I/O failed',
          cause,
        })
    )
  );
const tempDirectory = (prefix: string) => run(withFs(fs => fs.makeTempDirectory({ prefix })));
const removeDirectory = (path: string) =>
  run(withFs(fs => fs.remove(path, { recursive: true, force: true })));
const readText = (path: string) => run(withFs(fs => fs.readFileString(path)));
const files = {
  'pnpm-workspace.yaml':
    "catalog:\n  '@composio/client': 2.0.0\n  effect: ^4.1.0\nminimumReleaseAgeExclude:\n  - '@composio/*'\n  - effect@4.0.3\n",
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
    ' 2.0.1',
    '2.0.1 ',
    '9007199254740993.0.0',
    '$(id)',
    '2.0',
  ]) {
    expect(isStableVersion(version)).toBe(false);
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
  expect(plan.changed['pnpm-workspace.yaml']).toBe(
    files['pnpm-workspace.yaml'].replace("'@composio/client': 2.0.0", "'@composio/client': 2.0.1")
  );
  expect(plan.changed['python/setup.py']).toContain('composio-client==2.0.1');
  expect(plan.changed['python/pyproject.toml']).toContain('composio-client==2.0.1');
  expect(plan.changed['.changeset/composio-client-update.md']).toContain("'@composio/core': patch");
  expect(plan.changed['.changeset/composio-client-update.md']).toContain(
    "'@composio/python-sdk': patch"
  );
  expect(plan.changed['.changeset/composio-client-update.md']).not.toContain("'@composio/cli':");
  expect(plan.changed['ts/packages/cli/CHANGELOG.md']).toContain('- Existing note.');
  expect(planUpdates({ ...files, ...plan.changed }, '2.0.1').changed).toEqual({});
  expect(planUpdates(files, '2.0.1').changed).toEqual(plan.changed);
});

test('the workspace exempts every first-party package from the release-age wait', async () => {
  const workspace = Schema.decodeUnknownSync(
    Schema.Struct({
      minimumReleaseAge: Schema.Number,
      minimumReleaseAgeExclude: Schema.Array(Schema.String),
    })
  )(Bun.YAML.parse(await readText(new URL('../pnpm-workspace.yaml', import.meta.url).pathname)));
  expect(workspace.minimumReleaseAgeExclude).toContain('@composio/*');
});

test('CLI notes create an Unreleased patch section without changing released history', () => {
  const history = '\n## 0.3.0\n\n### Patch Changes\n\n- A published fix.\n';
  for (const unreleased of ['\n', '\n### Minor Changes\n\n- An upcoming feature.\n']) {
    const header = '# @composio/cli\n\n## Unreleased\n';
    const updated = planUpdates(
      {
        ...files,
        'ts/packages/cli/CHANGELOG.md': `${header}${unreleased}${history}`,
      },
      '2.0.1'
    ).changed['ts/packages/cli/CHANGELOG.md']!;
    const boundary = updated.indexOf('\n## 0.3.0');
    expect(updated.slice(boundary)).toBe(history);
    expect(updated.slice(0, boundary)).toContain(
      '### Patch Changes\n\n- Update @composio/client to 2.0.1'
    );
    expect(updated.slice(0, boundary)).toContain(unreleased);
  }
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
  expect(Object.keys(plan.changed).sort()).toEqual([
    '.changeset/composio-client-update.md',
    'python/pyproject.toml',
    'python/setup.py',
  ]);
  expect(plan.changed['.changeset/composio-client-update.md']).toContain(
    "'@composio/python-sdk': patch"
  );
  expect(plan.changed['.changeset/composio-client-update.md']).not.toContain("'@composio/core':");
});

test('artifact transfer rejects unexpected paths, duplicates and advancing next before writes', async () => {
  const root = await tempDirectory('client-update-');
  const artifact = {
    version: '2.0.1',
    base_sha: sourceSha,
    files: [{ path: 'python/setup.py', content: 'updated' }],
  };
  try {
    await expect(run(applyArtifact(root, artifact, 'b'.repeat(40)))).rejects.toThrow(
      'next advanced'
    );
    await expect(
      run(
        applyArtifact(
          root,
          { ...artifact, files: [{ path: '../escape', content: 'bad' }] },
          sourceSha
        )
      )
    ).rejects.toThrow();
    await expect(
      run(
        applyArtifact(
          root,
          { ...artifact, files: [...artifact.files, ...artifact.files] },
          sourceSha
        )
      )
    ).rejects.toThrow('Duplicate');
    expect(await run(applyArtifact(root, artifact, sourceSha))).toBe('2.0.1');
    expect(await readText(join(root, 'python/setup.py'))).toBe('updated');
  } finally {
    await removeDirectory(root);
  }
});

test('offline preparation runs scoped lock commands and publishes no artifact on failure', async () => {
  for (const failLock of [false, true]) {
    const root = await tempDirectory('client-update-prepare-');
    const commands: string[][] = [];
    try {
      for (const [path, content] of Object.entries(files)) {
        await run(
          withFs(fs =>
            Effect.andThen(fs.makeDirectory(dirname(join(root, path)), { recursive: true }), () =>
              fs.writeFileString(join(root, path), content)
            )
          )
        );
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
      const registry = (url: string) =>
        Effect.sync(() => {
          if (url.endsWith('/2.0.1'))
            return {
              name: '@composio/client',
              version: '2.0.1',
              dist: { integrity: 'sha512-value', tarball: 'https://registry.npmjs.org/client.tgz' },
            };
          if (url.endsWith('/2.0.1/json'))
            return { info: { name: 'composio-client', version: '2.0.1' }, urls: [wheel] };
          if (new URL(url).hostname === 'pypi.org') return { releases: { '2.0.1': [wheel] } };
          return { versions: { '2.0.1': {} } };
        });
      const result = run(
        prepare(root, {
          eventName: 'schedule',
          event: {},
          registry,
          runCommand: args =>
            Effect.gen(function* () {
              yield* Effect.sync(() => commands.push(args));
              if (failLock)
                return yield* Effect.fail(
                  new ClientUpdateCommandError({ command: args, message: 'lock resolution failed' })
                );
              yield* fixtureIo(fs =>
                fs.writeFileString(
                  join(root, args[0] === 'pnpm' ? 'pnpm-lock.yaml' : 'uv.lock'),
                  'fixture lock'
                )
              );
            }),
          setOutput: () => Effect.succeed(undefined),
        })
      );
      const artifactPath = join(root, '.artifacts/client-update/update.json');
      if (failLock) {
        await expect(result).rejects.toThrow('lock resolution failed');
        await expect(result).rejects.toBeInstanceOf(ClientUpdateCommandError);
        await expect(readText(artifactPath)).rejects.toThrow();
      } else {
        await result;
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
        expect(JSON.parse(await readText(artifactPath)).version).toBe('2.0.1');
      }
      expect(catalogVersion(await readText(join(root, 'pnpm-workspace.yaml')))).toBe('2.0.1');
    } finally {
      await removeDirectory(root);
    }
  }
});

test('registry outages and dispatch/CDN races fail before mutation', async () => {
  const root = await tempDirectory('client-update-registry-');
  try {
    await expect(
      run(
        prepare(root, {
          eventName: 'schedule',
          event: {},
          registry: () =>
            Effect.fail(
              new ClientUpdateRegistryError({
                url: 'https://pypi.org',
                message: 'Registry request failed (503)',
              })
            ),
        })
      )
    ).rejects.toThrow('Registry request failed');
    await expect(
      run(
        prepare(root, {
          eventName: 'repository_dispatch',
          event: {
            client_payload: {
              version: '2.0.2',
              source_sha: sourceSha,
              source_repository: 'ComposioHQ/composio-client',
            },
          },
          registry: url =>
            Effect.succeed(
              new URL(url).hostname === 'pypi.org'
                ? { releases: { '2.0.1': [wheel] } }
                : { versions: { '2.0.1': {} } }
            ),
        })
      )
    ).rejects.toThrow('not yet available on both registries');
    await expect(readText(join(root, '.artifacts/client-update/update.json'))).rejects.toThrow();
  } finally {
    await removeDirectory(root);
  }
});

test('workflow keeps dispatched data out of code and scopes App credentials to publishing', async () => {
  const workflow = Bun.YAML.parse(
    await readText(new URL('../.github/workflows/client.update.yml', import.meta.url).pathname)
  );
  const steps = Schema.Array(Schema.Record(Schema.String, Schema.Unknown));
  const parsed = Schema.decodeUnknownSync(
    Schema.Struct({
      on: Schema.Struct({
        repository_dispatch: Schema.Struct({ types: Schema.Array(Schema.String) }),
        schedule: Schema.Array(Schema.Struct({ cron: Schema.String })),
      }),
      concurrency: Schema.Struct({ 'cancel-in-progress': Schema.Literal(false) }),
      jobs: Schema.Struct({
        prepare: Schema.Struct({ if: Schema.String, steps }),
        publish: Schema.Struct({ steps }),
      }),
    })
  )(workflow);
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

test('CLI reports a failed command once without dumping structured causes', () => {
  const result = Bun.spawnSync(
    [
      process.execPath,
      new URL('../scripts/update-composio-client.ts', import.meta.url).pathname,
      'invalid-command',
    ],
    { stdout: 'pipe', stderr: 'pipe' }
  );
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString().trim()).toBe(
    'Usage: bun scripts/update-composio-client.ts prepare|apply'
  );
});
