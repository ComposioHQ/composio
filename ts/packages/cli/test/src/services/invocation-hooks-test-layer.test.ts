import { describe, expect, layer } from '@effect/vitest';
import { vi } from 'vitest';
import { Cause, Effect } from 'effect';
import { commandTelemetryContext } from 'test/__utils__/telemetry-context';
import { BackendMismatchWarning } from 'src/services/backend-mismatch-warning';
import { CommandLifecycleTelemetry } from 'src/services/command-lifecycle-telemetry';
import { PluginHint } from 'src/services/plugin-hint';
import { BackgroundUpdateCheck, UpdateNotice } from 'src/services/update-check';
import {
  MockConsole,
  recordedInvocationCalls,
  resetInvocationCalls,
  TestLive,
} from 'test/__utils__';
import { commandIdentity } from 'test/__utils__/command-identity';
import { trackedEvents } from 'test/__utils__/tracked-events';

// Records instead of dispatching, so a double that reached the real sink would show up below.
vi.mock('src/analytics/dispatch', async importOriginal => {
  const { recordTrackedEvent } = await import('test/__utils__/tracked-events');
  return {
    ...(await importOriginal<typeof import('src/analytics/dispatch')>()),
    trackCliEventEffect: recordTrackedEvent,
  };
});

describe('TestLive invocation hooks and telemetry sink', () => {
  layer(TestLive())(it => {
    it.effect('[Given] every hook and lifecycle event [Then] records each call, in order', () =>
      Effect.gen(function* () {
        const invocation = { identity: commandIdentity(['whoami']) };
        const context = commandTelemetryContext(['whoami'], { path: ['whoami'], input: {} });
        const cause = Cause.fail(new TypeError('boom'));
        const shown = {
          invocationOrigin: 'cli',
          commandPath: 'whoami',
          agentHost: 'claude',
        } as const;

        yield* (yield* BackendMismatchWarning).run(invocation);
        yield* (yield* UpdateNotice).run(invocation);
        yield* (yield* PluginHint).run(invocation);
        yield* (yield* BackgroundUpdateCheck).run(invocation);
        const telemetry = yield* CommandLifecycleTelemetry;
        yield* telemetry.invoked(context);
        yield* telemetry.succeeded(context);
        yield* telemetry.failed(context, cause);
        yield* telemetry.pluginHintShown(shown);

        expect(yield* recordedInvocationCalls).toEqual([
          { service: 'BackendMismatchWarning', invocation },
          { service: 'UpdateNotice', invocation },
          { service: 'PluginHint', invocation },
          { service: 'BackgroundUpdateCheck', invocation },
          { service: 'CommandLifecycleTelemetry', event: 'invoked', context },
          { service: 'CommandLifecycleTelemetry', event: 'succeeded', context },
          { service: 'CommandLifecycleTelemetry', event: 'failed', context, cause },
          { service: 'CommandLifecycleTelemetry', event: 'pluginHintShown', shown },
        ]);
        // The doubles are no-ops: nothing reaches the console or the analytics dispatcher.
        expect(yield* MockConsole.getLines()).toEqual([]);
        expect(trackedEvents).toEqual([]);

        yield* resetInvocationCalls;
        expect(yield* recordedInvocationCalls).toEqual([]);
      })
    );
  });
});
