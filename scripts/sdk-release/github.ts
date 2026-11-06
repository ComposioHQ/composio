import { Context, Data, Effect, Layer, Option, Schema, Stream } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http';
import { ensure } from './runtime';

export const SDK_RELEASE_REPOSITORY = 'ComposioHQ/composio';
export const REPOSITORY_PATH = `/repos/${SDK_RELEASE_REPOSITORY}`;
export const runUrl = (id: string | number) =>
  `https://github.com/${SDK_RELEASE_REPOSITORY}/actions/runs/${id}`;
const PAGE_SIZE = 100;
/** Bounded so large release diffs stay under GitHub's secondary rate limit. */
export const CONTENT_CONCURRENCY = 8;

export const RunId = Schema.String.check(Schema.isPattern(/^[1-9][0-9]*$/));
export const Sha = Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}$/));
export const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));
export const PositiveIntFromString = Schema.NumberFromString.check(
  Schema.isInt(),
  Schema.isGreaterThan(0)
);
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
    const send = (
      method: HttpMethod,
      path: string,
      body: unknown,
      redirect: RequestRedirect,
      accept = 'application/vnd.github+json'
    ) =>
      Effect.gen(function* () {
        yield* ensure(path.startsWith('/') && !path.startsWith('//'), 'Expected a GitHub API path');
        const base = HttpClientRequest.make(method)(`https://api.github.com${path}`, {
          headers: {
            accept,
            authorization: `Bearer ${token}`,
            'x-github-api-version': '2026-03-10',
          },
        });
        return yield* client.execute(
          body === undefined ? base : HttpClientRequest.bodyJsonUnsafe(base, body)
        );
      }).pipe(Effect.provideService(FetchHttpClient.RequestInit, { redirect }));
    const failure = (method: HttpMethod, path: string, status: number) =>
      new GitHubApiError({
        status,
        method,
        path,
        message: `GitHub ${method} ${path} failed (${status})`,
      });
    return {
      request: <S extends Schema.Top>(
        method: HttpMethod,
        path: string,
        schema: S,
        body?: unknown
      ) =>
        Effect.gen(function* () {
          const response = yield* send(method, path, body, 'error');
          if (response.status < 200 || response.status >= 300)
            return yield* failure(method, path, response.status);
          return yield* decodeBody(schema, yield* response.text);
        }),
      /** A file's raw contents, or `None` on 404. Raw media works for files over 1 MB. */
      raw: (path: string) =>
        Effect.gen(function* () {
          const response = yield* send(
            'GET',
            path,
            undefined,
            'error',
            'application/vnd.github.raw'
          );
          if (response.status === 404) return Option.none<string>();
          if (response.status < 200 || response.status >= 300)
            return yield* failure('GET', path, response.status);
          return Option.some(yield* response.text);
        }),
      /** Resolves an endpoint that answers with a 302 to short-lived storage, such as an artifact archive. */
      redirectLocation: (path: string) =>
        Effect.gen(function* () {
          const response = yield* send('GET', path, undefined, 'manual');
          if (response.status !== 302) return yield* failure('GET', path, response.status);
          return Option.fromNullishOr(response.headers.location);
        }),
    };
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
export const paginate = <S extends Schema.Top, A>(
  path: string,
  page: S,
  items: (body: S['Type']) => ReadonlyArray<A>
) =>
  Stream.paginate(1, (index: number) =>
    request(
      'GET',
      `${path}${path.includes('?') ? '&' : '?'}per_page=${PAGE_SIZE}&page=${index}`,
      page
    ).pipe(
      Effect.map(body => {
        const found = items(body);
        return [found, found.length < PAGE_SIZE ? Option.none() : Option.some(index + 1)] as const;
      })
    )
  );

export const paginateArray = <S extends Schema.Top>(path: string, item: S) =>
  paginate(path, Schema.Array(item), body => body);

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
      Schema.Struct({ jobs: Schema.Array(ReleaseJob) }),
      body => body.jobs
    )
  );
