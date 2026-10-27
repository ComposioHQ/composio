import { type Cause, Context, Effect, Layer, Ref } from 'effect';
import type { CliCommandTelemetryContext } from 'src/analytics/types';
import { BackendMismatchWarning } from 'src/services/backend-mismatch-warning';
import { CommandLifecycleTelemetry } from 'src/services/command-lifecycle-telemetry';
import type { HookInvocation } from 'src/services/invocation-hook';
import { PluginHint } from 'src/services/plugin-hint';
import { UpdateNotice } from 'src/services/update-check';

/** One call to an invocation hook or to the lifecycle telemetry sink, in call order. */
export type RecordedInvocationCall =
  | {
      readonly service: 'BackendMismatchWarning' | 'UpdateNotice' | 'PluginHint';
      readonly invocation: HookInvocation;
    }
  | {
      readonly service: 'CommandLifecycleTelemetry';
      readonly event: 'invoked' | 'succeeded';
      readonly context: CliCommandTelemetryContext;
    }
  | {
      readonly service: 'CommandLifecycleTelemetry';
      readonly event: 'failed';
      readonly context: CliCommandTelemetryContext;
      readonly cause: Cause.Cause<unknown>;
    };

/** Reads what the recording doubles of `InvocationHooksTest` were called with. */
export class InvocationRecorder extends Context.Service<
  InvocationRecorder,
  {
    readonly calls: Effect.Effect<ReadonlyArray<RecordedInvocationCall>>;
    readonly reset: Effect.Effect<void>;
  }
>()('test/InvocationRecorder') {}

/** Every call the recording doubles received so far, oldest first. */
export const recordedInvocationCalls = Effect.gen(function* () {
  const recorder = yield* InvocationRecorder;
  return yield* recorder.calls;
});

/**
 * Forgets every call recorded so far. Tests that share one `TestLive` (`layer(TestLive())`)
 * record into one recorder; reset it before the invocation a test asserts on.
 */
export const resetInvocationCalls = Effect.gen(function* () {
  const recorder = yield* InvocationRecorder;
  yield* recorder.reset;
});

/**
 * Recording no-op doubles for the invocation hooks and the lifecycle telemetry sink: they print
 * nothing and track nothing, so a test's stderr and analytics stay its command's own, and
 * `InvocationRecorder` exposes what they were called with.
 */
export const InvocationHooksTest = Layer.unwrap(
  Effect.gen(function* () {
    const calls = yield* Ref.make<ReadonlyArray<RecordedInvocationCall>>([]);
    const record = (call: RecordedInvocationCall) => Ref.update(calls, all => [...all, call]);
    return Layer.mergeAll(
      Layer.succeed(
        InvocationRecorder,
        InvocationRecorder.of({ calls: Ref.get(calls), reset: Ref.set(calls, []) })
      ),
      Layer.succeed(
        BackendMismatchWarning,
        BackendMismatchWarning.of({
          run: invocation => record({ service: 'BackendMismatchWarning', invocation }),
        })
      ),
      Layer.succeed(
        UpdateNotice,
        UpdateNotice.of({ run: invocation => record({ service: 'UpdateNotice', invocation }) })
      ),
      Layer.succeed(
        PluginHint,
        PluginHint.of({ run: invocation => record({ service: 'PluginHint', invocation }) })
      ),
      Layer.succeed(
        CommandLifecycleTelemetry,
        CommandLifecycleTelemetry.of({
          invoked: context =>
            record({ service: 'CommandLifecycleTelemetry', event: 'invoked', context }),
          succeeded: context =>
            record({ service: 'CommandLifecycleTelemetry', event: 'succeeded', context }),
          failed: (context, cause) =>
            record({ service: 'CommandLifecycleTelemetry', event: 'failed', context, cause }),
        })
      )
    );
  })
);
