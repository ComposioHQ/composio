/**
 * Runs one invocation (`src/invocation/invocation.ts`) as the process: over the production
 * services (`InvocationLive`), under the CLI's own runner. The invocation takes the full argv;
 * `runWithConfig` removes the executable prefix before `Command.runWith` parses it.
 *
 * Exit codes come from Effect's runtime markers, never `process.exitCode`: a failure that is
 * already on screen (ShowHelp, a command's own report, or a message the invocation printed)
 * reaches the runner with `[Runtime.errorReported] = false` (`forRunner`), so the runner logs
 * nothing, and `Runtime.defaultTeardown` exits with its `[Runtime.errorExitCode]` (1 when unset),
 * or 0 on success. Signals are the runner's (`src/run-main.ts`): a command a signal cancelled
 * exits 128 + its number.
 */
import { ConfigProvider, Effect } from 'effect';
import { forRunner, runInvocation } from 'src/invocation/invocation';
import { InvocationLive } from 'src/invocation/live';
import { readTelemetryDebugOverride, telemetryDebugModeLayer } from 'src/services/runtime-flags';
import { normalizeRunScriptArgs } from 'src/commands/argv-compat';
import { makeShutdownController, ShutdownSignal } from 'src/services/shutdown-signal';
import { makeCliRunMain } from 'src/run-main';

/**
 * Values `src/bin.ts` resolved before the Effect runtime existed and hands to it here.
 */
export type CliBootstrapOptions = {
  /** The full, unchanged process argv (executable and script included). */
  readonly argv: ReadonlyArray<string>;
};

export const runCli = (options: CliBootstrapOptions): void => {
  const debug = readTelemetryDebugOverride(normalizeRunScriptArgs(options.argv));
  // One per invocation: the runner reports the process's signals to the command through it.
  const shutdown = makeShutdownController();
  runInvocation(options.argv).pipe(
    forRunner,
    Effect.provide(InvocationLive),
    // Built per invocation, never at module scope: `ConfigProvider.fromEnv()` snapshots
    // `process.env` when constructed, and the ambient `ConfigProvider` reference caches its
    // default snapshot process-wide on first use. A fresh provider here means every config read
    // of this invocation observes the environment as it is now (`vi.stubEnv` in tests, any
    // in-process mutation before `runCli`).
    Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv())),
    Effect.provideService(ShutdownSignal, shutdown.service),
    effect =>
      debug === undefined ? effect : Effect.provide(effect, telemetryDebugModeLayer(debug)),
    makeCliRunMain(shutdown)()
  );
};
