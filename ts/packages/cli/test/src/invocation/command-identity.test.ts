import { describe, expect, it, layer } from '@effect/vitest';
import { Cause, Data, Effect, Option, Ref } from 'effect';
import type { Command } from 'effect/cli';
import {
  getPrimaryLifecycleFailedEvent,
  getPrimaryLifecycleInvokedEvent,
  getPrimaryLifecycleSucceededEvent,
} from 'src/analytics/events';
import type { TelemetryFamily } from 'src/analytics/types';
import { buildRootCommand, runWithConfig } from 'src/commands';
import {
  CommandInvocation,
  type CommandIdentity,
  commandPathOf,
} from 'src/invocation/command-identity';
import { cliExit, recordedInvocationCalls, TestLive } from 'test/__utils__';
import { RECORDED_BEFORE_IDENTITY } from './command-identity.before';

const commandPaths = (
  command: Command.Command.Any,
  prefix: ReadonlyArray<string>
): ReadonlyArray<ReadonlyArray<string>> =>
  command.subcommands
    .flatMap(group => group.commands)
    .flatMap(child => {
      const path = [...prefix, child.name];
      return [path, ...commandPaths(child, path)];
    });

const everyFeature = { isDevModeEnabled: true, isExperimentalFeatureEnabled: () => true };
const PATHS = [[], ...commandPaths(buildRootCommand(everyFeature), [])].map(path => ({
  args: path,
  name: path.join(' ') || 'composio',
}));

/** The root registrations with their own lifecycle family; every other command is `command`. */
const FAMILIES: Readonly<Record<string, TelemetryFamily>> = {
  execute: 'execute',
  install: 'install',
  link: 'link',
  login: 'login',
  logout: 'logout',
  proxy: 'proxy',
  run: 'run',
  search: 'search',
  setup: 'setup',
};

/**
 * The command paths the argv extractor recorded wrongly (`RECORDED_BEFORE_IDENTITY`): a token
 * missing from its allowlist stopped it early, so these were recorded as `composio`, as their
 * parent (`dev init` as `dev`), or as their parent's family (`setup skill` as `setup`). Every
 * other path is recorded as before.
 */
const CORRECTED_PATHS = [
  'agent',
  'agent claim',
  'agent inbox',
  'agent login',
  'agent signup',
  'agent whoami',
  'config',
  'config experimental',
  'connections',
  'connections list',
  'connections remove',
  'debug',
  'debug api-info',
  'debug generate-graph',
  'debug who-is-my-master',
  'dev init',
  'setup skill',
  'signup',
  // `composio help <command>`, all recorded as `composio`.
  ...PATHS.filter(({ args }) => args[0] === 'help').map(({ name }) => name),
].toSorted();

class StopAtBegin extends Data.TaggedError('test/StopAtBegin') {}

/**
 * The identity `effect/cli` gives `args` at runtime: the selected registration's, or for help
 * and parse failures the one the parser names. Stops at `begin`, so no handler runs.
 */
const identityOf = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const begun = yield* Ref.make(Option.none<CommandIdentity>());
    const run = yield* runWithConfig;
    yield* run(['node', '<CMD>', ...args]).pipe(
      Effect.provideService(CommandInvocation, {
        begin: identity =>
          Ref.set(begun, Option.some(identity)).pipe(Effect.andThen(Effect.die(new StopAtBegin()))),
        enter: () => Effect.void,
        runId: Effect.succeedNone,
      }),
      Effect.exit
    );
    return yield* Ref.get(begun);
  });

describe('command identity', () => {
  layer(TestLive({ cliUserConfig: { experimentalFeatures: { listen: true } } }))(it => {
    it.effect.each(PATHS)('`$name` is recorded as itself, with its family', ({ args, name }) =>
      Effect.gen(function* () {
        const identity = yield* identityOf(args);
        expect(Option.map(identity, commandPathOf)).toEqual(Option.some(name));
        expect(Option.map(identity, ({ meta }) => meta.telemetryFamily)).toEqual(
          Option.some(FAMILIES[name] ?? 'command')
        );
      })
    );
  });

  it('changes the recorded path or family only of the paths the argv extractor got wrong', () => {
    const changed = PATHS.filter(({ name }) => {
      const before = RECORDED_BEFORE_IDENTITY[name];
      return before === undefined
        ? false
        : before.path !== name || before.family !== (FAMILIES[name] ?? 'command');
    }).map(({ name }) => name);
    expect(changed.toSorted()).toEqual(CORRECTED_PATHS);
    expect(PATHS.map(({ name }) => name).toSorted()).toEqual(
      Object.keys(RECORDED_BEFORE_IDENTITY).toSorted()
    );
  });
});

/** The lifecycle events `cli(args)` recorded, as `<event> <command path> <family>`. */
const lifecycleOf = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    yield* cliExit(args);
    const calls = yield* recordedInvocationCalls;
    return calls.flatMap(call =>
      call.service === 'CommandLifecycleTelemetry' && call.event !== 'pluginHintShown'
        ? [{ event: call.event, path: call.context.commandPath, family: call.context.family, call }]
        : []
    );
  }).pipe(Effect.provide(TestLive()));

