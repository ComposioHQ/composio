/**
 * Which invocation hooks a command runs, and when: only for a command `effect/cli` selected,
 * right after it began and before it checks a login, minus what its `CommandMeta` turns off.
 */
import { describe, expect, it, layer } from '@effect/vitest';
import { Cause, Effect, Exit, Option } from 'effect';
import { buildRootCommand } from 'src/commands';
import { NotLoggedInError } from 'src/commands/errors';
import {
  commandPathOf,
  identityAt,
  INVOCATION_HOOKS,
  type InvocationHookName,
  runsHook,
} from 'src/invocation/command-identity';
import { cliExit, recordedInvocationCalls, resetInvocationCalls, TestLive } from 'test/__utils__';

const HOOK_SERVICES: Readonly<Record<InvocationHookName, string>> = {
  backendMismatch: 'BackendMismatchWarning',
  updateNotice: 'UpdateNotice',
  pluginHint: 'PluginHint',
  backgroundUpdateCheck: 'BackgroundUpdateCheck',
};

/** The hook services and lifecycle events `cli(args)` recorded, in order. */
const sequenceOf = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    // Suites share one recorder.
    yield* resetInvocationCalls;
    const result = yield* cliExit(args);
    const calls = yield* recordedInvocationCalls;
    return {
      ...result,
      sequence: calls.map(call =>
        call.service === 'CommandLifecycleTelemetry' ? call.event : call.service
      ),
      hooked: calls.flatMap(call =>
        call.service === 'CommandLifecycleTelemetry'
          ? []
          : [commandPathOf(call.invocation.identity)]
      ),
    };
  });

describe('invocation hooks', () => {
  layer(TestLive())('when they run', it => {
    it.effect(
      '[Given] a selected command [Then] its hooks run after it began, for its identity',
      () =>
        Effect.gen(function* () {
          const { exitCode, sequence, hooked } = yield* sequenceOf(['version']);

          expect(exitCode).toBe(0);
          expect(sequence).toEqual([
            'invoked',
            ...INVOCATION_HOOKS.map(hook => HOOK_SERVICES[hook]),
            'succeeded',
          ]);
          expect(hooked).toEqual(INVOCATION_HOOKS.map(() => 'version'));
        })
    );

    it.effect(
      '[Given] a login-gated command without a login [Then] the hooks run, then it fails with NotLoggedInError for its own path',
      () =>
        Effect.gen(function* () {
          const { exit, sequence, hooked } = yield* sequenceOf(['tools', 'list', 'gmail']);
          const calls = yield* recordedInvocationCalls;

          expect(
            Exit.isFailure(exit) &&
              Option.exists(
                Cause.findErrorOption(exit.cause),
                error => error instanceof NotLoggedInError
              )
          ).toBe(true);
          expect(sequence).toEqual([
            'invoked',
            ...INVOCATION_HOOKS.map(hook => HOOK_SERVICES[hook]),
            'failed',
          ]);
          expect(hooked).toEqual(INVOCATION_HOOKS.map(() => 'tools list'));
          expect(
            calls.flatMap(call =>
              call.service === 'CommandLifecycleTelemetry' && call.event === 'failed'
                ? [call.context.commandPath]
                : []
            )
          ).toEqual(['tools list']);
        })
    );

    it.effect.each([
      { name: '--help', args: ['--help'] },
      { name: 'a subcommand --help', args: ['upgrade', '--help'] },
      { name: '--version', args: ['--version'] },
      { name: 'a typo', args: ['whoamii'] },
      { name: 'a missing argument', args: ['dev', 'triggers', 'list'] },
      { name: 'the bare root', args: [] },
      { name: '`help`', args: ['help'] },
      { name: '`help <command>`', args: ['help', 'tools'] },
    ])('[Given] $name [Then] no hook runs', ({ args }) =>
      Effect.gen(function* () {
        const { hooked } = yield* sequenceOf(args);
        expect(hooked).toEqual([]);
      })
    );
  });
});

describe('hook opt-outs from CommandMeta', () => {
  const root = buildRootCommand({
    isDevModeEnabled: true,
    isExperimentalFeatureEnabled: () => true,
  });

  /** Commands that turn hooks off (and some that do not), with the input `effect/cli` parses. */
  const COMMANDS: ReadonlyArray<{
    readonly name: string;
    readonly path: ReadonlyArray<string>;
    readonly input: unknown;
    readonly off: ReadonlyArray<InvocationHookName>;
  }> = [
    { name: 'version', path: ['version'], input: { check: false }, off: [] },
    {
      name: 'version --check',
      path: ['version'],
      input: { check: true },
      off: ['backgroundUpdateCheck'],
    },
    {
      name: 'upgrade',
      path: ['upgrade'],
      input: {},
      off: ['updateNotice', 'backgroundUpdateCheck'],
    },
    { name: 'setup', path: ['setup'], input: {}, off: ['pluginHint'] },
    { name: 'setup skill', path: ['setup', 'skill'], input: {}, off: ['pluginHint'] },
    { name: 'help', path: ['help'], input: {}, off: INVOCATION_HOOKS },
    { name: 'help tools', path: ['help', 'tools'], input: {}, off: INVOCATION_HOOKS },
    { name: 'whoami', path: ['whoami'], input: {}, off: [] },
    { name: 'dev triggers list', path: ['dev', 'triggers', 'list'], input: {}, off: [] },
  ];

  const cases = COMMANDS.flatMap(command =>
    INVOCATION_HOOKS.map(hook => ({ ...command, hook, runs: !command.off.includes(hook) }))
  );

  it.each(cases)('`composio $name` runs $hook: $runs', ({ path, input, hook, runs }) => {
    const identity = identityAt(root, ['composio', ...path]);
    expect(identity.path).toEqual(path);
    expect(runsHook(identity.meta, hook, input)).toBe(runs);
  });
});
