import { FileSystem, Path } from '@effect/platform';
import { Data, Effect, Either, Option, Predicate, Schema } from 'effect';
import { APP_CONFIG } from 'src/effects/app-config';
import { JsonRecordSchema } from 'src/effects/json';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { ComposioUserContext } from 'src/services/user-context';
import { getSessionInfoByUserApiKey } from 'src/services/composio-clients';
import { primeConsumerConnectedToolkitsCacheInBackground } from 'src/services/consumer-short-term-cache';
import { linkApolloIdentityForAnalytics } from 'src/analytics/dispatch';

export const AGENT_CONFIG_FILE_NAME = 'agent.json';
export const DEFAULT_AGENTS_BASE_URL = 'https://agents.composio.dev';

export type AgentStatus = 'READY' | 'PENDING' | 'UNKNOWN';

const UnknownFields = JsonRecordSchema;

const AgentComposioCredentials = Schema.Struct({
  member_id: Schema.optional(Schema.NullOr(Schema.String)),
  org_id: Schema.optional(Schema.NullOr(Schema.String)),
  project_id: Schema.optional(Schema.NullOr(Schema.String)),
  api_key: Schema.optional(Schema.NullOr(Schema.String)),
  user_api_key: Schema.optional(Schema.NullOr(Schema.String)),
}).pipe(Schema.extend(UnknownFields));
export type AgentComposioCredentials = Schema.Schema.Type<typeof AgentComposioCredentials>;

const AgentIdentity = Schema.Struct({
  status: Schema.optional(Schema.NullOr(Schema.String)),
  request_id: Schema.optional(Schema.NullOr(Schema.String)),
  slug: Schema.optional(Schema.NullOr(Schema.String)),
  email: Schema.optional(Schema.NullOr(Schema.String)),
  agent_key: Schema.optional(Schema.NullOr(Schema.String)),
  composio_agent_key: Schema.optional(Schema.NullOr(Schema.String)),
  claimed_by: Schema.optional(Schema.NullOr(Schema.String)),
  claimed_at: Schema.optional(Schema.NullOr(Schema.String)),
  composio: Schema.optional(AgentComposioCredentials),
}).pipe(Schema.extend(UnknownFields));
export type AgentIdentity = Schema.Schema.Type<typeof AgentIdentity>;

const AgentMailMessage = Schema.Struct({
  id: Schema.optional(Schema.NullOr(Schema.String)),
  thread_id: Schema.optional(Schema.NullOr(Schema.String)),
  from: Schema.optional(Schema.NullOr(Schema.String)),
  to: Schema.optional(Schema.NullOr(Schema.String)),
  subject: Schema.optional(Schema.NullOr(Schema.String)),
  preview: Schema.optional(Schema.NullOr(Schema.String)),
  received_at: Schema.optional(Schema.NullOr(Schema.String)),
}).pipe(Schema.extend(UnknownFields));
export type AgentMailMessage = Schema.Schema.Type<typeof AgentMailMessage>;

const AgentMailResponse = Schema.Struct({
  count: Schema.optional(Schema.Number),
  messages: Schema.optional(Schema.Array(AgentMailMessage)),
}).pipe(Schema.extend(UnknownFields));
export type AgentMailResponse = Schema.Schema.Type<typeof AgentMailResponse>;

const AgentClaimResponse = Schema.Struct({
  status: Schema.optional(Schema.NullOr(Schema.String)),
  email: Schema.optional(Schema.NullOr(Schema.String)),
  org_id: Schema.optional(Schema.NullOr(Schema.String)),
  invite_code: Schema.optional(Schema.NullOr(Schema.String)),
}).pipe(Schema.extend(UnknownFields));
export type AgentClaimResponse = Schema.Schema.Type<typeof AgentClaimResponse>;

export class AgentAuthError extends Data.TaggedError('services/AgentAuthError')<{
  readonly message: string;
  readonly nextSteps: ReadonlyArray<string>;
}> {}

export class AgentRequestError extends Data.TaggedError('services/AgentRequestError')<{
  readonly message: string;
  readonly pathname: string;
  readonly status?: number;
  readonly cause?: unknown;
}> {}

export class AgentResponseDecodeError extends Data.TaggedError(
  'services/AgentResponseDecodeError'
)<{
  readonly message: string;
  readonly pathname: string;
  readonly cause: unknown;
}> {}

