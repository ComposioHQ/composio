import { describe, expect, test } from 'bun:test';
import { Effect, Layer, Option } from 'effect';
import { Digest } from 'effect/crypto';
import { Base64 } from 'effect/encoding';
import semver from 'semver';
import { readReleasePull } from '../scripts/sdk-release/approval';
import {
  authorizeSourceTag,
  executeReleaseRequest,
  openReleasePull,
} from '../scripts/sdk-release/batch';
import { NpmCli, publishNpm, type Distribution } from '../scripts/sdk-release/registry';
import { stageOutcome } from '../scripts/sdk-release/report';
import { sha256Hex } from '../scripts/sdk-release/runtime';
import type { ReleaseBatch } from '../scripts/sdk-release/source';
import { STAGES, type ReleaseState, type StateName } from '../scripts/sdk-release/state';
import {
  base,
  batch,
  betaBatch,
  betaFiles,
  fakeController,
  head,
  releaseFiles,
} from './sdk-release-controller-fixture';
import { resolvePath, runRelease, type Fetch } from './sdk-release-harness';

const NPM = 'https://registry.npmjs.org';

/**
 * A fake npm registry with its dist-tags, and the npm CLI that writes to it. Uploads record SLSA
 * provenance the way trusted publishing does, from `ref` (the release tag unless a test forges
 * another one).
 */
function npmRegistry(
  tags: Record<string, string>,
  options: { ref?: string; otherBytes?: boolean } = {}
) {
  const versions = new Map<string, Uint8Array>();
  const commands: string[] = [];
  const pending = new Map<string, Distribution>();
  const sha512 = (bytes: Uint8Array) =>
    runRelease(
      Effect.gen(function* () {
        return yield* (yield* Digest.Digest).digestHex(Digest.sha512, bytes);
      })
    );
  const provenance = new Map<string, string>();
  const cli = Layer.succeed(NpmCli, {
    run: (args: ReadonlyArray<string>) =>
      Effect.promise(async () => {
        commands.push(args.join(' '));
        const [command, target] = args;
        if (command === 'publish') {
          const file = [...pending.values()].find(candidate => target.endsWith(candidate.file));
          if (!file) throw new Error(`Unexpected upload ${target}`);
          versions.set(file.version, file.bytes);
          const releaseOnly = args.find(arg => arg.startsWith('--tag='))!.slice('--tag='.length);
          tags[releaseOnly] = file.version;
          const statement = {
            subject: [
              {
                digest: {
                  sha512: await sha512(options.otherBytes ? new Uint8Array([1]) : file.bytes),
                },
              },
            ],
            predicate: {
              buildDefinition: {
                externalParameters: {
                  workflow: {
                    ref:
                      options.ref ??
                      `refs/tags/sdk-release/${releaseOnly.slice('sdk-release-'.length)}`,
                    repository: 'https://github.com/ComposioHQ/composio',
                    path: '.github/workflows/sdk.release.yml',
                  },
                },
              },
            },
          };
          provenance.set(file.version, Base64.encode(JSON.stringify(statement)));
        }
        if (command === 'dist-tag' && target === 'add') tags[args[3]] = args[2].split('@').at(-1)!;
        if (command === 'dist-tag' && target === 'rm') delete tags[args[3]];
        return '';
      }),
  });
  const fetcher: Fetch = async input => {
    const url = String(input);
    const respond = (data: unknown) => new Response(JSON.stringify(data));
    const notFound = new Response('{}', { status: 404 });
    if (url === `${NPM}/-/package/%40composio%2Fcore/dist-tags`) return respond(tags);
    const attestation = /\/-\/npm\/v1\/attestations\/%40composio%2Fcore@(.+)$/.exec(url);
    if (attestation)
      return provenance.has(attestation[1])
        ? respond({
            attestations: [
              {
                predicateType: 'https://slsa.dev/provenance/v1',
                bundle: { dsseEnvelope: { payload: provenance.get(attestation[1]) } },
              },
            ],
          })
        : notFound;
    const tarball = /\/@composio\/core\/-\/core-(.+)\.tgz$/.exec(url);
    if (tarball) return new Response((versions.get(tarball[1]) ?? new Uint8Array()).slice());
    const document = /^https:\/\/registry\.npmjs\.org\/%40composio%2Fcore\/(.+)$/.exec(url);
    if (document && semver.valid(document[1]))
      return versions.has(document[1])
        ? respond({
            name: '@composio/core',
            version: document[1],
            dist: { tarball: `${NPM}/@composio/core/-/core-${document[1]}.tgz` },
          })
        : notFound;
    if (document) return document[1] in tags ? respond({ version: tags[document[1]] }) : notFound;
    throw new Error(`Unexpected registry request: ${url}`);
  };
  const stage = (file: Distribution) => pending.set(file.file, file);
  return { cli, fetcher, commands, tags, stage };
}

