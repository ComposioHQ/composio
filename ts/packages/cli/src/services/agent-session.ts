import * as ByteSize from 'effect/ByteSize';
import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import { Effect, Option } from 'effect';
import { uuidv5 } from 'uniku/uuid/v5';
import { HOST_CONFIG, telemetryDisabled, type AgentSessionEnvironment } from 'src/config';
import { USER_COMPOSIO_DIR } from 'src/constants';
import { AGENT_HOSTS, type AgentHost } from './agent-host';
import { NodeOs } from './node-os';

/** A chat as its agent host identifies it. The host's ID stays on this device. */
export type HostSession = {
  readonly host: AgentHost;
  readonly hostSessionId: string;
};

/** The agent session a command is part of: the host, and the ID derived for its chat. */
export type AgentSession = {
  readonly host: AgentHost;
  readonly id: string;
  /**
   * How many times the chat was compacted, as the host's plugin hook recorded it. Unset when
   * the hook keeps no compaction file for the chat, which is not the same as `0`.
   */
  readonly compactionCount?: number;
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
 * Not exported: it reads no telemetry switch and returns the host's own session ID, which
 * only `resolveAgentSession` may hold, after its telemetry check.
 */
const selectHostSession = (env: AgentSessionEnvironment): Option.Option<HostSession> =>
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

const AGENT_COMPACTIONS_DIR = 'agent-compactions';
// A host session ID that is safe as a file name: no path separator, and never `.` or `..`.
const FILE_SAFE_SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;
// A larger file is ignored, not read. One short line per compaction stays far below this.
const MAX_COMPACTION_FILE_SIZE = ByteSize.kibibytes(64);

/**
 * How many compactions the host's plugin hook recorded for a chat: the lines that are not
 * blank in `~/.composio/agent-compactions/<host>/<host session ID>`. The hook creates the
 * file empty when the chat starts and appends one line per compaction; the CLI only reads it
 * (the contract is in the README, under "Agent compaction state"). The directory is under the
 * home directory whatever `COMPOSIO_CACHE_DIR` says, because a hook cannot know that variable.
 *
 * None when the hook wrote no file, and for anything else that is not a readable regular file
 * of at most 64 KiB, so a command never fails on this file and never reads an unbounded one.
 * None too for contents with a NUL character: the file is UTF-8 by contract, and a UTF-16 one,
 * which reads that way, would count its line breaks twice.
 */
const readCompactionCount = ({ host, hostSessionId }: HostSession) =>
  Effect.gen(function* () {
    if (!FILE_SAFE_SESSION_ID.test(hostSessionId)) {
      return Option.none<number>();
    }
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const os = yield* NodeOs;
    const file = path.join(
      os.homedir,
      USER_COMPOSIO_DIR,
      AGENT_COMPACTIONS_DIR,
      host,
      hostSessionId
    );
    const info = yield* fs.stat(file);
    if (info.type !== 'File' || info.size > MAX_COMPACTION_FILE_SIZE) {
      return Option.none<number>();
    }
    const contents = yield* fs.readFileString(file);
    if (contents.includes('\0')) {
      return Option.none<number>();
    }
    return Option.some(contents.split('\n').filter(line => line.trim() !== '').length);
  }).pipe(Effect.catchCause(() => Effect.succeed(Option.none<number>())));

/**
 * The agent session this command is part of, or none outside a known agent host.
 *
 * Telemetry is checked here, before any session variable or the compaction file is read, so
 * every consumer resolves none while an opt-out, a test run, or CI disables it. The result
 * never carries the host's own session ID.
 */
export const resolveAgentSession: Effect.Effect<
  Option.Option<AgentSession>,
  never,
  FileSystem.FileSystem | Path.Path | NodeOs
> = Effect.gen(function* () {
  if (yield* telemetryDisabled) {
    return Option.none();
  }
  const hostSession = selectHostSession(yield* Effect.orDie(HOST_CONFIG.AGENT_SESSION));
  if (Option.isNone(hostSession)) {
    return Option.none();
  }
  const compactionCount = yield* readCompactionCount(hostSession.value);
  return Option.some({
    host: hostSession.value.host,
    id: deriveAgentSessionId(hostSession.value),
    ...Option.match(compactionCount, {
      onNone: () => ({}),
      onSome: count => ({ compactionCount: count }),
    }),
  });
});

/**
 * The request headers that carry an agent session. Only the backend client, the Dashboard
 * execution client, and the `composio run` proxy helper send them.
 */
export const agentSessionHeaders = (session: AgentSession): Record<string, string> => ({
  'x-cli-agent-session-host': session.host,
  'x-cli-agent-session-id': session.id,
  ...(session.compactionCount !== undefined
    ? { 'x-cli-agent-compaction-count': String(session.compactionCount) }
    : {}),
});