const agentsBaseURL = APP_CONFIG.AGENTS_BASE_URL.pipe(
  Effect.orDie,
  Effect.map(value => (value ?? DEFAULT_AGENTS_BASE_URL).replace(/\/+$/, ''))
);

const decodeAgentResponse =
  <A, I>(pathname: string, schema: Schema.Schema<A, I>) =>
  (payload: unknown) =>
    Schema.decodeUnknown(schema)(payload).pipe(
      Effect.mapError(
        cause =>
          new AgentResponseDecodeError({
            message: `agents.composio.dev returned an invalid response for ${pathname}`,
            pathname,
            cause,
          })
      )
    );

export const normalizeAgentStatus = (status: string | null | undefined): AgentStatus => {
  const normalized = status?.trim().toUpperCase();
  if (normalized === 'READY') return 'READY';
  if (normalized === 'PENDING') return 'PENDING';
  return 'UNKNOWN';
};

export const getAgentKey = (identity: AgentIdentity): string | undefined => {
  if (typeof identity.composio_agent_key === 'string') return identity.composio_agent_key;
  if (typeof identity.agent_key === 'string') return identity.agent_key;
  return undefined;
};

export const isAgentIdentityForApiKey = (identity: AgentIdentity, apiKey: string): boolean =>
  Boolean(getAgentKey(identity) && identity.composio?.user_api_key === apiKey);

const normalizeDecodedAgentIdentity = (
  identity: AgentIdentity,
  fallbackAgentKey?: string
): AgentIdentity => {
  const agentKey = identity.composio_agent_key ?? identity.agent_key ?? fallbackAgentKey;

  return agentKey ? { ...identity, agent_key: agentKey, composio_agent_key: agentKey } : identity;
};

export const normalizeAgentIdentity = (
  payload: unknown,
  fallbackAgentKey?: string
): AgentIdentity =>
  normalizeDecodedAgentIdentity(
    Schema.decodeUnknownOption(AgentIdentity)(payload).pipe(
      Option.getOrElse((): AgentIdentity => ({}))
    ),
    fallbackAgentKey
  );

type SafeAgentSummary = {
  readonly account_type: 'agent';
  readonly status: AgentStatus;
  readonly slug: string | null;
  readonly email: string | null;
  readonly org_id: string | null;
  readonly project_id: string | null;
  readonly member_id: string | null;
  readonly claimed_by: string | null;
  readonly claimed_at: string | null;
};

export const safeAgentSummary = (identity: AgentIdentity): SafeAgentSummary => ({
  account_type: 'agent',
  status: normalizeAgentStatus(identity.status),
  slug: identity.slug ?? null,
  email: identity.email ?? null,
  org_id: identity.composio?.org_id ?? null,
  project_id: identity.composio?.project_id ?? null,
  member_id: identity.composio?.member_id ?? null,
  claimed_by: identity.claimed_by ?? null,
  claimed_at: identity.claimed_at ?? null,
});

export const agentConfigPath = Effect.gen(function* () {
  const path = yield* Path.Path;
  const cacheDir = yield* setupCacheDir;
  return path.join(cacheDir, AGENT_CONFIG_FILE_NAME);
});

export const readStoredAgentIdentity = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const configPath = yield* agentConfigPath;

  const exists = yield* fs.exists(configPath);
  if (!exists) return Option.none<AgentIdentity>();

  return yield* fs.readFileString(configPath, 'utf8').pipe(
    Effect.flatMap(Schema.decodeUnknown(Schema.parseJson(AgentIdentity))),
    Effect.map(normalizeDecodedAgentIdentity),
    Effect.tapError(error => Effect.logDebug('Failed to read agent identity:', error)),
    Effect.option
  );
});

export const writeStoredAgentIdentity = (identity: AgentIdentity) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const configPath = yield* agentConfigPath;
    const normalized = normalizeDecodedAgentIdentity(identity);
    yield* fs.writeFileString(configPath, `${JSON.stringify(normalized, null, 2)}\n`);
    return normalized;
  });

export const removeStoredAgentIdentity = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const configPath = yield* agentConfigPath;
  yield* fs.remove(configPath).pipe(Effect.ignore);
});