const tarballOf = async (release: ReleaseBatch): Promise<Distribution> => {
  const version = release.plan.releases[0].newVersion;
  const bytes = new TextEncoder().encode(`reviewed tarball ${version}`);
  return {
    language: 'typescript',
    name: '@composio/core',
    version,
    file: `composio-core-${version}.tgz`,
    bytes,
    sha256: await runRelease(sha256Hex(bytes)),
  };
};

/** One release through every stage, with the production handlers and fakes at the edges. */
async function rehearse(release: ReleaseBatch, tags: Record<string, string>) {
  const beta = release.plan.choices.channel === 'beta';
  const github = fakeController({ beta });
  const ended: ReleaseState[] = [];
  const cwd = await resolvePath('.');

  // 1. request: an active member's request plans the batch.
  const planned = await runRelease(
    executeReleaseRequest(
      Effect.succeed({
        channel: release.plan.choices.channel,
        typescript: 'auto',
        python: 'skip',
      }),
      {
        actor: 'requester',
        runId: release.id,
        sourceSha: base,
        issueNumber: release.issue,
        appSlug: 'sdk-release-app',
      },
      () => Effect.succeed(release.plan)
    ),
    github.fetcher
  );
  expect(planned.outcome).toMatchObject({
    _tag: 'Planned',
    batch: { id: release.id, plan: release.plan },
  });
  ended.push(
    await runRelease(
      openReleasePull(cwd, release, { files: beta ? betaFiles : releaseFiles }),
      github.fetcher
    )
  );

  // 2. review: the merged, approved release PR is tagged.
  ended.push(
    await runRelease(
      Effect.flatMap(readReleasePull(9), ({ pull, batch: committed }) =>
        authorizeSourceTag(pull, committed, 'sdk-release-app')
      ),
      github.fetcher
    )
  );
  expect(github.writes.at(-1)).toEqual({
    method: 'POST',
    path: '/git/refs',
    body: { ref: 'refs/tags/sdk-release/8', sha: head },
  });

  // 3. publish: the reviewed tarball reaches npm, and a re-run uploads nothing.
  const registry = npmRegistry(tags);
  const tarball = await tarballOf(release);
  registry.stage(tarball);
  const publish = publishNpm(cwd, release, [tarball]).pipe(Effect.provide(registry.cli));
  await runRelease(publish, registry.fetcher);
  const firstRun = [...registry.commands];
  await runRelease(publish, registry.fetcher);
  ended.push(
    await runRelease(
      stageOutcome(
        'publish',
        { candidates: 'success', 'publish-npm': 'success' },
        Option.none(),
        Effect.succeed({ _tag: 'Published', versions: [] } as ReleaseState),
        '77'
      )
    )
  );
  return { ended, firstRun, registry, tarball };
}

