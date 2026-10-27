import { describe, expect, layer } from '@effect/vitest';
import { vi } from 'vitest';
import { Cause, Effect } from 'effect';
import { createCliCommandTelemetryContext } from 'src/analytics/events';
import { BackendMismatchWarning } from 'src/services/backend-mismatch-warning';
import { CommandLifecycleTelemetry } from 'src/services/command-lifecycle-telemetry';
import { PluginHint } from 'src/services/plugin-hint';
import { UpdateNotice } from 'src/services/update-check';
import { MockConsole, recordedInvocationCalls, TestLive } from 'test/__utils__';
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
        const invocation = { argv: ['/bin/bun', '/cli/bin.ts', 'whoami'] };
        const context = createCliCommandTelemetryContext(
          invocation.argv,
          '1.2.3',
          { stdoutIsTTY: false, stderrIsTTY: false },
          { invocationOrigin: 'cli', parentRunId: undefined }
        );
        const cause = Cause.fail(new TypeError('boom'));

        yield* (yield* BackendMismatchWarning).run(invocation);
        yield* (yield* UpdateNotice).run(invocation);
        yield* (yield* PluginHint).run(invocation);
        const telemetry = yield* CommandLifecycleTelemetry;
        yield* telemetry.invoked(context);
        yield* telemetry.succeeded(context);
        yield* telemetry.failed(context, cause);

        expect(yield* recordedInvocationCalls).toEqual([
          { service: 'BackendMismatchWarning', invocation },
          { service: 'UpdateNotice', invocation },
          { service: 'PluginHint', invocation },
          { service: 'CommandLifecycleTelemetry', event: 'invoked', context },
          { service: 'CommandLifecycleTelemetry', event: 'succeeded', context },
          { service: 'CommandLifecycleTelemetry', event: 'failed', context, cause },
        ]);
        // The doubles are no-ops: nothing reaches the console or the analytics dispatcher.
        expect(yield* MockConsole.getLines()).toEqual([]);
        expect(trackedEvents).toEqual([]);
      })
    );
  });
});