const fetchAgentJson = (pathname: string, init: RequestInit = {}) =>
  Effect.gen(function* () {
    const baseURL = yield* agentsBaseURL;
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(`${baseURL}${pathname}`, {
          redirect: 'error',
          ...init,
          headers: {
            Accept: 'application/json',
            ...(init.body ? { 'Content-Type': 'application/json' } : {}),
            ...(init.headers ?? {}),
          },
        }),
      catch: cause =>
        new AgentRequestError({
          message: `agents.composio.dev request failed for ${pathname}`,
          pathname,
          cause,
        }),
    });

    const text = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: cause =>
        new AgentRequestError({
          message: `Failed to read agents.composio.dev response for ${pathname}`,
          pathname,
          status: response.status,
          cause,
        }),
    });
    const payload = text
      ? yield* Schema.decodeUnknown(Schema.parseJson(Schema.Unknown))(text).pipe(
          Effect.mapError(
            cause =>
              new AgentResponseDecodeError({
                message: `agents.composio.dev returned invalid JSON for ${pathname}`,
                pathname,
                cause,
              })
          )
        )
      : {};

    if (!response.ok) {
      const message =
        Predicate.isRecord(payload) && typeof payload.message === 'string'
          ? payload.message
          : `agents.composio.dev request failed with HTTP ${response.status}`;
      return yield* new AgentRequestError({
        message,
        pathname,
        status: response.status,
      });
    }

    return payload;
  });

