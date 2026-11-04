import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Effect, FileSystem, Option } from 'effect';
import { Base64 } from 'effect/encoding';
import {
  mayRebuildMissingCandidate,
  normalizeArtifactDigest,
  reuseCandidate,
  verifyArchive,
  verifyCandidateFiles,
} from '../scripts/sdk-release/artifacts';
import {
  authorizeSourceTag,
  commitPreparedRelease,
  mergeApprovedRelease,
} from '../scripts/sdk-release/batch';
import { run, sha256Hex } from '../scripts/sdk-release/runtime';
import {
  BATCH_PATH,
  eligibleApproval,
  validateReleaseDiff,
  type ReleaseBatch,
  type ReleaseFile,
} from '../scripts/sdk-release/source';
import { readExactCandidateTarballs } from '../ts/scripts/check-provider-compatibility';
import { missingReleaseNotes } from '../ts/scripts/validate-changesets.mjs';
import { runRelease, temporaryDirectories, writeText, type Fetch } from './sdk-release-harness';

const directories = temporaryDirectories('sdk-release-batch-');
afterAll(() => directories.cleanup());
const readBytes = (file: string) =>
  runRelease(
    Effect.gen(function* () {
      return yield* (yield* FileSystem.FileSystem).readFile(file);
    })
  );
const validate = (
  files: ReadonlyArray<ReleaseFile>,
  plan: Parameters<typeof validateReleaseDiff>[1],
  outputs: ReadonlyArray<string>
) => runRelease(validateReleaseDiff(files, plan, outputs));

const base = 'a'.repeat(40);
const head = 'b'.repeat(40);
const merge = 'c'.repeat(40);

