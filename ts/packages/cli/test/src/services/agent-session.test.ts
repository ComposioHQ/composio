import { describe, expect, it } from '@effect/vitest';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import { Array as Arr, ConfigProvider, Effect, Layer, Option, PlatformError, pipe } from 'effect';
import * as tempy from 'tempy';
import { TELEMETRY_CONFIG } from 'src/config';
import {
  agentSessionHeaders,
  deriveAgentSessionId,
  resolveAgentSession,
  type HostSession,
} from 'src/services/agent-session';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';

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

type SelectionCase = {
  readonly name: string;
  readonly variables: Record<string, string>;
  readonly expected: HostSession | undefined;
};

const SELECTION_CASES: ReadonlyArray<SelectionCase> = [
  {
    name: 'a hook export for claude and a different CLAUDE_CODE_SESSION_ID: the export wins',
    variables: {
      COMPOSIO_AGENT_HOST: 'claude',
      COMPOSIO_AGENT_SESSION_ID: 'hook-chat',
      CLAUDE_CODE_SESSION_ID: 'own-chat',
    },
    expected: { host: 'claude', hostSessionId: 'hook-chat' },
  },
  {
    name: 'a hook export for codex and a different CLAUDE_CODE_SESSION_ID: the export wins',
    variables: {
      COMPOSIO_AGENT_HOST: 'codex',
      COMPOSIO_AGENT_SESSION_ID: 'hook-chat',
      CLAUDE_CODE_SESSION_ID: 'own-chat',
    },
    expected: { host: 'codex', hostSessionId: 'hook-chat' },
  },
  {
    name: 'a hook export for claude inside Codex: the parent chat is reported',
    variables: {
      COMPOSIO_AGENT_HOST: 'claude',
      COMPOSIO_AGENT_SESSION_ID: 'hook-chat',
      CODEX_SESSION_ID: 'codex-chat',
    },
    expected: { host: 'claude', hostSessionId: 'hook-chat' },
  },
  {
    name: 'a hook export for an unknown host: the export is ignored',
    variables: {
      COMPOSIO_AGENT_HOST: 'pi',
      COMPOSIO_AGENT_SESSION_ID: 'hook-chat',
      CLAUDE_CODE_SESSION_ID: 'own-chat',
    },
    expected: { host: 'claude', hostSessionId: 'own-chat' },
  },
  {
    name: 'a hook host without a hook session ID: treated as no export',
    variables: { COMPOSIO_AGENT_HOST: 'codex', CLAUDE_CODE_SESSION_ID: 'own-chat' },
    expected: { host: 'claude', hostSessionId: 'own-chat' },
  },
  {
    name: 'a hook session ID without a hook host: treated as no export',
    variables: { COMPOSIO_AGENT_SESSION_ID: 'hook-chat', CODEX_SESSION_ID: 'codex-chat' },
    expected: { host: 'codex', hostSessionId: 'codex-chat' },
  },
  {
    name: 'only CLAUDE_CODE_SESSION_ID: host claude',
    variables: { CLAUDE_CODE_SESSION_ID: 'own-chat' },
    expected: { host: 'claude', hostSessionId: 'own-chat' },
  },
  {
    name: 'only CODEX_SESSION_ID: host codex',
    variables: { CODEX_SESSION_ID: 'codex-chat' },
    expected: { host: 'codex', hostSessionId: 'codex-chat' },
  },
  {
    name: 'CODEX_SESSION_ID and a different CODEX_THREAD_ID: the session ID is used',
    variables: { CODEX_SESSION_ID: 'codex-chat', CODEX_THREAD_ID: 'codex-thread' },
    expected: { host: 'codex', hostSessionId: 'codex-chat' },
  },
  {
    name: 'only CODEX_THREAD_ID: host codex with the thread ID',
    variables: { CODEX_THREAD_ID: 'codex-thread' },
    expected: { host: 'codex', hostSessionId: 'codex-thread' },
  },
  {
    name: 'CLAUDE_CODE_SESSION_ID and CODEX_SESSION_ID with no export: none',
    variables: { CLAUDE_CODE_SESSION_ID: 'own-chat', CODEX_SESSION_ID: 'codex-chat' },
    expected: undefined,
  },
  {
    name: 'CLAUDE_CODE_SESSION_ID and CODEX_THREAD_ID with no export: none',
    variables: { CLAUDE_CODE_SESSION_ID: 'own-chat', CODEX_THREAD_ID: 'codex-thread' },
    expected: undefined,
  },
  { name: 'no variable: none', variables: {}, expected: undefined },
];

