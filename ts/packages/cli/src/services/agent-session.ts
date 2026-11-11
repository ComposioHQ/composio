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

/**
 * Picks the chat this process runs in from the agent session variables.
 *
 * The pair a plugin hook exported wins, because child processes inherit it: a host started
 * inside another host's chat still reports the parent chat. An export that names an unknown
 * host, or that lacks one of its two variables, is ignored. Without an export, the host whose
 * own variable is set is used; variables from both hosts cannot be ordered, so they select
 * nothing. Blank variables already read as `undefined` (see `HOST_CONFIG`).
 *
 * This reads no telemetry switch. Callers go through `resolveAgentSession`.
 */
export const selectHostSession = (env: AgentSessionEnvironment): Option.Option<HostSession> => {
  const hookHost = AGENT_HOSTS.find(host => host === env.hookHost);
  if (hookHost !== undefined && env.hookSessionId !== undefined) {
    return Option.some({ host: hookHost, hostSessionId: env.hookSessionId });
  }
  const claudeSessionId = env.claudeCodeSessionId;
  const codexSessionId = env.codexSessionId ?? env.codexThreadId;
  if (claudeSessionId !== undefined && codexSessionId === undefined) {
    return Option.some({ host: 'claude', hostSessionId: claudeSessionId });
  }
  if (codexSessionId !== undefined && claudeSessionId === undefined) {
    return Option.some({ host: 'codex', hostSessionId: codexSessionId });
  }
  return Option.none();
};

// A fixed namespace, so any system that holds a host and its session ID derives the same ID.
const deriveInAgentSessionNamespace = uuidv5.namespace('377a1a01-b6e5-5f6e-ae1c-a874a3316d89');

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

/**
 * The request headers that carry an agent session. Only the backend client, the Dashboard
 * execution client, and the `composio run` proxy helper send them.
 */
export const agentSessionHeaders = (session: AgentSession): Record<string, string> => ({
  'x-cli-agent-session-host': session.host,
  'x-cli-agent-session-id': session.id,
});
