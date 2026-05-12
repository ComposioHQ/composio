import { FileSystem } from '@effect/platform';
import { Data, Effect, Option } from 'effect';
import path from 'node:path';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { ComposioUserContext } from 'src/services/user-context';
import { primeConsumerConnectedToolkitsCacheInBackground } from 'src/services/consumer-short-term-cache';

export const AGENT_CONFIG_FILE_NAME = 'agent.json';
export const DEFAULT_AGENTS_BASE_URL = 'https://agents.composio.dev';

export type AgentStatus = 'READY' | 'PENDING' | 'UNKNOWN';

export interface AgentComposioCredentials {
  readonly member_id?: string;
  readonly org_id?: string;
  readonly project_id?: string;
  readonly api_key?: string;
  readonly user_api_key?: string;
}

export interface AgentIdentity {
  readonly status?: string;
  readonly request_id?: string;
  readonly slug?: string;
  readonly email?: string;
  readonly agent_key?: string;
  readonly composio_agent_key?: string;
  readonly claimed_by?: string | null;
  readonly claimed_at?: string | null;
  readonly composio?: AgentComposioCredentials;
  readonly [key: string]: unknown;
}

export interface AgentMailMessage {
  readonly id?: string;
  readonly thread_id?: string;
  readonly from?: string;
  readonly to?: string;
  readonly subject?: string;
  readonly preview?: string;
  readonly received_at?: string;
  readonly [key: string]: unknown;
}

export interface AgentMailResponse {
  readonly count?: number;
  readonly messages?: ReadonlyArray<AgentMailMessage>;
  readonly [key: string]: unknown;
}

export interface AgentClaimResponse {
  readonly status?: string;
  readonly email?: string;
  readonly org_id?: string;
  readonly invite_code?: string;
  readonly [key: string]: unknown;
}

export class AgentAuthError extends Data.TaggedError('services/AgentAuthError')<{
  readonly message: string;
  readonly nextSteps: ReadonlyArray<string>;
}> {}

const agentsBaseURL = (): string =>
  (process.env.COMPOSIO_AGENTS_BASE_URL ?? DEFAULT_AGENTS_BASE_URL).replace(/\/+$/, '');

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const readJson = (value: string): unknown => JSON.parse(value) as unknown;

export const normalizeAgentStatus = (status: string | undefined): AgentStatus => {
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

export const normalizeAgentIdentity = (
  payload: unknown,
  fallbackAgentKey?: string
): AgentIdentity => {
  const record = asRecord(payload);
  const agentKey =
    (typeof record.composio_agent_key === 'string' ? record.composio_agent_key : undefined) ??
    (typeof record.agent_key === 'string' ? record.agent_key : undefined) ??
    fallbackAgentKey;

  const normalized: Record<string, unknown> = { ...record };
  if (agentKey) {
    normalized.agent_key = agentKey;
    normalized.composio_agent_key = agentKey;
  }

  return normalized as AgentIdentity;
};

export const safeAgentSummary = (identity: AgentIdentity) => ({
  account_type: 'agent' as const,
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
  const cacheDir = yield* setupCacheDir;
  return path.join(cacheDir, AGENT_CONFIG_FILE_NAME);
});

export const readStoredAgentIdentity = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const configPath = yield* agentConfigPath;

  const exists = yield* fs.exists(configPath);
  if (!exists) return Option.none<AgentIdentity>();

  return yield* fs.readFileString(configPath, 'utf8').pipe(
    Effect.map(raw => Option.some(normalizeAgentIdentity(readJson(raw)))),
    Effect.catchAll(error =>
      Effect.gen(function* () {
        yield* Effect.logDebug('Failed to read agent identity:', error);
        return Option.none<AgentIdentity>();
      })
    )
  );
});

export const writeStoredAgentIdentity = (identity: AgentIdentity) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const configPath = yield* agentConfigPath;
    const normalized = normalizeAgentIdentity(identity);
    yield* fs.writeFileString(configPath, `${JSON.stringify(normalized, null, 2)}\n`);
    return normalized;
  });

export const removeStoredAgentIdentity = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const configPath = yield* agentConfigPath;
  yield* fs.remove(configPath).pipe(Effect.catchAll(() => Effect.void));
});

const fetchAgentJson = (pathname: string, init: RequestInit = {}) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(`${agentsBaseURL()}${pathname}`, {
        redirect: 'error',
        ...init,
        headers: {
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init.headers ?? {}),
        },
      });

      const text = await response.text();
      const payload = text ? (JSON.parse(text) as unknown) : {};
      if (!response.ok) {
        const message =
          typeof asRecord(payload).message === 'string'
            ? (asRecord(payload).message as string)
            : `agents.composio.dev request failed with HTTP ${response.status}`;
        throw new Error(message);
      }
      return payload;
    },
    catch: error => (error instanceof Error ? error : new Error(String(error))),
  });

export const signupAgent = (params: { wait?: boolean } = {}) =>
  Effect.gen(function* () {
    const wait = params.wait ?? true;
    const payload = yield* fetchAgentJson(`/api/signup${wait ? '' : '?wait=0'}`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    return yield* writeStoredAgentIdentity(normalizeAgentIdentity(payload));
  });

export const fetchAgentWhoami = (agentKey: string) =>
  Effect.gen(function* () {
    const payload = yield* fetchAgentJson('/api/whoami', {
      method: 'GET',
      headers: { Authorization: `Bearer ${agentKey}` },
    });
    return normalizeAgentIdentity(payload, agentKey);
  });

export const fetchAgentInbox = (params: { agentKey: string; limit?: number }) =>
  fetchAgentJson(`/api/mail?limit=${encodeURIComponent(String(params.limit ?? 50))}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${params.agentKey}` },
  }).pipe(Effect.map(payload => payload as AgentMailResponse));

export const claimAgent = (params: { agentKey: string; email: string }) =>
  fetchAgentJson('/api/claim', {
    method: 'POST',
    headers: { Authorization: `Bearer ${params.agentKey}` },
    body: JSON.stringify({ email: params.email }),
  }).pipe(Effect.map(payload => payload as AgentClaimResponse));

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

  return yield* Effect.fail(humanLoginError());
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
      return getAgentKey(stored.value) as string;
    }

    return yield* Effect.fail(humanLoginError());
  }

  if (Option.isNone(stored)) {
    return yield* Effect.fail(
      new AgentAuthError({
        message: 'No Composio agent identity is saved on this machine.',
        nextSteps: [
          'To create a new agent: run `composio signup` or `composio agent signup`.',
          'To restore an existing agent: run `composio agent login <composio_agent_key>`.',
        ],
      })
    );
  }

  const agentKey = getAgentKey(stored.value);
  if (!agentKey) {
    return yield* Effect.fail(
      new AgentAuthError({
        message: 'The saved Composio agent identity is missing its composio_agent_key.',
        nextSteps: [
          'If you saved the key, run `composio agent login <composio_agent_key>`.',
          'Otherwise create a new agent with `composio signup`.',
        ],
      })
    );
  }

  return agentKey;
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
      return yield* Effect.fail(
        new Error(
          'Agent identity is not ready yet. Run `composio agent whoami` and try again once status is READY.'
        )
      );
    }

    yield* ctx.login(userApiKey, orgId);
    yield* primeConsumerConnectedToolkitsCacheInBackground({ orgId });
  });