describe('release rehearsal', () => {
  test('a stable release goes from request to npm latest, and a re-run changes nothing', async () => {
    const { ended, firstRun, registry } = await rehearse(batch, { latest: '1.0.0' });
    expect(ended.map(state => state._tag)).toEqual(['InReview', 'Tagged', 'Published']);
    expect(firstRun).toEqual([
      `publish ${await resolvePath('sdk-publication/typescript/composio-core-1.0.1.tgz')} --ignore-scripts --provenance --access=public --tag=sdk-release-8`,
      'dist-tag add @composio/core@1.0.1 latest',
      'dist-tag rm @composio/core sdk-release-8',
    ]);
    expect(registry.commands).toEqual(firstRun);
    expect(registry.tags).toEqual({ latest: '1.0.1' });
  });

  test('a beta reaches npm next and never reads or moves latest', async () => {
    const { ended, registry } = await rehearse(betaBatch, {
      latest: '1.0.0',
      next: '0.1.36-next.13',
    });
    expect(ended.map(state => state._tag)).toEqual(['InReview', 'Tagged', 'Published']);
    expect(registry.tags).toEqual({ latest: '1.0.0', next: '1.0.1-beta.8' });
    expect(registry.commands.some(command => command.includes('latest'))).toBe(false);
  });

  test('provenance from another ref fails the publication before latest moves', async () => {
    const registry = npmRegistry({ latest: '1.0.0' }, { ref: 'refs/heads/next' });
    const tarball = await tarballOf(batch);
    registry.stage(tarball);
    await expect(
      runRelease(
        publishNpm(await resolvePath('.'), batch, [tarball]).pipe(Effect.provide(registry.cli)),
        registry.fetcher
      )
    ).rejects.toThrow('was built by https://github.com/ComposioHQ/composio');
    expect(registry.tags.latest).toBe('1.0.0');
    expect(registry.commands.some(command => command.startsWith('dist-tag'))).toBe(false);
  });

  test('provenance that describes other bytes fails the publication', async () => {
    const registry = npmRegistry({ latest: '1.0.0' }, { otherBytes: true });
    const tarball = await tarballOf(batch);
    registry.stage(tarball);
    await expect(
      runRelease(
        publishNpm(await resolvePath('.'), batch, [tarball]).pipe(Effect.provide(registry.cli)),
        registry.fetcher
      )
    ).rejects.toThrow('provenance describes other bytes than the reviewed tarball');
  });

  test('every state a stage can end in is reached by a production handler', async () => {
    const reached = new Set<StateName>();
    for (const { ended } of [
      await rehearse(batch, { latest: '1.0.0' }),
      await rehearse(betaBatch, { next: '0.1.36-next.13' }),
    ])
      for (const state of ended) reached.add(state._tag);
    const review = async (options: Parameters<typeof fakeController>[0]) => {
      const { fetcher } = fakeController(options);
      return runRelease(
        Effect.flatMap(readReleasePull(9), ({ pull, batch: committed }) =>
          authorizeSourceTag(pull, committed, 'sdk-release-app')
        ),
        fetcher
      );
    };
    reached.add((await review({ closedUnmerged: true }))._tag);
    reached.add((await review({ reviewer: 'requester' }))._tag);
    const request = async (
      options: Parameters<typeof fakeController>[0],
      sourceSha: string,
      parse: Effect.Effect<never, string> | undefined,
      releases = batch.plan
    ) => {
      const { fetcher } = fakeController(options);
      return runRelease(
        Effect.map(
          executeReleaseRequest(
            parse ?? Effect.succeed({ channel: 'stable', typescript: 'auto', python: 'skip' }),
            {
              actor: 'requester',
              runId: '8',
              sourceSha,
              issueNumber: 8,
              appSlug: 'sdk-release-app',
            },
            () => Effect.succeed(releases)
          ),
          result => result.outcome
        ),
        fetcher
      );
    };
    reached.add((await request({}, base, Effect.fail('Use the form')))._tag as StateName);
    reached.add(
      (await request({ openRelease: 'sdk-release/batch-7' }, base, undefined))._tag as StateName
    );
    reached.add((await request({}, head, undefined))._tag as StateName);
    reached.add(
      (await request({}, base, undefined, { ...batch.plan, releases: [] }))._tag as StateName
    );
    reached.add(
      (
        await runRelease(
          stageOutcome('request', { plan: 'cancelled' }, Option.none(), Effect.never, '77')
        )
      )._tag
    );
    const ends = new Set<StateName>([
      ...Object.values(STAGES).flatMap(stage => stage.to as ReadonlyArray<StateName>),
      'Failed',
    ]);
    expect([...reached].toSorted()).toEqual([...ends].toSorted());
  });
});
