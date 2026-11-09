import { Config, Effect, FileSystem, Path, Schema, Stdio } from 'effect';
import { HttpClient, HttpClientRequest } from 'effect/http';
import { GITHUB_API_VERSION, REPOSITORY_PATH } from './github';
import { ensure, fail, formatJson, runMain } from './runtime';

/**
 * Records the GitHub responses the release controller reads for one merged release PR, so tests
 * decode real payloads through the production schemas. It only sends GET requests.
 *
 *   GITHUB_TOKEN="$(gh auth token)" bun scripts/sdk-release/record-github-fixtures.ts 5278
 */

export const FIXTURE_DIRECTORY = 'test/fixtures/sdk-release/github';

/** One recorded response. `contract` names the production schema that must decode `body`. */
export const Recording = Schema.Struct({
  contract: Schema.String,
  method: Schema.Literal('GET'),
  path: Schema.String,
  status: Schema.Int,
  apiVersion: Schema.String,
  body: Schema.Unknown,
});
export type Recording = typeof Recording.Type;

const TOKEN =
  /\b(?:gh[opsur]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|eyJ[\w-]+\.[\w-]+\.[\w-]*)/g;
const SIGNED_QUERY = /[?&](?:sig|se|sp|sv|skoid|sktid|X-Amz-[A-Za-z]+|token|jwt)=/i;

/** Drops tokens and the query of any signed URL, which would grant access until it expires. */
export const scrub = (value: unknown): unknown => {
  if (typeof value === 'string') {
    const withoutTokens = value.replace(TOKEN, '<scrubbed>');
    return /^https?:\/\//.test(withoutTokens) && SIGNED_QUERY.test(withoutTokens)
      ? `${withoutTokens.split('?')[0]}?<scrubbed>`
      : withoutTokens;
  }
  if (Array.isArray(value)) return value.map(scrub);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, scrub(entry)]));
  return value;
};

const record = (token: string) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const recordings: Recording[] = [];
    const get = <S extends Schema.Top = typeof Schema.Unknown>(
      contract: string,
      path: string,
      fields: S = Schema.Unknown as unknown as S,
      raw = false
    ) =>
      Effect.gen(function* () {
        const response = yield* client.execute(
          HttpClientRequest.get(`https://api.github.com${path}`, {
            headers: {
              accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json',
              authorization: `Bearer ${token}`,
              'x-github-api-version': GITHUB_API_VERSION,
            },
          })
        );
        const text = yield* response.text;
        yield* ensure(
          response.status === 200,
          `GitHub GET ${path} failed (${response.status}): ${text}`
        );
        const body: unknown = raw
          ? text
          : yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(text);
        recordings.push({
          contract,
          method: 'GET',
          path,
          status: response.status,
          apiVersion: response.headers['x-github-api-version-selected'] ?? '',
          body: scrub(body),
        });
        return yield* Schema.decodeUnknownEffect(fields)(body);
      });
    /** Records every page of a list endpoint, as `paginate` reads it, and returns all items. */
    const pages = <S extends Schema.Top>(contract: string, path: string, item: S, key?: string) =>
      Effect.gen(function* () {
        const found: Array<S['Type']> = [];
        for (let page = 1; ; page++) {
          const body = yield* get(
            contract,
            `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`
          );
          const list = yield* Schema.decodeUnknownEffect(Schema.Array(item))(
            key === undefined
              ? body
              : (yield* Schema.decodeUnknownEffect(Schema.Record(Schema.String, Schema.Unknown))(
                  body
                ))[key]
          );
          found.push(...list);
          if (list.length < 100) return found;
        }
      });
    return { get, pages, recordings };
  });

