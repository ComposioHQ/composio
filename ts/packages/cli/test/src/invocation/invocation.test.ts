import { describe, expect, it, layer } from '@effect/vitest';
import { Cause, ConfigProvider, Data, Effect, Exit, Layer, Runtime } from 'effect';
import { ExpectedFailure } from 'src/effects/expected-failure';
import { ReportedFailure } from 'src/effects/report-failure';
import { runnerCause } from 'src/invocation/invocation';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import {
  cliExit,
  exitCodeOf,
  MockConsole,
  recordedInvocationCalls,
  resetInvocationCalls,
  TestLive,
} from 'test/__utils__';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import { makeToolkitsRepositoryStub } from 'test/__utils__/services/toolkits-repository-stub';

/** Logged in through the environment, with no current org stored. */
const loggedInWithoutOrg: TestLiveInput = {
  baseConfigProvider: ConfigProvider.fromEnvRecord({ COMPOSIO_USER_API_KEY: 'uak_test' }),
};

/**
 * Runs `args` over a fresh `TestLive`, with `overrides` replacing its services, and returns its
 * exit code and output.
 */
const invoke = (
  args: ReadonlyArray<string>,
  input?: TestLiveInput,
  overrides: Layer.Layer<never> = Layer.empty
) =>
  Effect.gen(function* () {
    const { exit, exitCode } = yield* cliExit(args).pipe(Effect.provide(overrides));
    const stdout = yield* MockConsole.getLines({ stream: 'stdout', stripAnsi: true });
    const stderr = yield* MockConsole.getLines({ stream: 'stderr', stripAnsi: true });
    return { exit, exitCode, stdout, stderr };
  }).pipe(Effect.provide(TestLive(input)));

/** The services the recording doubles saw, and the lifecycle event names, in order. */
const recordedSequence = Effect.map(recordedInvocationCalls, calls =>
  calls.map(call =>
    call.service === 'CommandLifecycleTelemetry' ? `${call.service}.${call.event}` : call.service
  )
);

