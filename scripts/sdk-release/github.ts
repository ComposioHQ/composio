import { Context, Data, Effect, Layer, Option, Schema, Stream } from 'effect';
import { Base64 } from 'effect/encoding';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http';
import { ensure } from './runtime';

export const SDK_RELEASE_REPOSITORY = 'ComposioHQ/composio';
export const REPOSITORY_PATH = `/repos/${SDK_RELEASE_REPOSITORY}`;
const PAGE_SIZE = 100;

export const RunId = Schema.String.check(Schema.isPattern(/^[1-9][0-9]*$/));
export const Sha = Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}$/));
const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));
const Login = Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/));

export const ReleaseRun = Schema.Struct({
  id: PositiveInt,
  path: Schema.String,
  head_branch: Schema.NullOr(Schema.String),
  repository: Schema.Struct({ full_name: Schema.String }),
  status: Schema.String,
  conclusion: Schema.NullOr(Schema.String),
  created_at: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}T/)),
  run_attempt: PositiveInt,
  html_url: Schema.String.check(Schema.isPattern(/^https:\/\//)),
});
export type ReleaseRun = typeof ReleaseRun.Type;

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export class GitHubApiError extends Data.TaggedError('GitHubApiError')<{
  readonly status: number;
  readonly method: HttpMethod;
  readonly path: string;
  readonly message: string;
}> {}

const decodeBody = <S extends Schema.Top>(schema: S, text: string) =>
  text === ''
    ? Schema.decodeUnknownEffect(schema)(undefined)
    : Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(text);

const makeGitHub = (token: string) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const request = <S extends Schema.Top>(
      method: HttpMethod,
      path: string,
      schema: S,
      body?: unknown
    ) =>
      Effect.gen(function* () {
        yield* ensure(path.startsWith('/') && !path.startsWith('//'), 'Expected a GitHub API path');
        const base = HttpClientRequest.make(method)(`https://api.github.com${path}`, {
          headers: {
            accept: 'application/vnd.github+json',
            authorization: `Bearer ${token}`,
            'x-github-api-version': '2026-03-10',
          },
        });
        const response = yield* client.execute(
          body === undefined ? base : HttpClientRequest.bodyJsonUnsafe(base, body)
        );
        if (response.status < 200 || response.status >= 300)
          return yield* new GitHubApiError({
            status: response.status,
            method,
            path,
            message: `GitHub ${method} ${path} failed (${response.status})`,
          });
        return yield* decodeBody(schema, yield* response.text);
      }).pipe(Effect.provideService(FetchHttpClient.RequestInit, { redirect: 'error' }));
    return { request };
  });

/** The controller's GitHub App installation client. Only trusted controller entry points provide it. */
export class GitHub extends Context.Service<
  GitHub,
  Effect.Success<ReturnType<typeof makeGitHub>>
>()('sdk-release/GitHub') {
  static readonly layer = (token: string) => Layer.effect(GitHub, makeGitHub(token));
}

export const request = <S extends Schema.Top>(
  method: HttpMethod,
  path: string,
  schema: S,
  body?: unknown
) =>
  Effect.gen(function* () {
    const github = yield* GitHub;
    return yield* github.request(method, path, schema, body);
  });

/** Optional lookup: a 404 becomes `None`; every other failure still fails. */
export const requestOptional = <S extends Schema.Top>(path: string, schema: S) =>
  request('GET', path, schema).pipe(
    Effect.map(Option.some),
    Effect.catchTag('GitHubApiError', error =>
      error.status === 404 ? Effect.succeedNone : Effect.fail(error)
    )
  );

/** Streams a paginated list endpoint until GitHub returns a short page. */
export const paginate = <S extends Schema.Top>(path: string, item: S) =>
  Stream.paginate(1, (page: number) =>
    request(
      'GET',
      `${path}${path.includes('?') ? '&' : '?'}per_page=${PAGE_SIZE}&page=${page}`,
      Schema.Array(item)
    ).pipe(
      Effect.map(
        items => [items, items.length < PAGE_SIZE ? Option.none() : Option.some(page + 1)] as const
      )
    )
  );

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

export const getRun = (id: string) =>
  Effect.gen(function* () {
    const runId = yield* Schema.decodeUnknownEffect(RunId)(id);
    return yield* request('GET', `${REPOSITORY_PATH}/actions/runs/${runId}`, ReleaseRun);
  });

export const rerunFailedJobs = (id: string) =>
  Effect.gen(function* () {
    const runId = yield* Schema.decodeUnknownEffect(RunId)(id);
    yield* request(
      'POST',
      `${REPOSITORY_PATH}/actions/runs/${runId}/rerun-failed-jobs`,
      Schema.Unknown
    );
  });

export const decodeBase64Content = (content: string) =>
  Effect.fromResult(Base64.decodeString(content.replace(/\s/g, '')));
