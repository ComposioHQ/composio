import { describe, expect, test } from 'bun:test';
import { Effect, Option } from 'effect';
import { executeReleaseRequest, openReleasePull } from '../scripts/sdk-release/batch';
import { BATCH_PATH, validateReleaseDiff, type ReleaseFile } from '../scripts/sdk-release/source';
import {
  base,
  batch,
  betaBatch,
  betaFiles,
  fakeController,
  newManifest,
  oldManifest,
  releaseFiles,
} from './sdk-release-controller-fixture';
import { resolvePath, runRelease } from './sdk-release-harness';

const validate = (
  files: ReadonlyArray<ReleaseFile>,
  plan: Parameters<typeof validateReleaseDiff>[1],
  outputs: ReadonlyArray<string>
) => runRelease(validateReleaseDiff(files, plan, outputs));

describe('release-only diff validation', () => {
  test('source edits and lock dependency changes fail release-only validation', async () => {
    const plan = { releases: [], changesets: [], retainedChangesets: [] };
    await expect(
      validate([{ path: 'ts/packages/core/src/index.ts', before: 'x', after: 'y' }], plan, [])
    ).rejects.toThrow('Not a planned release output');
    await expect(
      validate([{ path: 'pnpm-lock.yaml', before: 'dep: 1', after: 'dep: 2' }], plan, [])
    ).rejects.toThrow('Release changes dependency resolution');
    await validate(
      [{ path: 'docs/content/changelog/release.mdx', before: 'x', after: 'edited narrative' }],
      plan,
      ['docs/content/changelog/release.mdx']
    );
  });
});