/** Every read the request, tag and candidate-pinning stages make for release PR `number`. */
const recordRelease = (token: string, number: number) =>
  Effect.gen(function* () {
    const { get, pages, recordings } = yield* record(token);
    const pull = yield* get(
      'PullDetail',
      `${REPOSITORY_PATH}/pulls/${number}`,
      Schema.Struct({ head: Schema.Struct({ sha: Schema.String, ref: Schema.String }) })
    );
    const head = pull.head.sha;
    const branch = pull.head.ref;
    const id = /^sdk-release\/batch-(\d+)$/.exec(branch)?.[1];
    if (!id) return yield* fail(`PR #${number} is not an SDK release PR`);
    yield* pages(
      'PullList',
      `${REPOSITORY_PATH}/pulls?state=closed&base=next&head=${encodeURIComponent(`ComposioHQ:${branch}`)}`,
      Schema.Unknown
    );
    yield* get(
      'ReleasePlan',
      `${REPOSITORY_PATH}/contents/.github/sdk-release-plan.json?ref=${head}`,
      Schema.String,
      true
    );
    yield* get('HeadCommit', `${REPOSITORY_PATH}/commits/${head}`);
    yield* get(
      'BranchActivity',
      `${REPOSITORY_PATH}/activity?ref=${encodeURIComponent(`refs/heads/${branch}`)}&direction=desc&per_page=100`
    );
    const reviews = yield* pages(
      'PullReviews',
      `${REPOSITORY_PATH}/pulls/${number}/reviews`,
      Schema.Struct({
        user: Schema.NullOr(Schema.Struct({ login: Schema.String })),
        state: Schema.String,
      })
    );
    const deciders = new Set(
      reviews.flatMap(review =>
        review.user && ['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state)
          ? [review.user.login]
          : []
      )
    );
    for (const login of deciders)
      yield* get(
        'CollaboratorPermission',
        `${REPOSITORY_PATH}/collaborators/${encodeURIComponent(login)}/permission`
      );
    yield* pages(
      'CheckRuns',
      `${REPOSITORY_PATH}/commits/${head}/check-runs`,
      Schema.Unknown,
      'check_runs'
    );
    const events = yield* pages(
      'IssueEvents',
      `${REPOSITORY_PATH}/issues/${number}/events`,
      Schema.Struct({ event: Schema.String, commit_id: Schema.NullOr(Schema.String) })
    );
    const merge = events.findLast(event => event.event === 'merged')?.commit_id;
    if (!merge) return yield* fail(`PR #${number} has no merged event`);
    yield* get('GitCommit', `${REPOSITORY_PATH}/git/commits/${merge}`);
    yield* get('GitRef', `${REPOSITORY_PATH}/git/ref/tags/sdk-release/${id}`);
    yield* get('GitRef', `${REPOSITORY_PATH}/git/ref/heads/next`);
    const runs = yield* get(
      'WorkflowRuns',
      `${REPOSITORY_PATH}/actions/workflows/sdk.release.candidates.yml/runs?event=pull_request&head_sha=${head}&status=success&per_page=100`,
      Schema.Struct({ workflow_runs: Schema.Array(Schema.Struct({ id: Schema.Number })) })
    );
    const run = runs.workflow_runs.map(entry => entry.id).toSorted((a, b) => b - a)[0];
    if (!run) return yield* fail(`No successful candidate run on ${head}`);
    yield* pages(
      'Jobs',
      `${REPOSITORY_PATH}/actions/runs/${run}/jobs?filter=all`,
      Schema.Unknown,
      'jobs'
    );
    const artifacts = yield* pages(
      'Artifacts',
      `${REPOSITORY_PATH}/actions/runs/${run}/artifacts`,
      Schema.Struct({ id: Schema.Number }),
      'artifacts'
    );
    for (const artifact of artifacts)
      yield* get('Artifact', `${REPOSITORY_PATH}/actions/artifacts/${artifact.id}`);
    return { id, recordings };
  });

/** A stable file name: the path without the repository prefix, made filesystem-safe. */
export const recordingFile = (recording: Pick<Recording, 'path'>) =>
  `${recording.path
    .replace(REPOSITORY_PATH, '')
    .replace(/^\//, '')
    .replace(/[^A-Za-z0-9.-]+/g, '_')
    .slice(0, 150)}.json`;

const main = Effect.gen(function* () {
  const [argument] = yield* (yield* Stdio.Stdio).args;
  const number = yield* Schema.decodeUnknownEffect(Schema.NumberFromString.check(Schema.isInt()))(
    argument
  );
  const token = yield* Config.schema(Schema.NonEmptyString, 'GITHUB_TOKEN');
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { id, recordings } = yield* recordRelease(token, number);
  const directory = path.join(FIXTURE_DIRECTORY, `release-${id}`);
  yield* fs.remove(directory, { recursive: true, force: true });
  yield* fs.makeDirectory(directory, { recursive: true });
  for (const recording of recordings)
    yield* fs.writeFileString(
      path.join(directory, recordingFile(recording)),
      formatJson(recording)
    );
  yield* Effect.log(`Recorded ${recordings.length} responses in ${directory}`);
});

if (import.meta.main) runMain(main);
