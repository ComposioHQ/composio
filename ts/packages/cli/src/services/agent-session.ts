import { Effect, Option } from 'effect';
import { uuidv5 } from 'uniku/uuid/v5';
import { HOST_CONFIG, telemetryDisabled, type AgentSessionEnvironment } from 'src/config';
import { AGENT_HOSTS, type AgentHost } from './agent-host';

/** A chat as its agent host identifies it. The host's ID stays on this device. */
export type HostSession = {
  readonly host: AgentHost;
  readonly hostSessionId: string;
};

/** The agent session a command is part of: the host, and the ID derived for its chat. */
export type AgentSession = {
  readonly host: AgentHost;
  readonly id: string;
};

/** The pair a plugin hook exported, when it names a known host and carries a session ID. */
const exportedSession = (env: AgentSessionEnvironment): Option.Option<HostSession> =>
  Option.all({
    host: Option.fromUndefinedOr(AGENT_HOSTS.find(host => host === env.hookHost)),
    hostSessionId: Option.fromUndefinedOr(env.hookSessionId),
  });

/** Each host's own session ID. Codex versions without `CODEX_SESSION_ID` set only a thread ID. */
const ownSessionIds = (env: AgentSessionEnvironment): Record<AgentHost, string | undefined> => ({
  claude: env.claudeCodeSessionId,
  codex: env.codexSessionId ?? env.codexThreadId,
});

/** The one host whose own variable is set. Two hosts cannot be ordered, so they give none. */
const soleOwnSession = (env: AgentSessionEnvironment): Option.Option<HostSession> => {
  const ids = ownSessionIds(env);
  const [session, ...others] = AGENT_HOSTS.flatMap((host): ReadonlyArray<HostSession> => {
    const hostSessionId = ids[host];
    return hostSessionId === undefined ? [] : [{ host, hostSessionId }];
  });
  return session !== undefined && others.length === 0 ? Option.some(session) : Option.none();
};

/**
 * Picks the chat this process runs in from the agent session variables.
 *
 * The pair a plugin hook exported wins, because child processes inherit it: a host started
 * inside another host's chat still reports the parent chat. Without a usable export, the one
 * host whose own variable is set is used. Blank variables already read as `undefined` (see
 * `HOST_CONFIG`).
 *
 * This reads no telemetry switch. Callers go through `resolveAgentSession`.
 */
export const selectHostSession = (env: AgentSessionEnvironment): Option.Option<HostSession> =>
  Option.orElse(exportedSession(env), () => soleOwnSession(env));

/**
 * The namespace every agent session ID is derived under. A UUID v5 needs one, and this one is
 * itself the UUID v5 of the name below under the RFC 9562 URL namespace, so nothing here is
 * an arbitrary number. The name labels the scheme and does not have to resolve. `uuidv5.NIL`
 * or `uuidv5.MAX` would be accepted too, but they belong to no one: any other system hashing
 * the same `<host>:<id>` name under them would produce our IDs.
 *
 * Frozen. Another name changes every derived ID and splits each chat in two. Any system that
 * holds a host and its session ID derives the same ID from this value.
 */
export const AGENT_SESSION_NAMESPACE = uuidv5(
  'https://composio.dev/ns/agent-session/v1',
  uuidv5.URL
);

const deriveInAgentSessionNamespace = uuidv5.namespace(AGENT_SESSION_NAMESPACE);

/**
 * The UUID v5 of `<host>:<host session ID>`. Surrounding whitespace was dropped when the
 * variables were read (see `HOST_CONFIG`); nothing else is changed, letter case included.
 */
export const deriveAgentSessionId = ({ host, hostSessionId }: HostSession): string =>
  deriveInAgentSessionNamespace(`${host}:${hostSessionId}`);

/**
 * The agent session this command is part of, or none outside a known agent host.
 *
 * Telemetry is checked here, before any session variable is read, so every consumer resolves
 * none while an opt-out, a test run, or CI disables it. The result never carries the host's
 * own session ID.
 */
export const resolveAgentSession: Effect.Effect<Option.Option<AgentSession>> = Effect.gen(
  function* () {
    if (yield* telemetryDisabled) {
      return Option.none();
    }
    const hostSession = selectHostSession(yield* Effect.orDie(HOST_CONFIG.AGENT_SESSION));
    return Option.map(hostSession, session => ({
      host: session.host,
      id: deriveAgentSessionId(session),
    }));
  }
);