describe('approved release source', () => {
  test('requires a current-head review from a writer who is neither author nor requester', () => {
    const excluded = ['author', 'requester'];
    const review = { user: 'reviewer', state: 'APPROVED', commitId: head, permission: 'write' };
    expect(eligibleApproval([review], excluded, head)).toBe(true);
    expect(
      eligibleApproval(
        [review, { ...review, user: 'observer', state: 'CHANGES_REQUESTED', permission: 'read' }],
        excluded,
        head
      )
    ).toBe(true);
    expect(eligibleApproval([{ ...review, commitId: base }], excluded, head)).toBe(false);
    expect(eligibleApproval([{ ...review, permission: 'read' }], excluded, head)).toBe(false);
    expect(eligibleApproval([{ ...review, user: 'author' }], excluded, head)).toBe(false);
    expect(eligibleApproval([{ ...review, user: 'requester' }], excluded, head)).toBe(false);
    expect(
      eligibleApproval([review, { ...review, state: 'CHANGES_REQUESTED' }], excluded, head)
    ).toBe(false);
  });
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

const files = [{ name: 'package.tgz', sha256: 'a'.repeat(64), size: 4 }];
const artifact = {
  id: 42,
  name: 'sdk-candidate-typescript',
  digest: `sha256:${'b'.repeat(64)}`,
  expired: false,
  expires_at: '2026-12-01T00:00:00Z',
  workflow_run: { id: 8, head_sha: head },
  created_at: '2026-11-01T00:00:00Z',
};
describe('immutable candidates', () => {
  test('native upload and REST digests normalize without accepting malformed hashes', async () => {
    const raw = 'a'.repeat(64);
    expect(await runRelease(normalizeArtifactDigest(raw))).toBe(`sha256:${raw}`);
    expect(await runRelease(normalizeArtifactDigest(`sha256:${raw}`))).toBe(`sha256:${raw}`);
    await expect(runRelease(normalizeArtifactDigest(`sha256:${raw.slice(1)}`))).rejects.toThrow();
    await expect(runRelease(normalizeArtifactDigest(`md5:${raw}`))).rejects.toThrow();
  });
  test('reuses IDs only from the original source and producer', async () => {
    const reused = await runRelease(
      reuseCandidate([artifact], artifact.name, 8, head, Date.parse('2026-11-03'))
    );
    expect(Option.getOrUndefined(reused)?.id).toBe(42);
    await expect(runRelease(reuseCandidate([artifact], artifact.name, 9, head))).rejects.toThrow(
      'Candidate source or producer does not match'
    );
    await expect(runRelease(reuseCandidate([artifact], artifact.name, 8, base))).rejects.toThrow(
      'Candidate source or producer does not match'
    );
    await expect(
      runRelease(reuseCandidate([{ ...artifact, expired: true }], artifact.name, 8, head))
    ).rejects.toThrow('Original candidate unavailable');
  });
  test('archive digest and every file checksum fail closed', async () => {
    await expect(runRelease(verifyArchive(new Uint8Array([1]), artifact.digest))).rejects.toThrow(
      'Actions artifact archive digest mismatch'
    );
    await expect(
      runRelease(
        verifyCandidateFiles(new Map([['package.tgz', new Uint8Array([1, 2, 3, 4])]]), files)
      )
    ).rejects.toThrow('Candidate checksum mismatch: package.tgz');
  });
});

const batch: ReleaseBatch = {
  schemaVersion: 1,
  id: '8',
  originalRunId: '8',
  requestedBy: ['requester'],
  inputBase: base,
  statusUrl: 'https://github.com/ComposioHQ/composio/issues/8',
  date: '2026-11-03',
  outputs: ['docs/content/changelog/release.mdx'],
  plan: {
    schemaVersion: 1,
    inputFingerprint: 'frozen',
    choices: { typescript: 'auto', python: 'skip' },
    recommended: [],
    changesets: [],
    retainedChangesets: [],
    releases: [
      {
        name: '@composio/core',
        oldVersion: '1.0.0',
        newVersion: '1.0.1',
        type: 'patch',
        changesets: [],
        language: 'typescript',
      },
    ],
  },
};
const oldManifest = JSON.stringify({
  name: '@composio/core',
  version: '1.0.0',
  dependencies: { client: '1.0.0' },
});
const newManifest = JSON.stringify({
  name: '@composio/core',
  version: '1.0.1',
  dependencies: { client: '1.0.0' },
});
const releaseFiles = [
  { path: BATCH_PATH, before: null, after: JSON.stringify(batch) },
  { path: 'ts/packages/core/package.json', before: oldManifest, after: newManifest },
  { path: batch.outputs[0], before: null, after: 'Human-edited release narrative' },
];

/** A real zip of the authorized plan, so downloads exercise the archive digest and unzip checks. */
const authorizedArchive: { bytes: Uint8Array<ArrayBuffer>; digest: string } = {
  bytes: new Uint8Array(),
  digest: '',
};
beforeAll(async () => {
  const directory = await directories.create();
  await writeText(`${directory}/sdk-release-batch.json`, JSON.stringify(batch));
  const zip = `${directory}/authorized.zip`;
  await runRelease(run('zip', ['-j', '-q', zip, `${directory}/sdk-release-batch.json`]));
  authorizedArchive.bytes = new Uint8Array(await readBytes(zip));
  authorizedArchive.digest = `sha256:${await runRelease(sha256Hex(authorizedArchive.bytes))}`;
});

function fakeController(
  options: {
    oldReview?: boolean;
    reviewer?: string;
    mergeKind?: 'squash' | 'merge';
    editedPlan?: boolean;
    existingTag?: string;
    failedCandidate?: boolean;
    pendingMerge?: boolean;
    existingBranch?: boolean;
    docs?: 'success' | 'failure' | 'pending' | 'missing';
  } = {}
) {
  const writes: { path: string; body: unknown }[] = [];
  let merged = !options.pendingMerge;
  const files = releaseFiles.map((file, index) => ({
    filename: file.path,
    status: file.before === null ? 'added' : 'modified',
    sha: String(index + 1).repeat(40),
  }));
  const pull = () => ({
    number: 9,
    html_url: 'https://github.com/ComposioHQ/composio/pull/9',
    body: '<!-- sdk-release-batch -->',
    state: 'open',
    merged,
    merge_commit_sha: merged ? merge : null,
    user: { login: 'release-bot' },
    head: { sha: head, ref: 'sdk-release/batch-8', repo: { full_name: 'ComposioHQ/composio' } },
    base: { ref: 'next' },
  });
  const fetcher: Fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === 'artifacts.test') return new Response(authorizedArchive.bytes);
    const path = url.pathname.replace('/repos/ComposioHQ/composio', '') + url.search;
    const method = init?.method ?? 'GET';
    const response = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status });
    if (method !== 'GET') {
      writes.push({ path, body: JSON.parse(String(init?.body)) });
      if (path === '/pulls/9/merge') {
        merged = true;
        return response({ merged: true, sha: merge });
      }
      if (path === '/git/refs') return response({ ref: 'refs/tags/sdk-release/8' });
      if (path === '/pulls') return response(pull());
      throw new Error(`Unexpected write ${path}`);
    }
    if (path.includes('/deployment-branch-policies'))
      return response({
        total_count: 1,
        branch_policies: [{ name: 'sdk-release/*', type: 'tag' }],
      });
    if (path.startsWith('/environments/'))
      return response({
        protection_rules: [{ type: 'branch_policy' }],
        deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
      });
    if (path.startsWith('/rulesets?'))
      return response([{ id: 1, target: 'tag', enforcement: 'active' }]);
    if (path === '/rulesets/1')
      return response({
        conditions: { ref_name: { include: ['refs/tags/sdk-release/*'], exclude: [] } },
        bypass_actors: [{ actor_type: 'Integration', actor_id: 123, bypass_mode: 'always' }],
        rules: ['creation', 'update', 'deletion'].map(type => ({ type })),
      });
    if (path.startsWith('/pulls?')) return response([]);
    if (path.startsWith('/actions/workflows/sdk.release.yml/runs'))
      return response({ total_count: 0, workflow_runs: [] });
    if (path === '/pulls/9') return response(pull());
    if (path.startsWith('/pulls/9/reviews'))
      return response([
        {
          user: { login: options.reviewer ?? 'reviewer' },
          state: 'APPROVED',
          commit_id: options.oldReview ? base : head,
        },
      ]);
    if (path === `/collaborators/${options.reviewer ?? 'reviewer'}/permission`)
      return response({ permission: 'write' });
    if (path.startsWith(`/commits/${head}/check-runs`))
      return response({
        total_count: options.docs === 'missing' ? 1 : 2,
        check_runs: [
          {
            name: 'SDK candidate (typescript)',
            head_sha: head,
            app: { slug: 'github-actions' },
            conclusion: options.failedCandidate ? 'failure' : 'success',
          },
          ...(options.docs === 'missing'
            ? []
            : [
                {
                  name: 'typescript-check',
                  head_sha: head,
                  app: { slug: 'github-actions' },
                  conclusion: options.docs === 'pending' ? null : (options.docs ?? 'success'),
                },
              ]),
        ],
      });
    if (path === `/git/commits/${base}`)
      return response({ sha: base, tree: { sha: base }, parents: [] });
    if (path === `/git/commits/${head}`)
      return response({ sha: head, tree: { sha: head }, parents: [{ sha: base }] });
    if (path === `/git/commits/${merge}`)
      return response({
        sha: merge,
        tree: { sha: merge },
        parents:
          options.mergeKind === 'merge'
            ? [{ sha: 'd'.repeat(40) }, { sha: head }]
            : [{ sha: 'd'.repeat(40) }],
      });
    if (path.startsWith('/compare/')) return response({ files });
    if (path.startsWith('/contents/')) {
      const filename = url.pathname.split('/contents/')[1];
      const file = releaseFiles.find(file => file.path === filename);
      const data = url.searchParams.get('ref') === base ? file?.before : file?.after;
      if (data == null) return response({}, 404);
      const contents =
        options.editedPlan && filename === BATCH_PATH
          ? JSON.stringify({ ...batch, outputs: ['ts/packages/core/src/'] })
          : data;
      return response({ encoding: 'base64', content: Base64.encode(contents) });
    }
    if (path === '/git/ref/heads/sdk-release/batch-8')
      return options.existingBranch ? response({ object: { sha: head } }) : response({}, 404);
    if (path === '/git/ref/tags/sdk-release/8')
      return options.existingTag
        ? response({ object: { type: 'commit', sha: options.existingTag } })
        : response({}, 404);
    if (path === '/actions/runs/8')
      return response({
        id: 8,
        path: '.github/workflows/sdk.release.yml',
        head_branch: 'next',
        repository: { full_name: 'ComposioHQ/composio' },
        status: 'completed',
        conclusion: 'success',
        created_at: '2026-11-03T00:00:00Z',
        run_attempt: 1,
        html_url: 'https://github.com/ComposioHQ/composio/actions/runs/8',
      });
    if (path.startsWith('/actions/runs/8/artifacts'))
      return response({
        artifacts: [
          {
            ...artifact,
            name: 'sdk-authorized-batch',
            digest: authorizedArchive.digest,
            workflow_run: { id: 8, head_sha: base },
            expires_at: '2099-12-01T00:00:00Z',
          },
        ],
      });
    if (path === `/actions/artifacts/${artifact.id}/zip`)
      return new Response(null, {
        status: 302,
        headers: { location: `https://artifacts.test/${artifact.id}.zip` },
      });
    throw new Error(`Unexpected read ${path}`);
  };
  return { fetcher, writes };
}

