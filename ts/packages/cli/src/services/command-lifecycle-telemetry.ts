import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import { Cause, Context, Effect, Layer } from 'effect';
import { trackCliEventEffect } from 'src/analytics/dispatch';
import { captureServices } from 'src/effects/capture-services';
import {
  getPrimaryLifecycleFailedEvent,
  getPrimaryLifecycleInvokedEvent,
  getPrimaryLifecycleSucceededEvent,
} from 'src/analytics/events';
import type { CliCommandTelemetryContext, TrackEvent } from 'src/analytics/types';
import { NodeOs } from './node-os';
import { TerminalUI } from './terminal-ui';

/**
 * Where an invocation reports its command's lifecycle: once when the command starts, then once
 * when it succeeds or fails. Every method is best-effort and never fails.
 */
export interface CommandLifecycleTelemetryShape {
  readonly invoked: (context: CliCommandTelemetryContext) => Effect.Effect<void>;
  readonly succeeded: (context: CliCommandTelemetryContext) => Effect.Effect<void>;
  readonly failed: (
    context: CliCommandTelemetryContext,
    cause: Cause.Cause<unknown>
  ) => Effect.Effect<void>;
}

/**
 * Tracks the command's primary lifecycle events (its family's events, or the generic
 * `CLI_COMMAND_*` ones) through the analytics dispatcher.
 */
export class CommandLifecycleTelemetry extends Context.Service<
  CommandLifecycleTelemetry,
  CommandLifecycleTelemetryShape
>()('services/CommandLifecycleTelemetry') {
  static readonly Default: Layer.Layer<
    CommandLifecycleTelemetry,
    never,
    FileSystem.FileSystem | Path.Path | NodeOs | TerminalUI
  > = Layer.effect(
    CommandLifecycleTelemetry,
    Effect.gen(function* () {
      const services = yield* captureServices(FileSystem.FileSystem, Path.Path, NodeOs, TerminalUI);
      const track = (event: TrackEvent) =>
        trackCliEventEffect(event).pipe(Effect.provideContext(services));
      return CommandLifecycleTelemetry.of({
        invoked: context => track(getPrimaryLifecycleInvokedEvent(context)),
        succeeded: context => track(getPrimaryLifecycleSucceededEvent(context)),
        failed: (context, cause) =>
          track(getPrimaryLifecycleFailedEvent(context, Cause.squash(cause))),
      });
    })
  );
}
