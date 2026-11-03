import { describe, expect, test } from 'bun:test';
import { eligibleApproval, validateReleaseDiff } from '../scripts/sdk-release/source';
import {
  candidateGate,
  reuseCandidate,
  verifyArchive,
  verifyCandidateFiles,
} from '../scripts/sdk-release/artifacts';

const base = 'a'.repeat(40);
const head = 'b'.repeat(40);
const merge = 'c'.repeat(40);

describe('approved release source', () => {
  test('requires a non-author, eligible current-head review', () => {
    const review = { user: 'reviewer', state: 'APPROVED', commitId: head, permission: 'write' };
    expect(eligibleApproval([review], 'author', head)).toBe(true);
    expect(
      eligibleApproval(
        [review, { ...review, user: 'observer', state: 'CHANGES_REQUESTED', permission: 'read' }],
        'author',
        head
      )
    ).toBe(true);
    expect(eligibleApproval([{ ...review, commitId: base }], 'author', head)).toBe(false);
    expect(eligibleApproval([{ ...review, permission: 'read' }], 'author', head)).toBe(false);
    expect(eligibleApproval([{ ...review, user: 'author' }], 'author', head)).toBe(false);
    expect(
      eligibleApproval([review, { ...review, state: 'CHANGES_REQUESTED' }], 'author', head)
    ).toBe(false);
  });
  test('source edits and lock dependency changes fail release-only validation', () => {
    const plan = { releases: [], changesets: [], retainedChangesets: [] };
    expect(() =>
      validateReleaseDiff(
        [{ path: 'ts/packages/core/src/index.ts', before: 'x', after: 'y' }],
        plan,
        []
      )
    ).toThrow();
    expect(() =>
      validateReleaseDiff([{ path: 'pnpm-lock.yaml', before: 'dep: 1', after: 'dep: 2' }], plan, [])
    ).toThrow();
    expect(() =>
      validateReleaseDiff(
        [{ path: 'docs/content/changelog/release.mdx', before: 'x', after: 'edited narrative' }],
        plan,
        ['docs/content/changelog/release.mdx']
      )
    ).not.toThrow();
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
  test('reuses IDs only from the original source and producer', () => {
    expect(reuseCandidate([artifact], artifact.name, 8, head, Date.parse('2026-11-03'))?.id).toBe(
      42
    );
    expect(() => reuseCandidate([artifact], artifact.name, 9, head)).toThrow();
    expect(() => reuseCandidate([artifact], artifact.name, 8, base)).toThrow();
    expect(() =>
      reuseCandidate([{ ...artifact, expired: true }], artifact.name, 8, head)
    ).toThrow();
  });
  test('archive digest and every file checksum fail closed', () => {
    expect(() => verifyArchive(new Uint8Array([1]), artifact.digest)).toThrow();
    expect(() =>
      verifyCandidateFiles(new Map([['package.tgz', new Uint8Array([1, 2, 3, 4])]]), files)
    ).toThrow();
  });
  test('all selected languages must succeed; empty languages skip', () => {
    expect(
      candidateGate(['typescript', 'python'], { typescript: 'success', python: 'failure' })
    ).toBe(false);
    expect(candidateGate(['python'], { typescript: 'skipped', python: 'success' })).toBe(true);
    expect(candidateGate([], { typescript: 'skipped', python: 'skipped' })).toBe(false);
  });
});

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GitHubReleaseClient } from '../scripts/sdk-release/github';
import {
  authorizeSourceTag,
  commitPreparedRelease,
  mergeApprovedRelease,
} from '../scripts/sdk-release/batch';
import { batchPath, type ReleaseBatch } from '../scripts/sdk-release/source';
import { missingReleaseNotes } from '../ts/scripts/validate-changesets.mjs';

const batch: ReleaseBatch = {
  schemaVersion: 1,
  id: '8',
  originalRunId: '8',
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
  { path: batchPath, before: null, after: JSON.stringify(batch) },
  { path: 'ts/packages/core/package.json', before: oldManifest, after: newManifest },
  { path: batch.outputs[0], before: null, after: 'Human-edited release narrative' },
];

function fakeController(
  options: {
    oldReview?: boolean;
    mergeKind?: 'squash' | 'merge';
    editedPlan?: boolean;
    existingTag?: string;
    failedCandidate?: boolean;
    pendingMerge?: boolean;
    existingBranch?: boolean;
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
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
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
    if (path.startsWith('/pulls?')) return response([]);
    if (path === '/pulls/9') return response(pull());
    if (path.startsWith('/pulls/9/reviews'))
      return response([
        {
          user: { login: 'reviewer' },
          state: 'APPROVED',
          commit_id: options.oldReview ? base : head,
        },
      ]);
    if (path === '/collaborators/reviewer/permission') return response({ permission: 'write' });
    if (path.startsWith(`/commits/${head}/check-runs`))
      return response({
        total_count: 1,
        check_runs: [
          {
            name: 'SDK candidate (typescript)',
            head_sha: head,
            app: { slug: 'github-actions' },
            conclusion: options.failedCandidate ? 'failure' : 'success',
          },
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
        options.editedPlan && filename === batchPath
          ? JSON.stringify({ ...batch, outputs: ['ts/packages/core/src/'] })
          : data;
      return response({ encoding: 'base64', content: Buffer.from(contents).toString('base64') });
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
            workflow_run: { id: 8, head_sha: base },
            expires_at: '2099-12-01T00:00:00Z',
          },
        ],
      });
    throw new Error(`Unexpected read ${path}`);
  };
  class FixtureClient extends GitHubReleaseClient {
    override async downloadArtifact(_artifact: { id: number; digest: string }, directory: string) {
      await writeFile(join(directory, 'sdk-release-batch.json'), JSON.stringify(batch));
    }
  }
  return { github: new FixtureClient('token', fetcher), writes };
}

