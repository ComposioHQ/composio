import { afterEach, describe, expect, test } from 'bun:test';
import { Effect } from 'effect';
import { CANDIDATE_MANIFEST } from '../scripts/sdk-release/artifacts';
import {
  assertCandidateVersions,
  installCandidateDocs,
  loadCandidatePackages,
  serveCandidateRegistry,
} from '../scripts/sdk-release/candidate-registry';
import { tarballName } from '../scripts/sdk-release/candidates';
import { run, withoutReleaseTokens } from '../scripts/sdk-release/runtime';
import type { ReleaseBatch } from '../scripts/sdk-release/source';
import { batch } from './sdk-release-controller-fixture';
import {
  json,
  makeExecutable,
  readText,
  runRelease,
  temporaryDirectories,
  writeText,
  type Fetch,
} from './sdk-release-harness';

const directories = temporaryDirectories('sdk-candidate-registry-');
afterEach(directories.cleanup);

const PLANNED = '@composio/release-fixture';
const CANDIDATE = '1.1.0';
const UPSTREAM = 'https://registry.npmjs.org';

const exec = (cwd: string, executable: string, args: ReadonlyArray<string>) =>
  runRelease(run(executable, args, { cwd, env: withoutReleaseTokens }));

/** Packs `package.json` plus an index file into `<root>/<file>` and returns its bytes. */
const pack = async (root: string, file: string, manifest: Record<string, unknown>) => {
  const staging = await directories.create();
  await writeText(`${staging}/package/package.json`, JSON.stringify(manifest));
  await writeText(`${staging}/package/index.js`, `export const version = '${manifest.version}';\n`);
  await exec(staging, 'tar', ['-czf', `${root}/${file}`, 'package']);
  return new Uint8Array(await Bun.file(`${root}/${file}`).arrayBuffer());
};

const sha256 = (bytes: Uint8Array) => new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
const sha512 = (bytes: Uint8Array) =>
  `sha512-${new Bun.CryptoHasher('sha512').update(bytes).digest('base64')}`;

/** A downloaded TypeScript candidate holding `@composio/release-fixture@1.1.0`. */
const candidateDirectory = async () => {
  const directory = await directories.create();
  const file = tarballName(PLANNED, CANDIDATE);
  const bytes = await pack(directory, file, { name: PLANNED, version: CANDIDATE });
  await writeText(
    `${directory}/${CANDIDATE_MANIFEST}`,
    JSON.stringify({
      sourceSha: 'b'.repeat(40),
      producerRun: 41,
      language: 'typescript',
      files: [{ name: file, sha256: sha256(bytes), size: bytes.length }],
    })
  );
  return { directory, file, bytes };
};

const typescriptBatch: ReleaseBatch = {
  ...batch,
  plan: {
    ...batch.plan,
    releases: [{ ...batch.plan.releases[0], name: PLANNED, newVersion: CANDIDATE }],
  },
};

/**
 * A fake npm registry. Packuments name tarballs under `tarballOrigin()`, which a test points at
 * the candidate registry, so every download goes through it and nothing reaches the network.
 */
const fakeUpstream = (
  tarballs: Record<string, { manifest: Record<string, unknown>; bytes: Uint8Array<ArrayBuffer> }>,
  tarballOrigin: () => string
) => {
  const requests: string[] = [];
  const fetcher: Fetch = async input => {
    const url = new URL(String(input));
    requests.push(url.pathname);
    const name = decodeURIComponent(url.pathname).slice(1);
    const versions = Object.values(tarballs).filter(({ manifest }) => manifest.name === name);
    if (url.origin === UPSTREAM && versions.length)
      return json({
        name,
        'dist-tags': { latest: versions.at(-1)?.manifest.version },
        versions: Object.fromEntries(
          versions.map(({ manifest, bytes }) => [
            manifest.version,
            {
              ...manifest,
              dist: {
                tarball: `${tarballOrigin()}/${name}/-/${name.split('/').at(-1)}-${manifest.version}.tgz`,
                integrity: sha512(bytes),
              },
            },
          ])
        ),
      });
    const tarball = tarballs[decodeURIComponent(url.pathname)];
    if (url.origin === UPSTREAM && tarball) return new Response(tarball.bytes);
    return json({ error: 'Not found' }, 404);
  };
  return { fetcher, requests };
};