export const signupAgent = (params: { wait?: boolean } = {}) =>
  Effect.gen(function* () {
    const wait = params.wait ?? true;
    const payload = yield* fetchAgentJson(`/api/signup${wait ? '' : '?wait=0'}`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const identity = yield* decodeAgentResponse('/api/signup', AgentIdentity)(payload);
    return yield* writeStoredAgentIdentity(identity);
  });

export const fetchAgentWhoami = (agentKey: string) =>
  Effect.gen(function* () {
    const payload = yield* fetchAgentJson('/api/whoami', {
      method: 'GET',
      headers: { Authorization: `Bearer ${agentKey}` },
    });
    const identity = yield* decodeAgentResponse('/api/whoami', AgentIdentity)(payload);
    return normalizeDecodedAgentIdentity(identity, agentKey);
  });

export const fetchAgentInbox = (params: { agentKey: string; limit?: number }) =>
  Effect.gen(function* () {
    const pathname = `/api/mail?limit=${encodeURIComponent(String(params.limit ?? 50))}`;
    const payload = yield* fetchAgentJson(pathname, {
      method: 'GET',
      headers: { Authorization: `Bearer ${params.agentKey}` },
    });
    return yield* decodeAgentResponse(pathname, AgentMailResponse)(payload);
  });

export const claimAgent = (params: { agentKey: string; email: string }) =>
  Effect.gen(function* () {
    const pathname = '/api/claim';
    const payload = yield* fetchAgentJson(pathname, {
      method: 'POST',
      headers: { Authorization: `Bearer ${params.agentKey}` },
      body: JSON.stringify({ email: params.email }),
    });
    return yield* decodeAgentResponse(pathname, AgentClaimResponse)(payload);
  });

const humanLoginError = () =>
  new AgentAuthError({
    message: 'This CLI is currently signed in to Composio as a regular user, not an agent.',
    nextSteps: [
      'To switch to an existing agent: run `composio logout`, then `composio agent login <composio_agent_key>`.',
      'To create a new agent: run `composio logout`, then `composio signup`.',
    ],
  });

export const ensureAgentSignupAllowed = Effect.gen(function* () {
  const ctx = yield* ComposioUserContext;
  const apiKey = ctx.data.apiKey;
  if (Option.isNone(apiKey)) return;

  const stored = yield* readStoredAgentIdentity;
  if (Option.isSome(stored) && isAgentIdentityForApiKey(stored.value, apiKey.value)) return;

  return yield* humanLoginError();
});

export const getCurrentLoggedInAgent = Effect.gen(function* () {
  const ctx = yield* ComposioUserContext;
  const currentApiKey = ctx.data.apiKey;
  if (Option.isNone(currentApiKey)) return Option.none<AgentIdentity>();

  const stored = yield* readStoredAgentIdentity;
  if (Option.isNone(stored)) return Option.none<AgentIdentity>();

  return isAgentIdentityForApiKey(stored.value, currentApiKey.value)
    ? stored
    : Option.none<AgentIdentity>();
});

export const resolveStoredAgentKey = Effect.gen(function* () {
  const ctx = yield* ComposioUserContext;
  const stored = yield* readStoredAgentIdentity;
  const currentApiKey = ctx.data.apiKey;

  if (Option.isSome(currentApiKey)) {
    if (Option.isSome(stored) && isAgentIdentityForApiKey(stored.value, currentApiKey.value)) {
      const agentKey = getAgentKey(stored.value);
      if (agentKey) return agentKey;
    }

    return yield* humanLoginError();
  }

  if (Option.isNone(stored)) {
    return yield* new AgentAuthError({
      message: 'No Composio agent identity is saved on this machine.',
      nextSteps: [
        'To create a new agent: run `composio signup` or `composio agent signup`.',
        'To restore an existing agent: run `composio agent login <composio_agent_key>`.',
      ],
    });
  }

  const agentKey = getAgentKey(stored.value);
  if (!agentKey) {
    return yield* new AgentAuthError({
      message: 'The saved Composio agent identity is missing its composio_agent_key.',
      nextSteps: [
        'If you saved the key, run `composio agent login <composio_agent_key>`.',
        'Otherwise create a new agent with `composio signup`.',
      ],
    });
  }

  return agentKey;
});

const isAgentKeyRejection = (error: AgentRequestError | AgentResponseDecodeError): boolean =>
  error instanceof AgentRequestError && (error.status === 401 || error.status === 403);

/**
 * Reuse-only counterpart of {@link getOrSignupReadyAgent}: refreshes and
 * returns a stored READY identity but never signs up a new agent.
 */
export const getStoredReadyAgent = Effect.gen(function* () {
  const stored = yield* readStoredAgentIdentity;
  if (Option.isNone(stored)) return Option.none<AgentIdentity>();

  const agentKey = getAgentKey(stored.value);
  if (!agentKey) return Option.none<AgentIdentity>();

  const remote = yield* fetchAgentWhoami(agentKey).pipe(Effect.either);
  // An auth rejection means the API examined and refused this key — the stored
  // identity is revoked, not unreachable. Only transport-shaped failures may
  // fall back to the on-disk identity.
  if (Either.isLeft(remote) && isAgentKeyRejection(remote.left)) {
    return Option.none<AgentIdentity>();
  }

  const identity = Either.isRight(remote)
    ? yield* writeStoredAgentIdentity(remote.right)
    : stored.value;

  const ready =
    normalizeAgentStatus(identity.status) === 'READY' &&
    Boolean(identity.composio?.user_api_key) &&
    Boolean(identity.composio?.org_id);

  return ready ? Option.some(identity) : Option.none<AgentIdentity>();
});

export const getOrSignupReadyAgent = (params: { force?: boolean } = {}) =>
  Effect.gen(function* () {
    if (!params.force) {
      const stored = yield* readStoredAgentIdentity;
      if (Option.isSome(stored)) {
        const agentKey = getAgentKey(stored.value);
        if (agentKey) {
          const remote = yield* fetchAgentWhoami(agentKey).pipe(Effect.option);
          if (Option.isSome(remote)) {
            const saved = yield* writeStoredAgentIdentity(remote.value);
            if (normalizeAgentStatus(saved.status) === 'READY') return saved;
          }
        }
      }
    }

    return yield* signupAgent({ wait: true });
  });

export const loginWithAgentIdentity = (identity: AgentIdentity) =>
  Effect.gen(function* () {
    const ctx = yield* ComposioUserContext;
    const userApiKey = identity.composio?.user_api_key;
    const orgId = identity.composio?.org_id;

    if (!userApiKey || !orgId) {
      return yield* new AgentAuthError({
        message: 'Agent identity is not ready yet.',
        nextSteps: ['Run `composio agent whoami` and try again once status is READY.'],
      });
    }

    yield* ctx.login(userApiKey, orgId);
    // Best-effort analytics stitch after the credential persists; must never break login.
    yield* getSessionInfoByUserApiKey({ baseURL: ctx.data.baseURL, userApiKey, orgId }).pipe(
      Effect.flatMap(info => linkApolloIdentityForAnalytics(info.org_member.id, userApiKey)),
      Effect.catchAllCause(() => Effect.void)
    );
    yield* primeConsumerConnectedToolkitsCacheInBackground({ orgId });
  });
