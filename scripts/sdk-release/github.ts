import { Context, Data, Duration, Effect, Layer, Option, Schema, Stream } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/http';
import { ensure } from './runtime';

export const SDK_RELEASE_REPOSITORY = 'ComposioHQ/composio';
export const REPOSITORY_PATH = `/repos/${SDK_RELEASE_REPOSITORY}`;
export const runUrl = (id: string | number) =>
  `https://github.com/${SDK_RELEASE_REPOSITORY}/actions/runs/${id}`;
const PAGE_SIZE = 100;
/** The REST API version every release request pins. */
const GITHUB_API_VERSION = '2026-03-10';
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

const JobsPage = Schema.Struct({ jobs: Schema.Array(ReleaseJob) });

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** GitHub refused or failed a request; `message` carries GitHub's own reason and request ID. */
export class GitHubApiError extends Data.TaggedError('GitHubApiError')<{
  readonly status: number;
  readonly method: HttpMethod;
  readonly path: string;
  readonly message: string;
}> {}

/**
 * GitHub answered, but not in the shape the release workflow reads. Retrying cannot help: the
 * schemas need updating for the API version GitHub now serves.
 */
export class GitHubContractError extends Data.TaggedError('GitHubContractError')<{
  readonly method: HttpMethod;
  readonly path: string;
  readonly message: string;
}> {}

const decodeBody = <S extends Schema.Top>(
  schema: S,
  text: string,
  method: HttpMethod,
  path: string
) =>
  (text === ''
    ? Schema.decodeUnknownEffect(schema)(undefined)
    : Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(text)
  ).pipe(
    Effect.mapError(
      error =>
        new GitHubContractError({
          method,
          path,
          message: `GitHub ${method} ${path} returned a response the release workflow cannot read under API version ${GITHUB_API_VERSION}: ${error.message}`,
        })
    )
  );

/** How long one request may take, and how often and how long a failed one is retried. */
export interface RetryPolicy {
  /** Attempts per request, the first one included. */
  readonly attempts: number;
  /** The first backoff; each later one doubles it. */
  readonly baseDelayMs: number;
  /** The longest single wait, including one GitHub asks for; a longer request gives up instead. */
  readonly maxDelayMs: number;
  /** Per-attempt timeout. */
  readonly timeout: Duration.Input;
}

const DEFAULT_RETRY: RetryPolicy = {
  attempts: 5,
  baseDelayMs: 1_000,
  maxDelayMs: 60_000,
  timeout: '30 seconds',
};

const ErrorBody = Schema.Struct({
  message: Schema.optionalKey(Schema.String),
  errors: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        message: Schema.optionalKey(Schema.String),
        code: Schema.optionalKey(Schema.String),
      })
    )
  ),
});

/** GitHub's own explanation from an error body, such as "Validation Failed (already_exists)". */
const githubReason = (text: string) => {
  const parsed = Schema.decodeUnknownOption(Schema.fromJsonString(ErrorBody))(text);
  if (Option.isNone(parsed)) return text.trim().slice(0, 300);
  const details = (parsed.value.errors ?? []).flatMap(error => error.message ?? error.code ?? []);
  return [parsed.value.message, details.length ? `(${details.join('; ')})` : '']
    .filter(Boolean)
    .join(' ');
};

const failure = (
  method: HttpMethod,
  path: string,
  response: HttpClientResponse.HttpClientResponse,
  text: string
) => {
  const reason = githubReason(text);
  return new GitHubApiError({
    status: response.status,
    method,
    path,
    message: `GitHub ${method} ${path} failed (${response.status})${reason ? `: ${reason}` : ''} [request ${response.headers['x-github-request-id'] ?? 'unknown'}, API ${GITHUB_API_VERSION}]`,
  });
};

/**
 * A rate limit, which GitHub did not process. Secondary limits answer 403 or 429 with
 * `retry-after`, an exhausted primary limit `x-ratelimit-remaining: 0`.
 */
const isRateLimited = (response: HttpClientResponse.HttpClientResponse, text: string) =>
  response.status === 429 ||
  (response.status === 403 &&
    (response.headers['retry-after'] !== undefined ||
      response.headers['x-ratelimit-remaining'] === '0' ||
      /rate limit/i.test(text)));

/** The wait GitHub asked for, from `retry-after` or the primary limit's reset time. */
const requestedDelayMs = (response: HttpClientResponse.HttpClientResponse, now: number) => {
  const retryAfter = Number(response.headers['retry-after']);
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return retryAfter * 1_000;
  const reset = Number(response.headers['x-ratelimit-reset']);
  if (response.headers['x-ratelimit-remaining'] === '0' && Number.isFinite(reset))
    return Math.max(0, reset * 1_000 - now);
  return undefined;
};

