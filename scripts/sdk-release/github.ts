import { Effect, Option, Schema, Stream } from 'effect';
import { GitHub, PositiveInt, paginate, request } from '../lib/github';
import { ensure } from './runtime';

export {
  GitHub,
  GitHubApiError,
  GitHubContractError,
  PositiveInt,
  PositiveIntFromString,
  paginate,
  paginateArray,
  request,
  requestOptional,
  type HttpMethod,
  type RetryPolicy,
} from '../lib/github';

export const SDK_RELEASE_REPOSITORY = 'ComposioHQ/composio';
export const REPOSITORY_PATH = `/repos/${SDK_RELEASE_REPOSITORY}`;
export const runUrl = (id: string | number) =>
  `https://github.com/${SDK_RELEASE_REPOSITORY}/actions/runs/${id}`;

/** Bounded so large release diffs stay under GitHub's secondary rate limit. */
export const CONTENT_CONCURRENCY = 8;

export const RunId = Schema.String.check(Schema.isPattern(/^[1-9][0-9]*$/));
export const Sha = Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}$/));
export const TagRef = Schema.Struct({ object: Schema.Struct({ type: Schema.String, sha: Sha }) });
export const CreatedSha = Schema.Struct({ sha: Sha });
const Login = Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/));

export const ReleaseRun = Schema.Struct({
  id: PositiveInt,
  path: Schema.String,
  head_sha: Schema.optionalKey(Sha),
  event: Schema.optionalKey(Schema.String),
  repository: Schema.Struct({ full_name: Schema.String }),
  conclusion: Schema.NullOr(Schema.String),
  html_url: Schema.String.check(Schema.isPattern(/^https:\/\//)),
});
export type ReleaseRun = typeof ReleaseRun.Type;

const ReleaseJob = Schema.Struct({
  name: Schema.String,
  status: Schema.optionalKey(Schema.String),
  conclusion: Schema.optionalKey(Schema.NullOr(Schema.String)),
  started_at: Schema.optionalKey(Schema.NullOr(Schema.String)),
  completed_at: Schema.optionalKey(Schema.NullOr(Schema.String)),
  steps: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      conclusion: Schema.NullOr(Schema.String),
      started_at: Schema.optionalKey(Schema.NullOr(Schema.String)),
      completed_at: Schema.optionalKey(Schema.NullOr(Schema.String)),
    })
  ).pipe(Schema.withDecodingDefaultKey(Effect.succeed([]))),
});

const JobsPage = Schema.Struct({ jobs: Schema.Array(ReleaseJob) });

export const requireActiveMember = (login: string) =>
  Effect.gen(function* () {
    const user = yield* Schema.decodeUnknownEffect(Login)(login);
    const membership = yield* request(
      'GET',
      `/orgs/ComposioHQ/memberships/${encodeURIComponent(user)}`,
      Schema.Struct({ state: Schema.Literals(['active', 'pending']) })
    );
    yield* ensure(membership.state === 'active', 'An active ComposioHQ membership is required');
  });

export const commentIssue = (issueNumber: number, body: string) =>
  Effect.gen(function* () {
    const issue = yield* Schema.decodeUnknownEffect(PositiveInt)(issueNumber);
    yield* request(
      'POST',
      `${REPOSITORY_PATH}/issues/${issue}/comments`,
      Schema.Struct({ id: Schema.Number }),
      { body }
    );
  });

/** A file's UTF-8 contents at `sha`, or `None` when it does not exist there. */
export const fileAt = (path: string, sha: string) =>
  Effect.flatMap(GitHub, github => github.raw(`${REPOSITORY_PATH}/contents/${path}?ref=${sha}`));
export const fileAtOrNull = (path: string, sha: string) =>
  Effect.map(fileAt(path, sha), Option.getOrNull);

/** A run's jobs across pages: from every attempt, or only from the latest one. */
export const jobs = (id: string, filter: 'all' | 'latest' = 'all') =>
  Stream.runCollect(
    paginate(
      `${REPOSITORY_PATH}/actions/runs/${id}/jobs?filter=${filter}`,
      JobsPage,
      body => body.jobs
    )
  );
