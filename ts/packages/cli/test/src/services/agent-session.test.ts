import { describe, expect, it } from '@effect/vitest';
import { ConfigProvider, Effect, Option } from 'effect';
import { TELEMETRY_CONFIG, type AgentSessionEnvironment } from 'src/config';
import {
  deriveAgentSessionId,
  resolveAgentSession,
  selectHostSession,
  type HostSession,
} from 'src/services/agent-session';

// Made-up host session IDs and the UUID v5 each one derives to.
const CLAUDE_SESSION = '00000000-0000-4000-8000-000000000001';
const CLAUDE_AGENT_SESSION_ID = 'df095fd9-410b-5ec9-b678-4ed04b5ab2dd';
const CODEX_SESSION = '00000000-0000-7000-8000-000000000002';
const CODEX_AGENT_SESSION_ID = '9d27e7e4-b2ed-522c-bed8-595444e853a7';

describe('deriveAgentSessionId', () => {
  it.each([
    { host: 'claude', hostSessionId: CLAUDE_SESSION, expected: CLAUDE_AGENT_SESSION_ID },
    { host: 'codex', hostSessionId: CODEX_SESSION, expected: CODEX_AGENT_SESSION_ID },
  ] as const)(
    '[Given] host $host and session $hostSessionId [Then] the ID is $expected',
    ({ host, hostSessionId, expected }) => {
      expect(deriveAgentSessionId({ host, hostSessionId })).toBe(expected);
    }
  );

  it('[Given] the same session ID in upper case [Then] the ID differs', () => {
    const hostSessionId = 'abcdef00-0000-4000-8000-000000000001';
    expect(
      deriveAgentSessionId({ host: 'claude', hostSessionId: hostSessionId.toUpperCase() })
    ).not.toBe(deriveAgentSessionId({ host: 'claude', hostSessionId }));
  });
});

const NO_VARIABLES: AgentSessionEnvironment = {
  hookHost: undefined,
  hookSessionId: undefined,
  claudeCodeSessionId: undefined,
  codexSessionId: undefined,
  codexThreadId: undefined,
};

type SelectionCase = {
  readonly name: string;
  readonly variables: Partial<AgentSessionEnvironment>;
  readonly expected: HostSession | undefined;
};

const SELECTION_CASES: ReadonlyArray<SelectionCase> = [
  {
    name: 'a hook export for claude and a different CLAUDE_CODE_SESSION_ID: the export wins',
    variables: { hookHost: 'claude', hookSessionId: 'hook-chat', claudeCodeSessionId: 'own-chat' },
    expected: { host: 'claude', hostSessionId: 'hook-chat' },
  },
  {
    name: 'a hook export for claude inside Codex: the parent chat is reported',
    variables: { hookHost: 'claude', hookSessionId: 'hook-chat', codexSessionId: 'codex-chat' },
    expected: { host: 'claude', hostSessionId: 'hook-chat' },
  },
  {
    name: 'a hook export for an unknown host: the export is ignored',
    variables: { hookHost: 'pi', hookSessionId: 'hook-chat', claudeCodeSessionId: 'own-chat' },
    expected: { host: 'claude', hostSessionId: 'own-chat' },
  },
  {
    name: 'a hook host without a hook session ID: treated as no export',
    variables: { hookHost: 'codex', claudeCodeSessionId: 'own-chat' },
    expected: { host: 'claude', hostSessionId: 'own-chat' },
  },
  {
    name: 'a hook session ID without a hook host: treated as no export',
    variables: { hookSessionId: 'hook-chat', codexSessionId: 'codex-chat' },
    expected: { host: 'codex', hostSessionId: 'codex-chat' },
  },
  {
    name: 'only CLAUDE_CODE_SESSION_ID: host claude',
    variables: { claudeCodeSessionId: 'own-chat' },
    expected: { host: 'claude', hostSessionId: 'own-chat' },
  },
  {
    name: 'only CODEX_SESSION_ID: host codex',
    variables: { codexSessionId: 'codex-chat' },
    expected: { host: 'codex', hostSessionId: 'codex-chat' },
  },
  {
    name: 'CODEX_SESSION_ID and a different CODEX_THREAD_ID: the session ID is used',
    variables: { codexSessionId: 'codex-chat', codexThreadId: 'codex-thread' },
    expected: { host: 'codex', hostSessionId: 'codex-chat' },
  },
  {
    name: 'only CODEX_THREAD_ID: host codex with the thread ID',
    variables: { codexThreadId: 'codex-thread' },
    expected: { host: 'codex', hostSessionId: 'codex-thread' },
  },
  {
    name: 'CLAUDE_CODE_SESSION_ID and CODEX_SESSION_ID with no export: none',
    variables: { claudeCodeSessionId: 'own-chat', codexSessionId: 'codex-chat' },
    expected: undefined,
  },
  {
    name: 'CLAUDE_CODE_SESSION_ID and CODEX_THREAD_ID with no export: none',
    variables: { claudeCodeSessionId: 'own-chat', codexThreadId: 'codex-thread' },
    expected: undefined,
  },
  { name: 'no variable: none', variables: {}, expected: undefined },
];

