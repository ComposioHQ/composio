import { BATCH_PATH, type ReleaseBatch } from '../scripts/sdk-release/source';
import type { Fetch } from './sdk-release-harness';

export const base = 'a'.repeat(40);
export const head = 'b'.repeat(40);
export const merge = 'c'.repeat(40);
export const APP_SLUG = 'sdk-release-app';

/** Keys follow the schema order, as a decoded batch does, so the committed plan compares equal. */
export const batch: ReleaseBatch = {
  id: '8',
  inputBase: base,
  requestedBy: 'requester',
  issue: 8,
  date: '2026-11-03',
  plan: {
    schemaVersion: 1,
    inputFingerprint: 'frozen',
    choices: { typescript: 'auto', python: 'skip' },
    recommended: [],
    releases: [
      {
        name: '@composio/core',
        type: 'patch',
        oldVersion: '1.0.0',
        newVersion: '1.0.1',
        changesets: [],
        language: 'typescript',
      },
    ],
    changesets: [],
    retainedChangesets: [],
  },
};
export const oldManifest = JSON.stringify({
  name: '@composio/core',
  version: '1.0.0',
  dependencies: { client: '1.0.0' },
});
export const newManifest = JSON.stringify({
  name: '@composio/core',
  version: '1.0.1',
  dependencies: { client: '1.0.0' },
});
/** The release-only files batch 8 prepares: its plan, the core version and the docs changelog. */
export const releaseFiles = [
  { path: BATCH_PATH, before: null, after: JSON.stringify(batch) },
  { path: 'ts/packages/core/package.json', before: oldManifest, after: newManifest },
  { path: 'docs/content/changelog/11-03-26-sdk-8.mdx', before: null, after: 'Release notes' },
];

export interface ControllerOptions {
  readonly oldReview?: boolean;
  readonly reviewer?: string;
  readonly mergeKind?: 'squash' | 'merge';
  readonly existingTag?: string;
  readonly failedCandidate?: boolean;
  readonly failedSmoke?: boolean;
  readonly closedUnmerged?: boolean;
  readonly existingBranch?: boolean;
  /** Head branch of a release PR that is already open into next. */
  readonly openRelease?: string;
  readonly docs?: 'success' | 'failure' | 'pending' | 'missing';
  /** Who authored the release PR head; the release App by default. */
  readonly headAuthor?: string;
  /** Who committed the release PR head; the release App by default. */
  readonly headCommitter?: string;
  readonly unverifiedHead?: boolean;
  /** Parent of the release PR head; the planned source by default. */
  readonly headParent?: string;
}

/** A fake GitHub API for release PR #9 of batch 8 that records every write. */
export function fakeController(options: ControllerOptions = {}) {
  const writes: { method: string; path: string; body: unknown }[] = [];
  const merged = !options.closedUnmerged;
  const pull = () => ({
    number: 9,
    html_url: 'https://github.com/ComposioHQ/composio/pull/9',
    state: 'closed',
    merged,
    merge_commit_sha: merged ? merge : null,
    user: { login: `${APP_SLUG}[bot]` },
    head: { sha: head, ref: 'sdk-release/batch-8', repo: { full_name: 'ComposioHQ/composio' } },
    base: { ref: 'next' },
  });
  const check = (name: string, conclusion: string | null) => ({
    name,
    head_sha: head,
    app: { slug: 'github-actions' },
    conclusion,
  });
  const fetcher: Fetch = async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.replace('/repos/ComposioHQ/composio', '') + url.search;
    const method = init?.method ?? 'GET';
    const response = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status });
    if (method !== 'GET') {
      writes.push({ method, path, body: JSON.parse(String(init?.body)) });
      if (/^\/git\/(blobs|trees|commits)$/.test(path)) return response({ sha: 'e'.repeat(40) });
      if (path.startsWith('/git/refs')) return response({ ref: 'refs/heads/sdk-release/batch-8' });
      if (path === '/pulls') return response({ ...pull(), state: 'open', merged: false });
      if (/^\/issues\/\d+\/comments$/.test(path)) return response({ id: 1 });
      throw new Error(`Unexpected write ${method} ${path}`);
    }
    if (path.startsWith('/pulls?'))
      return response(
        options.openRelease
          ? [
              {
                ...pull(),
                number: 5,
                html_url: 'https://github.com/ComposioHQ/composio/pull/5',
                state: 'open',
                merged: false,
                merge_commit_sha: null,
                head: { ...pull().head, ref: options.openRelease },
              },
            ]
          : []
      );
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
        check_runs: [
          check('SDK candidate (typescript)', options.failedCandidate ? 'failure' : 'success'),
          check('SDK candidate smoke (typescript)', options.failedSmoke ? 'failure' : 'success'),
          ...(options.docs === 'missing'
            ? []
            : [
                check(
                  'typescript-check',
                  options.docs === 'pending' ? null : (options.docs ?? 'success')
                ),
              ]),
        ],
      });
    if (path === `/commits/${head}`)
      return response({
        author: { login: options.headAuthor ?? `${APP_SLUG}[bot]` },
        committer: { login: options.headCommitter ?? `${APP_SLUG}[bot]` },
        commit: { verification: { verified: !options.unverifiedHead } },
        parents: [{ sha: options.headParent ?? base }],
      });
    if (path === `/git/commits/${base}`)
      return response({ sha: base, tree: { sha: base }, parents: [] });
    if (path === `/git/commits/${merge}`)
      return response({
        sha: merge,
        tree: { sha: merge },
        parents:
          options.mergeKind === 'merge'
            ? [{ sha: 'd'.repeat(40) }, { sha: head }]
            : [{ sha: 'd'.repeat(40) }],
      });
    if (path.startsWith('/contents/')) {
      const filename = url.pathname.split('/contents/')[1];
      const file = releaseFiles.find(file => file.path === filename);
      const data = url.searchParams.get('ref') === base ? file?.before : file?.after;
      if (data == null) return response({}, 404);
      return new Response(data);
    }
    if (path === '/git/ref/heads/sdk-release/batch-8')
      return options.existingBranch
        ? response({ ref: 'refs/heads/sdk-release/batch-8' })
        : response({}, 404);
    if (path === '/git/ref/tags/sdk-release/8')
      return options.existingTag
        ? response({ object: { type: 'commit', sha: options.existingTag } })
        : response({}, 404);
    throw new Error(`Unexpected read ${path}`);
  };
  return { fetcher, writes };
}