describe('runInvocation', () => {
  layer(TestLive())('lifecycle', it => {
    it.effect.each([
      { args: ['version'], exitCode: 0, outcome: 'succeeded', hooks: true },
      { args: [], exitCode: 0, outcome: 'succeeded', hooks: false },
      { args: ['help'], exitCode: 0, outcome: 'succeeded', hooks: false },
      { args: ['--help'], exitCode: 0, outcome: 'succeeded', hooks: false },
      { args: ['--version'], exitCode: 0, outcome: 'succeeded', hooks: false },
      { args: ['help', 'orgz'], exitCode: 1, outcome: 'failed', hooks: false },
    ])(
      '[Given] `composio $args` [Then] records the command as $outcome, with hooks: $hooks',
      ({ args, exitCode, outcome, hooks }) =>
        Effect.gen(function* () {
          // The suite shares one recorder.
          yield* resetInvocationCalls;

          const result = yield* cliExit(args);

          expect(result.exitCode).toBe(exitCode);
          expect(yield* recordedSequence).toEqual([
            ...(hooks
              ? ['BackendMismatchWarning', 'UpdateNotice', 'PluginHint', 'BackgroundUpdateCheck']
              : []),
            'CommandLifecycleTelemetry.invoked',
            `CommandLifecycleTelemetry.${outcome}`,
          ]);
        })
    );
  });

  // Each of these used to print its message only to a terminal and exit 0, so a script, CI or
  // an agent saw nothing and a successful exit; `connections remove` used to answer its own
  // confirmation prompt with "no".
  it.effect.each([
    {
      name: 'whoami without a login',
      args: ['whoami'],
      input: {},
      message: 'You are not logged in yet. Please run `composio login`.',
    },
    {
      name: 'tools list without a login',
      args: ['tools', 'list', 'gmail'],
      input: {},
      message: 'You are not logged in yet. Please run `composio login`.',
    },
    {
      name: 'connections list without a current org',
      args: ['connections', 'list'],
      input: loggedInWithoutOrg,
      message: 'No current org configured. Run `composio login` or `composio dev orgs switch`.',
    },
    {
      name: 'dev connected-accounts info without an id',
      args: ['dev', 'connected-accounts', 'info'],
      input: loggedInWithoutOrg,
      message: 'Missing required argument: <id>',
    },
    {
      name: 'triggers info without a slug',
      args: ['triggers', 'info'],
      input: loggedInWithoutOrg,
      message: 'Missing required argument: <slug>',
    },
    {
      name: 'connections remove without --yes',
      args: ['connections', 'remove', 'gmail'],
      input: { fixture: 'user-config-with-global-context' },
      message: '`composio connections remove` needs --yes when not running interactively.',
    },
    {
      name: 'dev projects list without a current org',
      args: ['dev', 'projects', 'list'],
      input: loggedInWithoutOrg,
      message: 'No current org is configured.',
    },
    {
      name: 'a bare run',
      args: ['run'],
      input: {},
      message: 'Provide inline code or use --file to run a script file.',
    },
    {
      name: 'execute with arguments that are not an object',
      args: ['execute', 'GITHUB_GET_THE_AUTHENTICATED_USER', '-d', '[]'],
      input: { fixture: 'user-config-with-global-context' },
      message: 'Expected a JSON object for tool arguments',
    },
  ])(
    '[Given] $name [Then] prints the message alone on stderr and exits 1',
    ({ args, input, message }) =>
      Effect.gen(function* () {
        const { exit, exitCode, stdout, stderr } = yield* invoke(args, input);

        expect(exitCode).toBe(1);
        // The command's own error, not one the invocation made up.
        expect(Exit.isFailure(exit) && Cause.hasFails(exit.cause)).toBe(true);
        expect(stdout).toEqual([]);
        expect(stderr.at(-1)).toContain(message);
        const output = stderr.join('\n');
        expect(output).not.toContain('Error');
        expect(output).not.toContain('Sources');
        expect(output).not.toContain('RUN_LOG_FILE=');
      })
  );

  it.effect('[Given] a defect [Then] prints the defect report once and exits 1', () =>
    Effect.gen(function* () {
      const { exit, exitCode, stderr } = yield* invoke(
        ['dev', 'toolkits', 'list'],
        { fixture: 'user-config-with-global-context' },
        // Every repository method dies.
        Layer.succeed(ComposioToolkitsRepository, makeToolkitsRepositoryStub({}))
      );

      expect(exitCode).toBe(1);
      expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true);
      expect(stderr.filter(line => line.includes('💥'))).toHaveLength(1);
    })
  );
});

class UsageMistake extends Data.TaggedError('test/UsageMistake')<{ readonly message: string }> {
  get [ExpectedFailure]() {
    return true;
  }
}

class PrintedWithCode extends Data.TaggedError('test/PrintedWithCode')<{}> {
  get [Runtime.errorReported]() {
    return false;
  }

  get [Runtime.errorExitCode]() {
    return 7;
  }
}

describe('runnerCause', () => {
  it('[Given] a failure the invocation printed [Then] the runner gets it already reported', () => {
    const cause = runnerCause(Cause.fail(new UsageMistake({ message: 'no' })));

    const error = Cause.squash(cause);
    expect(error).toBeInstanceOf(ReportedFailure);
    expect(Runtime.getErrorReported(error)).toBe(false);
    expect(exitCodeOf(Exit.fail(new UsageMistake({ message: 'no' })))).toBe(1);
  });

  it('[Given] a defect [Then] the runner gets it already reported', () => {
    expect(Cause.squash(runnerCause(Cause.die(new Error('boom'))))).toBeInstanceOf(ReportedFailure);
  });

  it('[Given] a failure already on screen [Then] it keeps its markers and exit code', () => {
    const cause = Cause.fail(new PrintedWithCode());

    expect(runnerCause(cause)).toBe(cause);
    expect(exitCodeOf(Exit.failCause(cause))).toBe(7);
  });

  it('[Given] an interruption [Then] it stays one, so a signal can still decide the code', () => {
    const cause = Cause.interrupt();

    expect(runnerCause(cause)).toBe(cause);
    expect(exitCodeOf(Exit.failCause(cause))).toBe(130);
  });
});