describe('controller API contracts', () => {
  test('failed, pending or absent production docs prevent both merge and tag authorization', async () => {
    for (const docs of ['failure', 'pending', 'missing'] as const) {
      for (const pendingMerge of [true, false]) {
        const { fetcher, writes } = fakeController({ docs, pendingMerge });
        await expect(
          runRelease(
            pendingMerge ? mergeApprovedRelease(9, 123, '0') : authorizeSourceTag(9, 123),
            fetcher
          )
        ).rejects.toThrow('docs');
        expect(writes).toEqual([]);
      }
    }
  });
  test('merge and squash tag the approved head while later next commits remain independent', async () => {
    for (const mergeKind of ['merge', 'squash'] as const) {
      const { fetcher, writes } = fakeController({ mergeKind });
      expect(await runRelease(authorizeSourceTag(9, 123), fetcher)).toBe('sdk-release/8');
      expect(writes).toEqual([
        { path: '/git/refs', body: { ref: 'refs/tags/sdk-release/8', sha: head } },
      ]);
    }
  });
  test('automatic protected merge supplies the expected final head', async () => {
    const { fetcher, writes } = fakeController({ pendingMerge: true });
    await runRelease(mergeApprovedRelease(9, 123, '0'), fetcher);
    expect(writes[0]).toEqual({
      path: '/pulls/9/merge',
      body: { sha: head, merge_method: 'squash' },
    });
  });
  test('old reviews, requester approvals, failed candidates and edited frozen plans cause no tag writes', async () => {
    for (const options of [
      { oldReview: true },
      { reviewer: 'requester' },
      { failedCandidate: true },
      { editedPlan: true },
    ]) {
      const { fetcher, writes } = fakeController(options);
      await expect(runRelease(authorizeSourceTag(9, 123), fetcher)).rejects.toThrow();
      expect(writes).toEqual([]);
    }
  });
  test('the release requester cannot approve their own release', async () => {
    const { fetcher, writes } = fakeController({ reviewer: 'requester' });
    await expect(runRelease(mergeApprovedRelease(9, 123, '10'), fetcher)).rejects.toThrow(
      'lacks an approval from a writer other than the author and requesters'
    );
    expect(writes).toEqual([]);
  });
  test('an existing matching tag is reused and a moved source is refused', async () => {
    const matching = fakeController({ existingTag: head });
    await runRelease(authorizeSourceTag(9, 123), matching.fetcher);
    expect(matching.writes).toEqual([]);
    const moved = fakeController({ existingTag: merge });
    await expect(runRelease(authorizeSourceTag(9, 123), moved.fetcher)).rejects.toThrow(
      'another source'
    );
    expect(moved.writes).toEqual([]);
  });
  test('partial preparation retry reconciles an existing source branch without creating another commit', async () => {
    const { fetcher, writes } = fakeController({ existingBranch: true });
    await runRelease(commitPreparedRelease({ batch, files: releaseFiles }, batch), fetcher);
    expect(writes.map(write => write.path)).toEqual(['/pulls']);
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

describe('SDK fragment policy', () => {
  const packages = [{ name: '@composio/core', directory: 'ts/packages/core', private: false }];
  test('requires both language entries for changed public source', () => {
    expect(
      missingReleaseNotes(
        ['ts/packages/core/src/index.ts', 'python/composio/core/tools.py'],
        [],
        packages
      )
    ).toEqual(['@composio/core', '@composio/python-sdk']);
    expect(
      missingReleaseNotes(
        ['python/composio/core/tools.py', '.changeset/python-fix.md'],
        [{ id: 'python-fix', releases: [{ name: '@composio/python-sdk', type: 'patch' }] }],
        packages
      )
    ).toEqual([]);
  });
  test('preexisting pending notes cannot cover new public behavior in another PR', () => {
    expect(
      missingReleaseNotes(
        ['python/composio/core/tools.py'],
        [{ id: 'older-note', releases: [{ name: '@composio/python-sdk', type: 'patch' }] }],
        packages
      )
    ).toEqual(['@composio/python-sdk']);
    expect(
      missingReleaseNotes(
        ['ts/packages/core/package.json'],
        [],
        packages,
        '<!-- sdk-release-note-exempt: This release PR applies previously reviewed SDK changes and only updates release metadata and generated documentation. -->'
      )
    ).toEqual([]);
  });
  test('tests, CLI and a meaningful explicit exemption do not require SDK fragments', () => {
    expect(
      missingReleaseNotes(
        [
          'ts/packages/core/test/index.test.ts',
          'python/tests/test_tools.py',
          'ts/packages/cli/src/index.ts',
        ],
        [],
        packages
      )
    ).toEqual([]);
    expect(
      missingReleaseNotes(
        ['python/composio/core/tools.py'],
        [],
        packages,
        '<!-- sdk-release-note-exempt: Internal typing adjustment with no runtime or public signature changes. -->'
      )
    ).toEqual([]);
    expect(
      missingReleaseNotes(
        ['python/composio/core/tools.py'],
        [],
        packages,
        '<!-- sdk-release-note-exempt: none -->'
      )
    ).toEqual(['@composio/python-sdk']);
  });
});

test('missing candidates cannot rebuild after any original-run upload step may have executed', async () => {
  const fixture =
    (status: string, conclusion: string | null): Fetch =>
    async () =>
      new Response(
        JSON.stringify({
          jobs: [
            {
              name: 'npm',
              steps: [{ name: 'Upload original candidates to npm', status, conclusion }],
            },
          ],
        })
      );
  expect(
    await runRelease(mayRebuildMissingCandidate(8, true), fixture('completed', 'failure'))
  ).toBe(false);
  expect(await runRelease(mayRebuildMissingCandidate(8, false), fixture('queued', null))).toBe(
    false
  );
  expect(await runRelease(mayRebuildMissingCandidate(8, true), fixture('queued', null))).toBe(true);
});

test('exact candidate compatibility keeps the original packed dependency and tarball bytes', async () => {
  const temporary = await directories.create();
  await writeText(
    `${temporary}/package/package.json`,
    JSON.stringify({
      name: '@composio/core',
      version: '1.0.1',
      dependencies: { '@composio/json-schema-to-zod': '0.1.0' },
    })
  );
  const file = `${temporary}/composio-core-1.0.1.tgz`;
  await runRelease(run('tar', ['-czf', file, '-C', temporary, 'package']));
  const checksum = async () => runRelease(sha256Hex(await readBytes(file)));
  const before = await checksum();
  const candidates = await readExactCandidateTarballs(temporary);
  expect(candidates.get('@composio/core')).toBe(file);
  expect(await checksum()).toBe(before);
  expect(await runRelease(run('tar', ['-xOf', file, 'package/package.json']))).toContain(
    '"@composio/json-schema-to-zod":"0.1.0"'
  );
});