describe('controller API contracts', () => {
  test('merge and squash tag the approved head while later next commits remain independent', async () => {
    for (const mergeKind of ['merge', 'squash'] as const) {
      const { github, writes } = fakeController({ mergeKind });
      expect(await authorizeSourceTag(github, 9)).toBe('sdk-release/8');
      expect(writes).toEqual([
        { path: '/git/refs', body: { ref: 'refs/tags/sdk-release/8', sha: head } },
      ]);
    }
  });
  test('automatic protected merge supplies the expected final head', async () => {
    const { github, writes } = fakeController({ pendingMerge: true });
    await mergeApprovedRelease(github, 9);
    expect(writes[0]).toEqual({
      path: '/pulls/9/merge',
      body: { sha: head, merge_method: 'squash' },
    });
  });
  test('old reviews, failed candidates and edited frozen plans cause no tag writes', async () => {
    for (const options of [{ oldReview: true }, { failedCandidate: true }, { editedPlan: true }]) {
      const { github, writes } = fakeController(options);
      await expect(authorizeSourceTag(github, 9)).rejects.toThrow();
      expect(writes).toEqual([]);
    }
  });
  test('an existing matching tag is reused and a moved source is refused', async () => {
    const matching = fakeController({ existingTag: head });
    await authorizeSourceTag(matching.github, 9);
    expect(matching.writes).toEqual([]);
    const moved = fakeController({ existingTag: merge });
    await expect(authorizeSourceTag(moved.github, 9)).rejects.toThrow('another source');
    expect(moved.writes).toEqual([]);
  });
  test('partial preparation retry reconciles an existing source branch without creating another commit', async () => {
    const { github, writes } = fakeController({ existingBranch: true });
    await commitPreparedRelease(github, { batch, files: releaseFiles }, batch);
    expect(writes.map(write => write.path)).toEqual(['/pulls']);
  });
  test('major targets allow normal Changesets peer-range updates without changing unrelated fields', () => {
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
    expect(() =>
      validateReleaseDiff(
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
      )
    ).not.toThrow();
  });
  test('coincident client versions and Python dependency literals cannot masquerade as SDK metadata', () => {
    expect(() =>
      validateReleaseDiff(
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
    ).toThrow('Unplanned dependency');
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

import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { mayRebuildMissingCandidate, sha256 } from '../scripts/sdk-release/artifacts';
import { readExactCandidateTarballs } from '../ts/scripts/check-provider-compatibility';

test('missing candidates cannot rebuild after any original-run upload step may have executed', async () => {
  const fixture = (status: string, conclusion: string | null) =>
    new GitHubReleaseClient(
      'token',
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
        )
    );
  expect(await mayRebuildMissingCandidate(fixture('completed', 'failure'), 8, true)).toBe(false);
  expect(await mayRebuildMissingCandidate(fixture('queued', null), 8, false)).toBe(false);
  expect(await mayRebuildMissingCandidate(fixture('queued', null), 8, true)).toBe(true);
});

test('exact candidate compatibility keeps the original packed dependency and tarball bytes', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'sdk-exact-tarball-'));
  try {
    await mkdir(join(temporary, 'package'));
    await writeFile(
      join(temporary, 'package/package.json'),
      JSON.stringify({
        name: '@composio/core',
        version: '1.0.1',
        dependencies: { '@composio/json-schema-to-zod': '0.1.0' },
      })
    );
    const file = join(temporary, 'composio-core-1.0.1.tgz');
    const result = spawnSync('tar', ['-czf', file, '-C', temporary, 'package']);
    if (result.status !== 0) throw new Error('Fixture tarball creation failed');
    const checksum = sha256(await readFile(file));
    const candidates = await readExactCandidateTarballs(temporary);
    expect(candidates.get('@composio/core')).toBe(file);
    expect(sha256(await readFile(file))).toBe(checksum);
    expect(
      spawnSync('tar', ['-xOf', file, 'package/package.json'], { encoding: 'utf8' }).stdout
    ).toContain('"@composio/json-schema-to-zod":"0.1.0"');
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