describe('candidate registry', () => {
  test('serves a planned package from its candidate file and proxies every other package', async () => {
    const candidate = await candidateDirectory();
    const upstream = fakeUpstream({}, () => UPSTREAM);
    const leftPad = { name: 'left-pad', 'dist-tags': { latest: '1.3.0' }, versions: {} };
    const fetcher: Fetch = async (input, init) =>
      new URL(String(input)).pathname === '/left-pad'
        ? json(leftPad)
        : upstream.fetcher(input, init);
    const responses = await runRelease(
      Effect.scoped(
        Effect.gen(function* () {
          const packages = yield* loadCandidatePackages(candidate.directory, [
            { name: PLANNED, newVersion: CANDIDATE },
          ]);
          const origin = yield* serveCandidateRegistry(packages);
          return yield* Effect.promise(async () => {
            const packument = await (await fetch(`${origin}/@composio%2frelease-fixture`)).json();
            const dist = packument.versions[CANDIDATE].dist;
            return {
              packument,
              tarballUrl: dist.tarball as string,
              tarball: new Uint8Array(await (await fetch(dist.tarball)).arrayBuffer()),
              proxied: await (await fetch(`${origin}/left-pad`)).json(),
              published: (
                await fetch(`${origin}/@composio/release-fixture/-/release-fixture-1.0.0.tgz`)
              ).status,
              origin,
            };
          });
        })
      ),
      fetcher
    );
    expect(responses.packument['dist-tags']).toEqual({ latest: CANDIDATE });
    expect(Object.keys(responses.packument.versions)).toEqual([CANDIDATE]);
    expect(responses.packument.versions[CANDIDATE]).toMatchObject({
      name: PLANNED,
      version: CANDIDATE,
      dist: { integrity: sha512(candidate.bytes) },
    });
    expect(responses.tarballUrl.startsWith(responses.origin)).toBe(true);
    expect(responses.tarball).toEqual(candidate.bytes);
    expect(responses.proxied).toEqual(leftPad);
    // A planned package never falls through to the public registry, not even an older version.
    expect(responses.published).toBe(404);
    expect(upstream.requests).toEqual([]);
  });

  test('a candidate whose bytes differ from its manifest is refused before anything is installed', async () => {
    const candidate = await candidateDirectory();
    await Bun.write(`${candidate.directory}/${candidate.file}`, 'tampered');
    const docs = await directories.create();
    const manifest = JSON.stringify({ dependencies: { [PLANNED]: '1.0.0' } });
    await writeText(`${docs}/package.json`, manifest);
    const bin = await directories.create();
    await writeText(`${bin}/bun`, `#!/bin/sh\necho "$@" >> ${bin}/bun.log\n`);
    await makeExecutable(`${bin}/bun`);
    const previous = process.env.PATH;
    try {
      process.env.PATH = `${bin}:${previous}`;
      await expect(
        runRelease(installCandidateDocs(docs, typescriptBatch, candidate.directory))
      ).rejects.toThrow(`Candidate checksum mismatch: ${candidate.file}`);
    } finally {
      process.env.PATH = previous;
    }
    expect(await Bun.file(`${bin}/bun.log`).exists()).toBe(false);
    expect(await readText(`${docs}/package.json`)).toBe(manifest);
  });
});