describe('selectHostSession', () => {
  it.each(SELECTION_CASES)('[Given] $name', ({ variables, expected }) => {
    expect(
      Option.getOrUndefined(selectHostSession({ ...NO_VARIABLES, ...variables }))
    ).toStrictEqual(expected);
  });
});

// Each record is the whole environment the resolver sees, so the shell that runs the suite
// (its `NODE_ENV=test`, `CI`, and agent-host session variables) cannot change a result.
const isolatedEnvironment = (env: Record<string, string>) => ConfigProvider.fromEnvRecord(env);

const resolveWith = (env: Record<string, string>) =>
  resolveAgentSession.pipe(
    Effect.provideService(ConfigProvider.ConfigProvider, isolatedEnvironment(env)),
    Effect.map(Option.getOrUndefined)
  );

const TELEMETRY_ON = { CI: 'false', NODE_ENV: 'production' };

describe('resolveAgentSession', () => {
  it.effect('[Given] CLAUDE_CODE_SESSION_ID [Then] it resolves claude and the derived ID', () =>
    Effect.gen(function* () {
      const actual = yield* resolveWith({
        ...TELEMETRY_ON,
        CLAUDE_CODE_SESSION_ID: CLAUDE_SESSION,
      });
      expect(actual).toStrictEqual({ host: 'claude', id: CLAUDE_AGENT_SESSION_ID });
    })
  );

  it.effect('[Given] CODEX_THREAD_ID alone [Then] it resolves codex and the derived ID', () =>
    Effect.gen(function* () {
      const actual = yield* resolveWith({ ...TELEMETRY_ON, CODEX_THREAD_ID: CODEX_SESSION });
      expect(actual).toStrictEqual({ host: 'codex', id: CODEX_AGENT_SESSION_ID });
    })
  );

  it.effect('[Given] a hook export inside another host [Then] it resolves the exported chat', () =>
    Effect.gen(function* () {
      const actual = yield* resolveWith({
        ...TELEMETRY_ON,
        COMPOSIO_AGENT_HOST: 'claude',
        COMPOSIO_AGENT_SESSION_ID: CLAUDE_SESSION,
        CODEX_SESSION_ID: CODEX_SESSION,
      });
      expect(actual).toStrictEqual({ host: 'claude', id: CLAUDE_AGENT_SESSION_ID });
    })
  );

  it.effect('[Given] variables from both hosts and no export [Then] it resolves none', () =>
    Effect.gen(function* () {
      const actual = yield* resolveWith({
        ...TELEMETRY_ON,
        CLAUDE_CODE_SESSION_ID: CLAUDE_SESSION,
        CODEX_SESSION_ID: CODEX_SESSION,
      });
      expect(actual).toBeUndefined();
    })
  );

  it.effect('[Given] no agent session variable [Then] it resolves none', () =>
    Effect.gen(function* () {
      expect(yield* resolveWith(TELEMETRY_ON)).toBeUndefined();
    })
  );

  it.effect.each([
    { name: 'COMPOSIO_CLI_TELEMETRY_DISABLED', value: '1' },
    { name: 'COMPOSIO_DISABLE_TELEMETRY', value: 'true' },
    { name: 'TELEMETRY_DISABLED', value: '1' },
    { name: 'CI', value: 'true' },
    { name: 'NODE_ENV', value: 'test' },
  ])('[Given] telemetry disabled by $name=$value [Then] it resolves none', ({ name, value }) =>
    Effect.gen(function* () {
      const actual = yield* resolveWith({
        ...TELEMETRY_ON,
        CLAUDE_CODE_SESSION_ID: CLAUDE_SESSION,
        [name]: value,
      });
      expect(actual).toBeUndefined();
    })
  );

  it.effect('[Given] telemetry enabled and no PostHog key [Then] it still resolves', () =>
    Effect.gen(function* () {
      const env = { ...TELEMETRY_ON, CLAUDE_CODE_SESSION_ID: CLAUDE_SESSION };
      expect(yield* TELEMETRY_CONFIG.POSTHOG_PROJECT_API_KEY.parse(isolatedEnvironment(env))).toBe(
        ''
      );
      expect(yield* resolveWith(env)).toStrictEqual({
        host: 'claude',
        id: CLAUDE_AGENT_SESSION_ID,
      });
    })
  );
});