type Attempt =
  | { readonly _tag: 'Done'; readonly response: HttpClientResponse.HttpClientResponse }
  | { readonly _tag: 'Retry'; readonly error: GitHubApiError; readonly delayMs?: number };

const makeGitHub = (token: string, policy: RetryPolicy) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const sendOnce = (
      method: HttpMethod,
      path: string,
      body: unknown,
      redirect: RequestRedirect,
      accept: string
    ) =>
      Effect.gen(function* () {
        const base = HttpClientRequest.make(method)(`https://api.github.com${path}`, {
          headers: {
            accept,
            authorization: `Bearer ${token}`,
            'x-github-api-version': GITHUB_API_VERSION,
          },
        });
        return yield* client.execute(
          body === undefined ? base : HttpClientRequest.bodyJsonUnsafe(base, body)
        );
      }).pipe(
        Effect.provideService(FetchHttpClient.RequestInit, { redirect }),
        Effect.timeout(policy.timeout)
      );
    /**
     * One attempt, classified. Rate limits are retried for every method. Server errors and
     * timeouts are retried only for GET: GitHub sometimes applies a write before answering 502,
     * and repeating it would duplicate an issue or comment, or fail on a ref that now exists.
     */
    const attempt = (
      method: HttpMethod,
      path: string,
      body: unknown,
      redirect: RequestRedirect,
      accept: string
    ) =>
      sendOnce(method, path, body, redirect, accept).pipe(
        Effect.matchEffect({
          onFailure: (cause): Effect.Effect<Attempt, GitHubApiError> => {
            const error = new GitHubApiError({
              status: 0,
              method,
              path,
              message: `GitHub ${method} ${path} did not answer: ${cause.message}`,
            });
            return method === 'GET' ? Effect.succeed({ _tag: 'Retry', error }) : Effect.fail(error);
          },
          onSuccess: response =>
            Effect.gen(function* () {
              const retryable =
                response.status === 429 ||
                response.status === 403 ||
                (response.status >= 500 && method === 'GET');
              if (!retryable) return { _tag: 'Done', response } satisfies Attempt;
              const text = yield* response.text.pipe(Effect.orElseSucceed(() => ''));
              if (response.status === 403 && !isRateLimited(response, text))
                return yield* failure(method, path, response, text);
              return {
                _tag: 'Retry',
                error: failure(method, path, response, text),
                delayMs: requestedDelayMs(response, Date.now()),
              } satisfies Attempt;
            }),
        })
      );
    const send = (
      method: HttpMethod,
      path: string,
      body: unknown,
      redirect: RequestRedirect,
      accept = 'application/vnd.github+json'
    ) =>
      Effect.gen(function* () {
        yield* ensure(path.startsWith('/') && !path.startsWith('//'), 'Expected a GitHub API path');
        for (let tries = 1; ; tries++) {
          const outcome = yield* attempt(method, path, body, redirect, accept);
          if (outcome._tag === 'Done') return outcome.response;
          const delayMs = outcome.delayMs ?? policy.baseDelayMs * 2 ** (tries - 1);
          if (tries >= policy.attempts || delayMs > policy.maxDelayMs)
            return yield* new GitHubApiError({
              ...outcome.error,
              message: `${outcome.error.message}; gave up after ${tries} attempt${tries === 1 ? '' : 's'}`,
            });
          yield* Effect.sleep(delayMs);
        }
      });
    const failResponse = (
      method: HttpMethod,
      path: string,
      response: HttpClientResponse.HttpClientResponse
    ) =>
      Effect.flatMap(response.text.pipe(Effect.orElseSucceed(() => '')), text =>
        Effect.fail(failure(method, path, response, text))
      );
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
            return yield* failResponse(method, path, response);
          return yield* decodeBody(schema, yield* response.text, method, path);
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
            return yield* failResponse('GET', path, response);
          return Option.some(yield* response.text);
        }),
      /** Resolves an endpoint that answers with a 302 to short-lived storage, such as an artifact archive. */
      redirectLocation: (path: string) =>
        Effect.gen(function* () {
          const response = yield* send('GET', path, undefined, 'manual');
          if (response.status !== 302) return yield* failResponse('GET', path, response);
          return Option.fromNullishOr(response.headers.location);
        }),
    };
  });

/** The controller's GitHub App installation client. Only trusted controller entry points provide it. */
export class GitHub extends Context.Service<
  GitHub,
  Effect.Success<ReturnType<typeof makeGitHub>>
>()('sdk-release/GitHub') {
  static readonly layer = (token: string, retry: Partial<RetryPolicy> = {}) =>
    Layer.effect(GitHub, makeGitHub(token, { ...DEFAULT_RETRY, ...retry }));
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
      JobsPage,
      body => body.jobs
    )
  );
