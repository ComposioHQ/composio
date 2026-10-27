import { describe, expect, it } from '@effect/vitest';
import { afterEach, vi } from 'vitest';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { Cause, Effect, Layer } from 'effect';
import { createCliCommandTelemetryContext } from 'src/analytics/events';
import { ChildProcessExited } from 'src/effects/child-process-exited';
import {
  CommandLifecycleTelemetry,
  type CommandLifecycleTelemetryShape,
} from 'src/services/command-lifecycle-telemetry';
import { NodeOs } from 'src/services/node-os';
import { TerminalUITest } from 'test/__utils__/services/terminal-ui-test';
import { trackedEvents } from 'test/__utils__/tracked-events';

vi.mock('src/analytics/dispatch', async importOriginal => {
  const { recordTrackedEvent } = await import('test/__utils__/tracked-events');
  return {
    ...(await importOriginal<typeof import('src/analytics/dispatch')>()),
    trackCliEventEffect: recordTrackedEvent,
  };
});

afterEach(() => {
  trackedEvents.length = 0;
});

const TelemetryLive = Layer.provide(
  CommandLifecycleTelemetry.Default,
  Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOs.Default, TerminalUITest)
);

const contextFor = (args: ReadonlyArray<string>) =>
  createCliCommandTelemetryContext(
    ['/bin/bun', '/cli/bin.ts', ...args],
    '1.2.3',
    { stdoutIsTTY: false, stderrIsTTY: false },
    { invocationOrigin: 'cli', parentRunId: undefined }
  );

const report = (
  telemetry: CommandLifecycleTelemetryShape,
  outcome: 'invoked' | 'succeeded' | 'failed',
  args: ReadonlyArray<string>
) => {
  const context = contextFor(args);
  switch (outcome) {
    case 'invoked':
      return telemetry.invoked(context);
    case 'succeeded':
      return telemetry.succeeded(context);
    case 'failed':
      return telemetry.failed(context, Cause.fail(new TypeError('boom')));
  }
};

const cases = [
  { args: ['whoami'], family: 'CLI_COMMAND' },
  { args: ['execute', 'GITHUB_GET_THE_AUTHENTICATED_USER'], family: 'CLI_EXECUTE' },
].flatMap(({ args, family }) =>
  (['invoked', 'succeeded', 'failed'] as const).map(outcome => ({
    args,
    command: args[0],
    outcome,
    event: `${family}_${outcome.toUpperCase()}`,
  }))
);

describe('CommandLifecycleTelemetry', () => {
  it.effect.each(cases)(
    '[Given] `composio $command` $outcome [Then] tracks $event',
    ({ args, outcome, event }) =>
      Effect.gen(function* () {
        const telemetry = yield* CommandLifecycleTelemetry;
        yield* report(telemetry, outcome, args);
        expect(trackedEvents.map(tracked => tracked.name)).toEqual([event]);
      }).pipe(Effect.provide(TelemetryLive))
  );

  it.effect('[Given] a failure cause [Then] tracks the squashed error', () =>
    Effect.gen(function* () {
      const telemetry = yield* CommandLifecycleTelemetry;
      yield* telemetry.failed(
        contextFor(['run', 'script.ts']),
        Cause.fail(new ChildProcessExited({ code: 3 }))
      );
      expect(trackedEvents).toEqual([
        {
          name: 'CLI_RUN_FAILED',
          properties: expect.objectContaining({
            failure_reason_code: 'child_exit',
          }),
        },
      ]);
    }).pipe(Effect.provide(TelemetryLive))
  );
});
