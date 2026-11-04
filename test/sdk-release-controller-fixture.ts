import { Effect, FileSystem } from 'effect';
import { Base64 } from 'effect/encoding';
import { run, sha256Hex } from '../scripts/sdk-release/runtime';
import { BATCH_PATH, type ReleaseBatch } from '../scripts/sdk-release/source';
import { runRelease, temporaryDirectories, writeText, type Fetch } from './sdk-release-harness';

export const base = 'a'.repeat(40);
export const head = 'b'.repeat(40);
export const merge = 'c'.repeat(40);

export const batch: ReleaseBatch = {
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
export const releaseFiles = [
  { path: BATCH_PATH, before: null, after: JSON.stringify(batch) },
  { path: 'ts/packages/core/package.json', before: oldManifest, after: newManifest },
  { path: batch.outputs[0], before: null, after: 'Human-edited release narrative' },
];

const ARTIFACT_ID = 42;

/** A real zip of the authorized plan, so downloads exercise the archive digest and unzip checks. */
const buildAuthorizedArchive = async () => {
  const directories = temporaryDirectories('sdk-release-authorized-');
  try {
    const directory = await directories.create();
    await writeText(`${directory}/sdk-release-batch.json`, JSON.stringify(batch));
    const zip = `${directory}/authorized.zip`;
    await runRelease(run('zip', ['-j', '-q', zip, `${directory}/sdk-release-batch.json`]));
    const bytes = new Uint8Array(
      await runRelease(
        Effect.gen(function* () {
          return yield* (yield* FileSystem.FileSystem).readFile(zip);
        })
      )
    );
    return { bytes, digest: `sha256:${await runRelease(sha256Hex(bytes))}` };
  } finally {
    await directories.cleanup();
  }
};
let authorizedArchive: ReturnType<typeof buildAuthorizedArchive> | undefined;

export interface ControllerOptions {
  readonly oldReview?: boolean;
  readonly reviewer?: string;
  readonly mergeKind?: 'squash' | 'merge';
  readonly editedPlan?: boolean;
  readonly existingTag?: string;
  readonly failedCandidate?: boolean;
  readonly failedSmoke?: boolean;
  readonly closedUnmerged?: boolean;
  readonly existingBranch?: boolean;
  /** Head branch of a release PR that is already open into next. */
  readonly openRelease?: string;
  readonly docs?: 'success' | 'failure' | 'pending' | 'missing';
}

/** A fake GitHub API for release PR #9 of batch 8 that records every write. */
export async function fakeController(options: ControllerOptions = {}) {
  const archive = await (authorizedArchive ??= buildAuthorizedArchive());
  const writes: { path: string; body: unknown }[] = [];
  const merged = !options.closedUnmerged;
  const files = releaseFiles.map((file, index) => ({
    filename: file.path,
    status: file.before === null ? 'added' : 'modified',
    sha: String(index + 1).repeat(40),
  }));
  const pull = () => ({
    number: 9,
    html_url: 'https://github.com/ComposioHQ/composio/pull/9',
    body: '<!-- sdk-release-batch -->',
    state: 'closed',
    merged,
    merge_commit_sha: merged ? merge : null,
    user: { login: 'release-bot' },
    head: { sha: head, ref: 'sdk-release/batch-8', repo: { full_name: 'ComposioHQ/composio' } },
    base: { ref: 'next' },
  });
  const fetcher: Fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === 'artifacts.test') return new Response(archive.bytes);
    const path = url.pathname.replace('/repos/ComposioHQ/composio', '') + url.search;
    const method = init?.method ?? 'GET';
    const response = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status });
    if (method !== 'GET') {
      writes.push({ path, body: JSON.parse(String(init?.body)) });
      if (path === '/git/refs') return response({ ref: 'refs/tags/sdk-release/8' });
      if (path === '/pulls') return response(pull());
      if (/^\/issues\/\d+\/comments$/.test(path)) return response({ id: 1 });
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
        total_count: options.docs === 'missing' ? 2 : 3,
        check_runs: [
          {
            name: 'SDK candidate (typescript)',
            head_sha: head,
            app: { slug: 'github-actions' },
            conclusion: options.failedCandidate ? 'failure' : 'success',
          },
          {
            name: 'SDK candidate smoke (typescript)',
            head_sha: head,
            app: { slug: 'github-actions' },
            conclusion: options.failedSmoke ? 'failure' : 'success',
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
            id: ARTIFACT_ID,
            name: 'sdk-authorized-batch',
            digest: archive.digest,
            expired: false,
            created_at: '2026-11-01T00:00:00Z',
            workflow_run: { id: 8, head_sha: base },
            expires_at: '2099-12-01T00:00:00Z',
          },
        ],
      });
    if (path === `/actions/artifacts/${ARTIFACT_ID}/zip`)
      return new Response(null, {
        status: 302,
        headers: { location: `https://artifacts.test/${ARTIFACT_ID}.zip` },
      });
    throw new Error(`Unexpected read ${path}`);
  };
  return { fetcher, writes };
}