describe('release PR', () => {
  const open = async (
    fetcher: ReturnType<typeof fakeController>['fetcher'],
    files = releaseFiles
  ) => runRelease(openReleasePull(await resolvePath('.'), batch, { files }), fetcher);
  const writePaths = (writes: ReadonlyArray<{ method: string; path: string }>) =>
    writes.map(write => `${write.method} ${write.path}`);

  test('a release-only patch is committed on the frozen source and opened as one PR', async () => {
    const { fetcher, writes } = fakeController();
    expect(await open(fetcher)).toEqual({
      _tag: 'InReview',
      pull: 'https://github.com/ComposioHQ/composio/pull/9',
    });
    expect(writePaths(writes)).toEqual([
      'POST /git/blobs',
      'POST /git/blobs',
      'POST /git/blobs',
      'POST /git/trees',
      'POST /git/commits',
      'POST /git/refs',
      'POST /pulls',
    ]);
    expect(writes.find(write => write.path === '/git/commits')?.body).toMatchObject({
      parents: [base],
    });
  });

  test('a re-run whose branch already exists moves that branch instead of creating it', async () => {
    const { fetcher, writes } = fakeController({ existingBranch: true });
    await open(fetcher);
    expect(writes.find(write => write.path.startsWith('/git/refs'))).toEqual({
      method: 'PATCH',
      path: '/git/refs/heads/sdk-release/batch-8',
      body: { sha: 'e'.repeat(40), force: true },
    });
  });

  test('a prepared plan that differs from the planned batch is refused before any write', async () => {
    const { fetcher, writes } = fakeController();
    const edited = releaseFiles.map(file =>
      file.path === BATCH_PATH
        ? { ...file, after: JSON.stringify({ ...batch, requestedBy: 'someone-else' }) }
        : file
    );
    await expect(open(fetcher, edited)).rejects.toThrow('Prepared release plan differs');
    expect(writes).toEqual([]);
  });

  test('a patch that touches source outside the release outputs is refused before any write', async () => {
    const { fetcher, writes } = fakeController();
    const widened = [
      ...releaseFiles,
      { path: 'ts/packages/core/src/backdoor.ts', before: null, after: 'export {};' },
    ];
    await expect(open(fetcher, widened)).rejects.toThrow('Not a planned release output');
    expect(writes).toEqual([]);
  });

  test('a re-run of a dispatched request finds its issue in its own release PR', async () => {
    const { fetcher } = fakeController({ openRelease: 'sdk-release/batch-8' });
    const result = await runRelease(
      executeReleaseRequest(
        Effect.succeed({ channel: 'stable', typescript: 'auto', python: 'skip' }),
        { actor: 'requester', runId: '8', sourceSha: base, appSlug: 'sdk-release-app' },
        () => Effect.die('must not plan')
      ),
      fetcher
    );
    expect(result).toEqual({
      outcome: { _tag: 'InReview', pull: 'https://github.com/ComposioHQ/composio/pull/5' },
      issue: Option.some(8),
    });
  });

  test('a release that merged and failed its gate since planning blocks this one', async () => {
    const { fetcher, writes } = fakeController({ untaggedNext: true });
    expect(await open(fetcher)).toEqual({ _tag: 'Blocked', release: '8' });
    expect(writes).toEqual([]);
  });

  test('another open release PR opens nothing and the request waits for it', async () => {
    const { fetcher, writes } = fakeController({ openRelease: 'sdk-release/batch-7' });
    expect(await open(fetcher)).toEqual({
      _tag: 'Waiting',
      pull: 'https://github.com/ComposioHQ/composio/pull/5',
    });
    expect(writes).toEqual([]);
  });

  test('a re-run after this request opened its release PR resumes that PR', async () => {
    const { fetcher, writes } = fakeController({ openRelease: 'sdk-release/batch-8' });
    expect(await open(fetcher)).toEqual({
      _tag: 'InReview',
      pull: 'https://github.com/ComposioHQ/composio/pull/5',
    });
    expect(writes).toEqual([]);
  });

  test('a beta release PR commits only its plan, so next keeps its versions and changesets', async () => {
    const { fetcher, writes } = fakeController({ beta: true });
    const state = await runRelease(
      openReleasePull(await resolvePath('.'), betaBatch, { files: betaFiles }),
      fetcher
    );
    expect(state).toEqual({
      _tag: 'InReview',
      pull: 'https://github.com/ComposioHQ/composio/pull/9',
    });
    expect(writePaths(writes)).toEqual([
      'POST /git/blobs',
      'POST /git/trees',
      'POST /git/commits',
      'POST /git/refs',
      'POST /pulls',
    ]);
    const opened = writes.find(write => write.path === '/pulls')?.body as {
      readonly title: string;
      readonly body: string;
    };
    expect(opened.title).toBe('chore(release): publish SDK beta packages');
    expect(opened.body).toContain('never touches `latest`');
    expect(opened.body).toContain('A beta opens no docs PR');
  });

  test('a beta release PR that also writes a changelog is refused before any write', async () => {
    const { fetcher, writes } = fakeController({ beta: true });
    const changelog = { path: 'ts/packages/core/CHANGELOG.md', before: null, after: '## beta' };
    await expect(
      runRelease(
        openReleasePull(await resolvePath('.'), betaBatch, { files: [...betaFiles, changelog] }),
        fetcher
      )
    ).rejects.toThrow('A beta release PR changes only .github/sdk-release-plan.json');
    expect(writes).toEqual([]);
  });

  test('major targets allow normal Changesets peer-range updates without changing unrelated fields', async () => {
    const plan = {
      ...batch.plan,
      releases: [
        { ...batch.plan.releases[0], newVersion: '2.0.0', type: 'major' as const },
        {
          ...batch.plan.releases[0],
          name: '@composio/provider',
          oldVersion: '0.1.0',
          newVersion: '0.1.1',
        },
      ],
    };
    const provider = {
      name: '@composio/provider',
      version: '0.1.0',
      peerDependencies: { '@composio/core': '>=1.0.0 <2.0.0 || >=2.0.0-beta.0 <2.0.0' },
    };
    await validate(
      [
        {
          path: 'ts/packages/core/package.json',
          before: oldManifest,
          after: newManifest.replace('1.0.1', '2.0.0'),
        },
        {
          path: 'ts/packages/providers/provider/package.json',
          before: JSON.stringify(provider),
          after: JSON.stringify({
            ...provider,
            version: '0.1.1',
            peerDependencies: { '@composio/core': '>=2.0.0' },
          }),
        },
      ],
      plan,
      []
    );
  });
  test('coincident client versions and Python dependency literals cannot masquerade as SDK metadata', async () => {
    await expect(
      validate(
        [
          {
            path: 'ts/packages/core/package.json',
            before: oldManifest,
            after: newManifest.replace('"client":"1.0.0"', '"client":"1.0.1"'),
          },
        ],
        batch.plan,
        []
      )
    ).rejects.toThrow('Unplanned dependency');
  });
});