// Each record is the whole environment the resolver sees, so the shell that runs the suite
// (its `NODE_ENV=test`, `CI`, and agent-host session variables) cannot change a result.
const isolatedEnvironment = (env: Record<string, string>) => ConfigProvider.fromEnvRecord(env);

// The home directory of every resolution that names none: a new one, with no compaction file.
const EMPTY_HOME = tempy.temporaryDirectory();

type Surroundings = {
  /** The home directory the resolver is given. No test reads the real one. */
  readonly home?: string;
  /** A file whose read fails, the way a file this user may not read does. */
  readonly unreadable?: string;
};

/**
 * The real file system, recording each path the resolver looks at or reads. The test of a
 * missing file pins the one path it records, so a resolver that read some other way would
 * fail there instead of passing the "reads nothing" tests unnoticed.
 */
const recordingFileSystem = (touched: Array<string>, unreadable?: string) =>
  Layer.effect(
    FileSystem.FileSystem,
    Effect.map(FileSystem.FileSystem, fs =>
      FileSystem.FileSystem.of({
        ...fs,
        stat: path => {
          touched.push(path);
          return fs.stat(path);
        },
        readFileString: (path, encoding) => {
          touched.push(path);
          return path === unreadable
            ? Effect.fail(
                PlatformError.systemError({
                  _tag: 'PermissionDenied',
                  module: 'FileSystem',
                  method: 'readFileString',
                  pathOrDescriptor: path,
                })
              )
            : fs.readFileString(path, encoding);
        },
      })
    )
  ).pipe(Layer.provide(BunFileSystem.layer));

/** What the resolver resolved, and every path it touched on the way. */
const observeResolution = (
  env: Record<string, string>,
  { home = EMPTY_HOME, unreadable }: Surroundings = {}
) => {
  const touched: Array<string> = [];
  return resolveAgentSession.pipe(
    Effect.map(session => ({ session: Option.getOrUndefined(session), touched })),
    Effect.provide(
      Layer.mergeAll(
        recordingFileSystem(touched, unreadable),
        BunPath.layer,
        Layer.succeed(NodeOs, defaultNodeOs({ homedir: home }))
      )
    ),
    Effect.provideService(ConfigProvider.ConfigProvider, isolatedEnvironment(env))
  );
};

const resolveWith = (env: Record<string, string>, surroundings?: Surroundings) =>
  observeResolution(env, surroundings).pipe(Effect.map(({ session }) => session));

const TELEMETRY_ON = { CI: 'false', NODE_ENV: 'production' };

type SessionSource = {
  readonly source: string;
  readonly variables: Record<string, string>;
};

// Both ways a session resolves. Each resolves one in the tests below while telemetry is on.
const SESSION_SOURCES: ReadonlyArray<SessionSource> = [
  { source: 'a host variable', variables: { CLAUDE_CODE_SESSION_ID: CLAUDE_SESSION } },
  {
    source: 'a hook export',
    variables: { COMPOSIO_AGENT_HOST: 'claude', COMPOSIO_AGENT_SESSION_ID: CLAUDE_SESSION },
  },
];

const TELEMETRY_DISABLED_CASES = pipe(
  [
    { name: 'COMPOSIO_CLI_TELEMETRY_DISABLED', value: '1' },
    { name: 'COMPOSIO_DISABLE_TELEMETRY', value: 'true' },
    { name: 'TELEMETRY_DISABLED', value: '1' },
    { name: 'CI', value: 'true' },
    { name: 'NODE_ENV', value: 'test' },
  ],
  Arr.flatMap(telemetrySwitch =>
    pipe(
      SESSION_SOURCES,
      Arr.map(sessionSource => ({ ...telemetrySwitch, ...sessionSource }))
    )
  )
);

describe('resolveAgentSession', () => {
  // The host's own session ID never leaves the resolver, so each case names the chat it
  // expects and compares the ID derived from it.
  it.effect.each(SELECTION_CASES)('[Given] $name', ({ variables, expected }) =>
    Effect.gen(function* () {
      const actual = yield* resolveWith({ ...TELEMETRY_ON, ...variables });
      expect(actual).toStrictEqual(
        expected && { host: expected.host, id: deriveAgentSessionId(expected) }
      );
    })
  );

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

  it.effect.each(TELEMETRY_DISABLED_CASES)(
    '[Given] $source and telemetry disabled by $name=$value [Then] it resolves none',
    ({ name, value, variables }) =>
      Effect.gen(function* () {
        const actual = yield* resolveWith({ ...TELEMETRY_ON, ...variables, [name]: value });
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

// The contract with the agent plugins' hooks: one file per chat under the home directory.
const compactionFile = (home: string, host: string, hostSessionId: string) =>
  `${home}/.composio/agent-compactions/${host}/${hostSessionId}`;

const inTestFileSystem = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>
): Effect.Effect<A, E> =>
  effect.pipe(Effect.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer)));

const writeFile = (file: string, contents: string) =>
  inTestFileSystem(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      yield* fs.makeDirectory(path.dirname(file), { recursive: true });
      yield* fs.writeFileString(file, contents);
    })
  );