describe('lifecycle telemetry from the command identity', () => {
  it.effect.each([
    { args: ['signup', '--help'], path: 'signup', family: 'command', outcome: 'succeeded' },
    {
      args: ['setup', 'skill', '--help'],
      path: 'setup skill',
      family: 'command',
      outcome: 'succeeded',
    },
    { args: ['--version'], path: 'composio', family: 'command', outcome: 'succeeded' },
    {
      args: ['connections', 'list'],
      path: 'connections list',
      family: 'command',
      outcome: 'failed',
    },
    { args: ['tools'], path: 'tools', family: 'command', outcome: 'failed' },
    { args: ['link', 'gmail'], path: 'link', family: 'link', outcome: 'failed' },
    {
      args: ['dev', 'connected-accounts', 'link', 'gmail'],
      path: 'dev connected-accounts link',
      family: 'command',
      outcome: 'failed',
    },
    {
      args: ['dev', '--user-id', 'u', 'triggers', 'list', 'gmail'],
      path: 'dev triggers list',
      family: 'command',
      outcome: 'failed',
    },
    {
      args: ['dev', 'triggers', 'list', 'gmail', '--user-id', 'u'],
      path: 'dev triggers list',
      family: 'command',
      outcome: 'failed',
    },
    // The `logs` group declares --project-name unsupported; its subcommand rejects it once it began.
    {
      args: ['dev', 'logs', 'tools', '--project-name', 'p'],
      path: 'dev logs tools',
      family: 'command',
      outcome: 'failed',
    },
  ])(
    '[Given] logged out, `composio $args` [Then] records $path ($family) as $outcome',
    ({ args, path, family, outcome }) =>
      Effect.gen(function* () {
        const events = yield* lifecycleOf(args);
        expect(events.map(({ event, path, family }) => ({ event, path, family }))).toEqual([
          { event: 'invoked', path, family },
          { event: outcome, path, family },
        ]);
      })
  );

  it.effect('records a typo against the path the parser reached, never the typed token', () =>
    Effect.gen(function* () {
      const events = yield* lifecycleOf(['dve', 'list']);
      expect(events.map(({ event, path }) => ({ event, path }))).toEqual([
        { event: 'invoked', path: 'composio' },
        { event: 'failed', path: 'composio' },
      ]);
      const failed = events[1]!.call;
      expect(failed.event).toBe('failed');
      const properties =
        failed.event === 'failed'
          ? getPrimaryLifecycleFailedEvent(failed.context, Cause.squash(failed.cause))?.properties
          : undefined;
      expect(properties).toMatchObject({
        command_path: 'composio',
        failure_reason_code: 'parse_error',
      });
      expect(JSON.stringify(properties)).not.toContain('dve');
    })
  );

  it.effect('uses the displayed command identity for redundant help', () =>
    Effect.gen(function* () {
      const events = yield* lifecycleOf(['help', 'execute', '--help']);
      expect(events.map(({ event, path, family }) => ({ event, path, family }))).toEqual([
        { event: 'invoked', path: 'execute', family: 'execute' },
        { event: 'succeeded', path: 'execute', family: 'execute' },
      ]);
    })
  );

  it.effect('does not collect a rejected flag name', () =>
    Effect.gen(function* () {
      const events = yield* lifecycleOf(['--customer-secret']);
      expect(events.map(({ call }) => call.context.flagNames)).toEqual([[], []]);
    })
  );

  it.effect('does not interpret run script operands as CLI options', () =>
    Effect.gen(function* () {
      // The missing source stops before execution. Parsing and lifecycle telemetry still run.
      const events = yield* lifecycleOf([
        'run',
        '--file',
        '/missing/cli-telemetry-test.ts',
        '--',
        '--dry-run',
      ]);
      const invoked = events[0]!;
      expect(invoked.path).toBe('run');
      expect(getPrimaryLifecycleInvokedEvent(invoked.call.context)?.properties).toMatchObject({
        dry_run: false,
        file_mode: true,
        arg_count: 1,
      });
      expect(invoked.call.context.flagNames).toEqual(['--file']);
    })
  );

  it.effect.each([
    { args: ['search', 'send email'], properties: { limit: '10' } },
    { args: ['search', 'send email', '--limit', '7'], properties: { limit: '7' } },
    {
      args: ['proxy', '/private-path', '--toolkit', 'gmail'],
      properties: { method: 'GET', toolkit: 'gmail', header_count: 0 },
    },
    {
      args: ['proxy', '/private-path', '--toolkit', 'gmail', '-X', 'POST'],
      properties: { method: 'POST', toolkit: 'gmail', header_count: 0 },
    },
    { args: ['setup', '--if-present'], properties: { target: 'auto', if_present: true } },
  ])('uses effective parser values for `$args`', ({ args, properties }) =>
    Effect.gen(function* () {
      const events = yield* lifecycleOf(args);
      expect(events).toHaveLength(2);
      events.forEach(({ call }) => {
        expect(getPrimaryLifecycleInvokedEvent(call.context)?.properties).toMatchObject(properties);
      });
    })
  );

  it.effect.each(
    [
      {
        command: 'execute',
        invalid: [],
        fields: [
          'dry_run',
          'get_schema',
          'has_data',
          'skip_connection_check',
          'skip_tool_params_check',
          'skip_checks',
        ],
      },
      {
        command: 'search',
        invalid: ['--limit', 'invalid'],
        fields: ['limit', 'toolkits', 'query_length', 'query_term_count'],
      },
      {
        command: 'link',
        invalid: ['--no-wait=invalid'],
        fields: ['no_browser', 'no_wait', 'has_auth_config'],
      },
      {
        command: 'login',
        invalid: ['--no-wait=invalid'],
        fields: ['no_browser', 'no_wait', 'has_key', 'skip_org_picker'],
      },
      {
        command: 'install',
        invalid: ['--completions=invalid'],
        fields: ['completions', 'no_completions'],
      },
      {
        command: 'setup',
        invalid: ['--target', 'invalid'],
        fields: ['operation', 'target', 'yes', 'if_present'],
      },
      {
        command: 'proxy',
        invalid: [],
        fields: [
          'method',
          'toolkit',
          'has_endpoint',
          'has_data',
          'header_count',
          'skip_connection_check',
        ],
      },
      {
        command: 'run',
        invalid: ['--file'],
        fields: [
          'debug',
          'dry_run',
          'skip_connection_check',
          'skip_tool_params_check',
          'skip_checks',
          'file_mode',
          'arg_count',
        ],
      },
    ].flatMap(({ command, invalid, fields }) => [
      { command, fields, args: [command, '--help'], outcome: 'succeeded' },
      { command, fields, args: [command, ...invalid], outcome: 'failed' },
    ])
  )('omits unparsed input for `$args` ($outcome)', ({ command, fields, args, outcome }) =>
    Effect.gen(function* () {
      const events = yield* lifecycleOf(args);
      expect(events.map(({ event }) => event)).toEqual(['invoked', outcome]);
      events.forEach(({ call }) => {
        const event =
          call.event === 'failed'
            ? getPrimaryLifecycleFailedEvent(call.context, Cause.squash(call.cause))
            : call.event === 'succeeded'
              ? getPrimaryLifecycleSucceededEvent(call.context)
              : getPrimaryLifecycleInvokedEvent(call.context);
        expect(event?.properties).toMatchObject({ source: 'cli', command_path: command });
        fields.forEach(field => expect(event?.properties).not.toHaveProperty(field));
        expect(call.context.options).toEqual({});
        expect(call.context.flagNames).toEqual([]);
        if (call.event === 'failed') {
          expect(event?.properties).toHaveProperty('failure_reason_code', 'parse_error');
        }
      });
    })
  );

  it.effect('keeps the projection when a shared command is registered under dev', () =>
    Effect.gen(function* () {
      const events = yield* lifecycleOf([
        'dev',
        'connected-accounts',
        'link',
        'gmail',
        '--no-browser',
      ]);
      expect(events).toHaveLength(2);
      events.forEach(({ call }) => {
        expect(call.context.family).toBe('command');
        expect(call.context.flagNames).toEqual(['--no-browser']);
        expect(getPrimaryLifecycleInvokedEvent(call.context)?.properties).toMatchObject({
          flag_names: ['--no-browser'],
        });
      });
    })
  );

  it.effect('projects only measured fields from parsed proxy input', () =>
    Effect.gen(function* () {
      const events = yield* lifecycleOf([
        'proxy',
        '/private-path',
        '--toolkit',
        'gmail',
        '--account',
        'private-account',
        '-H',
        'Authorization: private-header',
        '-d',
        'private-body',
      ]);
      const context = events[0]!.call.context;
      expect(context.options).toEqual({
        toolkit: 'gmail',
        method: 'GET',
        has_endpoint: true,
        has_data: true,
        header_count: 1,
        skip_connection_check: false,
      });
      expect(context.argument).toBeUndefined();
      expect(context.flagNames).toEqual(['--data', '--header']);
      expect(JSON.stringify(getPrimaryLifecycleInvokedEvent(context))).not.toContain('private-');
    })
  );

  it.effect('reads the execute tool slug from the parsed input, and none for --help', () =>
    Effect.gen(function* () {
      const [executed] = yield* lifecycleOf(['execute', 'GMAIL_SEND_EMAIL']);
      expect(executed?.call.context).toMatchObject({
        commandPath: 'execute',
        family: 'execute',
        argument: 'GMAIL_SEND_EMAIL',
        toolkitSlug: 'gmail',
      });
      const [help] = yield* lifecycleOf(['execute', 'GMAIL_SEND_EMAIL', '--help']);
      expect(help?.call.context).toMatchObject({ commandPath: 'execute', family: 'execute' });
      expect(help?.call.context.argument).toBeUndefined();
    })
  );
});