describe('docs install against the candidate', () => {
  test('every copy of a planned package, nested ones included, resolves to the candidate version', async () => {
    const candidate = await candidateDirectory();
    const published = await directories.create();
    const tarball = async (name: string, version: string, extra: Record<string, unknown> = {}) => {
      const manifest = { name, version, ...extra };
      const file = `${name.split('/').at(-1)}-${version}.tgz`;
      return [
        `/${name}/-/${file}`,
        { manifest, bytes: await pack(published, file.replace('/', '-'), manifest) },
      ] as const;
    };
    const tarballs = Object.fromEntries([
      await tarball(PLANNED, '1.0.0'),
      await tarball(PLANNED, '0.9.0'),
      // Pins an older planned version, so the hoisted install nests its own copy.
      await tarball('consumer-fixture', '1.0.0', { dependencies: { [PLANNED]: '0.9.0' } }),
    ]);
    let origin = '';
    const upstream = fakeUpstream(tarballs, () => origin);
    const docs = await directories.create();
    await writeText(
      `${docs}/package.json`,
      JSON.stringify({
        name: 'docs-fixture',
        private: true,
        dependencies: { [PLANNED]: '1.0.0', 'consumer-fixture': '1.0.0' },
      })
    );

    // The committed lock pins the published versions, as the docs lock does before release.
    const cache = await directories.create();
    await runRelease(
      Effect.scoped(
        Effect.gen(function* () {
          origin = yield* serveCandidateRegistry([]);
          yield* run('bun', ['install'], {
            cwd: docs,
            env: {
              ...withoutReleaseTokens,
              NPM_CONFIG_REGISTRY: origin,
              BUN_INSTALL_CACHE_DIR: cache,
            },
          });
        })
      ),
      upstream.fetcher
    );
    const nested = `${docs}/node_modules/consumer-fixture/node_modules/${PLANNED}/package.json`;
    expect((await Bun.file(nested).json()).version).toBe('0.9.0');
    const committedLock = await readText(`${docs}/bun.lock`);

    upstream.requests.length = 0;
    await runRelease(
      installCandidateDocs(docs, typescriptBatch, candidate.directory),
      upstream.fetcher
    );

    expect((await Bun.file(`${docs}/node_modules/${PLANNED}/package.json`).json()).version).toBe(
      CANDIDATE
    );
    expect(await Bun.file(nested).exists()).toBe(false);
    expect(await readText(`${docs}/bun.lock`)).not.toBe(committedLock);
    expect(upstream.requests.filter(path => decodeURIComponent(path).includes(PLANNED))).toEqual(
      []
    );
    await runRelease(
      assertCandidateVersions(
        `${docs}/node_modules`,
        [{ name: PLANNED, newVersion: CANDIDATE }],
        [PLANNED]
      )
    );
  });

  test('the version check names every installed copy that kept another version', async () => {
    const nodeModules = `${await directories.create()}/node_modules`;
    const at = (directory: string, version: string) =>
      writeText(`${directory}/package.json`, JSON.stringify({ name: PLANNED, version }));
    await at(`${nodeModules}/${PLANNED}`, CANDIDATE);
    await at(`${nodeModules}/consumer-fixture/node_modules/${PLANNED}`, '1.0.0');
    await writeText(`${nodeModules}/consumer-fixture/package.json`, '{"version":"1.0.0"}');
    const releases = [{ name: PLANNED, newVersion: CANDIDATE }];

    await expect(
      runRelease(assertCandidateVersions(nodeModules, releases, [PLANNED]))
    ).rejects.toThrow(`consumer-fixture/node_modules/${PLANNED} is 1.0.0`);

    await at(`${nodeModules}/consumer-fixture/node_modules/${PLANNED}`, CANDIDATE);
    await runRelease(assertCandidateVersions(nodeModules, releases, [PLANNED]));
    await expect(
      runRelease(assertCandidateVersions(await directories.create(), releases, [PLANNED]))
    ).rejects.toThrow(`${PLANNED} is not installed`);
  });

  test('a Python-only stable plan installs the committed docs lock from npm unchanged', async () => {
    const docs = await directories.create();
    const manifest = JSON.stringify({ dependencies: { '@composio/core': '0.29.0' } });
    await writeText(`${docs}/package.json`, manifest);
    const bin = await directories.create();
    await writeText(
      `${bin}/bun`,
      `#!/bin/sh\necho "$PWD|$*|registry=$NPM_CONFIG_REGISTRY" >> ${bin}/bun.log\n`
    );
    await makeExecutable(`${bin}/bun`);
    const python: ReleaseBatch = {
      ...batch,
      plan: {
        ...batch.plan,
        choices: { ...batch.plan.choices, typescript: 'skip', python: 'auto' },
        releases: [
          {
            name: '@composio/python-sdk',
            type: 'minor',
            oldVersion: '0.31.0',
            newVersion: '0.32.0',
            changesets: [],
            language: 'python',
          },
        ],
      },
    };
    const previous = process.env.PATH;
    try {
      process.env.PATH = `${bin}:${previous}`;
      await runRelease(installCandidateDocs(docs, python, `${docs}/no-candidate`));
    } finally {
      process.env.PATH = previous;
    }
    const realDocs = (await exec(docs, 'pwd', ['-P'])).trim();
    expect((await readText(`${bin}/bun.log`)).trim()).toBe(
      `${realDocs}|install --frozen-lockfile|registry=`
    );
    expect(await readText(`${docs}/package.json`)).toBe(manifest);
  });
});

describe('docs workflows', () => {
  const workflow = async (name: string) =>
    Bun.YAML.parse(await readText(`.github/workflows/${name}`)) as {
      jobs: Record<string, Record<string, unknown>>;
    };
  /** Reads the only condition shape these jobs use: a negated head-branch prefix. */
  const headCondition = (condition: unknown) => {
    const match = /^\$\{\{ !startsWith\(github\.head_ref, '([^']+)'\) \}\}$/.exec(
      String(condition)
    );
    expect(match).not.toBeNull();
    return (head: string) => !head.startsWith(match?.[1] ?? '');
  };

  test.each([
    ['docs-typescript-check.yml', 'typescript-check'],
    ['docs-tests.yml', 'test'],
  ])('%s skips release PR heads, which pin versions npm does not serve yet', async (file, job) => {
    const runsOn = headCondition((await workflow(file)).jobs[job].if);
    expect(runsOn('sdk-release/batch-42589989280')).toBe(false);
    expect(runsOn('feat/docs-change')).toBe(true);
    expect(runsOn('sdk-release-notes')).toBe(true);
  });

  test('the candidate docs job runs on stable release PRs only, with no credentials', async () => {
    const { jobs } = await workflow('sdk.release.candidates.yml');
    const docs = jobs.docs;
    expect(docs.name).toBe('SDK candidate docs');
    expect(docs.needs).toEqual(['select-candidates', 'candidate']);
    expect(docs.if).toBe(
      "${{ !cancelled() && needs.select-candidates.outputs.channel == 'stable' }}"
    );
    expect(docs.permissions).toEqual({ contents: 'read' });
    expect(docs['timeout-minutes']).toBeGreaterThan(0);
    expect(JSON.stringify(docs)).not.toContain('secrets.');
  });
});
