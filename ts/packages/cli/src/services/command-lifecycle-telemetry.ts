import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import { Cause, Context, Effect, Layer } from 'effect';
import { trackCliEventEffect } from 'src/analytics/dispatch';
import { captureServices } from 'src/effects/capture-services';
import {
  getPluginHintShownEvent,
  getPrimaryLifecycleFailedEvent,
  getPrimaryLifecycleInvokedEvent,
  getPrimaryLifecycleSucceededEvent,
} from 'src/analytics/events';
import type { CliCommandTelemetryContext, TrackEvent } from 'src/analytics/types';
import { APP_VERSION } from 'src/constants';
import type { AgentHost } from './agent-host';
import { NodeOs } from './node-os';
import { TerminalUI } from './terminal-ui';

/** The plugin hint (`src/services/plugin-hint.ts`) was printed for a command. */
export interface PluginHintShown {
  readonly invocationOrigin: string;
  /** The command the hint was printed for, as `commandPathOf` gives it. */
  readonly commandPath: string;
  readonly agentHost: AgentHost;
}

/**
 * Where an invocation reports its command's lifecycle, once when the command starts and once
 * when it succeeds or fails, and what its invocation hooks showed. Every method is best-effort
 * and never fails.
 */
export interface CommandLifecycleTelemetryShape {
  readonly invoked: (context: CliCommandTelemetryContext) => Effect.Effect<void>;
  readonly succeeded: (context: CliCommandTelemetryContext) => Effect.Effect<void>;
  readonly failed: (
    context: CliCommandTelemetryContext,
    cause: Cause.Cause<unknown>
  ) => Effect.Effect<void>;
  /** Tracks `CLI_PLUGIN_HINT_SHOWN`. */
  readonly pluginHintShown: (shown: PluginHintShown) => Effect.Effect<void>;
}

/**
 * Tracks the command's primary lifecycle events (its family's events, or the generic
 * `CLI_COMMAND_*` ones) and the plugin hint's event through the analytics dispatcher.
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
        pluginHintShown: shown =>
          track(getPluginHintShownEvent({ ...shown, cliVersion: APP_VERSION })),
      });
    })
  );
}