describe('resolveAgentSession compaction count', () => {
  const IN_CLAUDE_CODE = { ...TELEMETRY_ON, CLAUDE_CODE_SESSION_ID: CLAUDE_SESSION };
  const WITHOUT_COUNT = { host: 'claude', id: CLAUDE_AGENT_SESSION_ID };

  it.effect('[Given] no compaction file [Then] the session has no count', () =>
    Effect.gen(function* () {
      const home = tempy.temporaryDirectory();

      const { session, touched } = yield* observeResolution(IN_CLAUDE_CODE, { home });

      expect(session).toStrictEqual(WITHOUT_COUNT);
      // The one path the resolver looks at, under the home directory it was given.
      expect(touched).toStrictEqual([compactionFile(home, 'claude', CLAUDE_SESSION)]);
    })
  );

  it.effect.each([
    { name: 'an empty file', contents: '', expected: 0 },
    {
      name: 'three lines',
      contents: '2026-11-11T09:00:00Z\n2026-11-11T10:00:00Z\n2026-11-11T11:00:00Z\n',
      expected: 3,
    },
    { name: 'three lines and no trailing newline', contents: 'auto\nmanual\nauto', expected: 3 },
    { name: 'blank lines between entries', contents: 'auto\n\nmanual\n  \n\nauto\n', expected: 3 },
    { name: 'CRLF line endings', contents: 'auto\r\n\r\nmanual\r\nauto\r\n', expected: 3 },
    // The largest file the resolver reads: 64 KiB.
    { name: 'a file of exactly 64 KiB', contents: 'x\n'.repeat(32 * 1024), expected: 32 * 1024 },
  ])('[Given] $name [Then] the count is $expected', ({ contents, expected }) =>
    Effect.gen(function* () {
      const home = tempy.temporaryDirectory();
      yield* writeFile(compactionFile(home, 'claude', CLAUDE_SESSION), contents);

      const actual = yield* resolveWith(IN_CLAUDE_CODE, { home });

      expect(actual).toStrictEqual({ ...WITHOUT_COUNT, compactionCount: expected });
    })
  );

  it.effect('[Given] a file one byte over 64 KiB [Then] the session has no count', () =>
    Effect.gen(function* () {
      const home = tempy.temporaryDirectory();
      const file = compactionFile(home, 'claude', CLAUDE_SESSION);
      yield* writeFile(file, `${'x\n'.repeat(32 * 1024)}x`);

      const { session, touched } = yield* observeResolution(IN_CLAUDE_CODE, { home });

      expect(session).toStrictEqual(WITHOUT_COUNT);
      // Its size was looked up; its contents were not read.
      expect(touched).toStrictEqual([file]);
    })
  );

  it.effect('[Given] a directory at the file path [Then] the session has no count', () =>
    Effect.gen(function* () {
      const home = tempy.temporaryDirectory();
      yield* writeFile(`${compactionFile(home, 'claude', CLAUDE_SESSION)}/entry`, 'auto\n');

      expect(yield* resolveWith(IN_CLAUDE_CODE, { home })).toStrictEqual(WITHOUT_COUNT);
    })
  );

  it.effect('[Given] a file that cannot be read [Then] the session has no count', () =>
    Effect.gen(function* () {
      const home = tempy.temporaryDirectory();
      const file = compactionFile(home, 'claude', CLAUDE_SESSION);
      yield* writeFile(file, 'auto\nmanual\n');

      const actual = yield* resolveWith(IN_CLAUDE_CODE, { home, unreadable: file });

      expect(actual).toStrictEqual(WITHOUT_COUNT);
    })
  );

  it.effect('[Given] a file for the other host only [Then] the session has no count', () =>
    Effect.gen(function* () {
      const home = tempy.temporaryDirectory();
      yield* writeFile(compactionFile(home, 'codex', CLAUDE_SESSION), 'auto\nmanual\n');

      expect(yield* resolveWith(IN_CLAUDE_CODE, { home })).toStrictEqual(WITHOUT_COUNT);
    })
  );

  it.effect('[Given] a hook export inside another host [Then] the exported chat is counted', () =>
    Effect.gen(function* () {
      const home = tempy.temporaryDirectory();
      yield* writeFile(compactionFile(home, 'codex', CODEX_SESSION), 'auto\nmanual\n');
      yield* writeFile(compactionFile(home, 'claude', CLAUDE_SESSION), 'auto\n'.repeat(5));

      const actual = yield* resolveWith(
        {
          ...IN_CLAUDE_CODE,
          COMPOSIO_AGENT_HOST: 'codex',
          COMPOSIO_AGENT_SESSION_ID: CODEX_SESSION,
        },
        { home }
      );

      expect(actual).toStrictEqual({
        host: 'codex',
        id: CODEX_AGENT_SESSION_ID,
        compactionCount: 2,
      });
    })
  );

  it.effect('[Given] a 128-character ID of letters, digits, _ and - [Then] its file is read', () =>
    Effect.gen(function* () {
      const home = tempy.temporaryDirectory();
      const hostSessionId = 'Chat_01-'.repeat(16);
      yield* writeFile(compactionFile(home, 'claude', hostSessionId), 'auto\n');

      const actual = yield* resolveWith(
        { ...TELEMETRY_ON, CLAUDE_CODE_SESSION_ID: hostSessionId },
        { home }
      );

      expect(actual?.compactionCount).toBe(1);
    })
  );

  // Each file sits where joining the ID onto the host's directory would land; `..` lands on
  // the directory that holds the file.
  it.effect.each([
    { name: 'a path separator', hostSessionId: 'chat/1', file: 'claude/chat/1' },
    { name: 'a parent directory', hostSessionId: '..', file: 'claude/chat' },
    { name: "another host's directory", hostSessionId: '../codex/chat', file: 'codex/chat' },
    { name: 'a dot', hostSessionId: 'chat.1', file: 'claude/chat.1' },
    { name: '129 characters', hostSessionId: 'a'.repeat(129), file: `claude/${'a'.repeat(129)}` },
  ])(
    '[Given] a session ID with $name [Then] no file is read and the session resolves',
    ({ hostSessionId, file }) =>
      Effect.gen(function* () {
        const home = tempy.temporaryDirectory();
        yield* writeFile(`${home}/.composio/agent-compactions/${file}`, 'auto\n');

        const { session, touched } = yield* observeResolution(
          {
            ...TELEMETRY_ON,
            COMPOSIO_AGENT_HOST: 'claude',
            COMPOSIO_AGENT_SESSION_ID: hostSessionId,
          },
          { home }
        );

        expect(session).toStrictEqual({
          host: 'claude',
          id: deriveAgentSessionId({ host: 'claude', hostSessionId }),
        });
        expect(touched).toStrictEqual([]);
      })
  );

  it.effect('[Given] telemetry disabled [Then] the file is not read', () =>
    Effect.gen(function* () {
      const home = tempy.temporaryDirectory();
      yield* writeFile(compactionFile(home, 'claude', CLAUDE_SESSION), 'auto\nmanual\n');

      const { session, touched } = yield* observeResolution(
        { ...IN_CLAUDE_CODE, COMPOSIO_CLI_TELEMETRY_DISABLED: '1' },
        { home }
      );

      expect(session).toBeUndefined();
      expect(touched).toStrictEqual([]);
    })
  );
});

describe('agentSessionHeaders', () => {
  const session = { host: 'claude', id: CLAUDE_AGENT_SESSION_ID } as const;

  it('[Given] a session without a count [Then] only the host and the ID are sent', () => {
    expect(agentSessionHeaders(session)).toStrictEqual({
      'x-cli-agent-session-host': 'claude',
      'x-cli-agent-session-id': CLAUDE_AGENT_SESSION_ID,
    });
  });

  it.each([
    { compactionCount: 0, header: '0' },
    { compactionCount: 3, header: '3' },
  ])('[Given] a count of $compactionCount [Then] it is sent as "$header"', testCase => {
    expect(
      agentSessionHeaders({ ...session, compactionCount: testCase.compactionCount })
    ).toStrictEqual({
      'x-cli-agent-session-host': 'claude',
      'x-cli-agent-session-id': CLAUDE_AGENT_SESSION_ID,
      'x-cli-agent-compaction-count': testCase.header,
    });
  });
});
