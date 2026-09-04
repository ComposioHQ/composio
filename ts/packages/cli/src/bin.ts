import process from 'node:process';
import { Effect, Layer } from 'effect';
import { FetchHttpClient } from '@effect/platform';
import { BunFileSystem, BunPath, BunRuntime } from '@effect/platform-bun';
import { isBackgroundWorkerInvocation, runBackgroundWorkerFromArgv } from 'src/analytics/dispatch';
import { NodeOs } from 'src/services/node-os';
import { TerminalUILive } from 'src/services/terminal-ui';
import { stripTelemetryDebugFlag, telemetryDebugModeLayer } from 'src/services/runtime-flags';

const bootstrap = stripTelemetryDebugFlag(process.argv);
process.argv = [...bootstrap.argv];

const workerLayers = Layer.mergeAll(
  BunFileSystem.layer,
  BunPath.layer,
  FetchHttpClient.layer,
  NodeOs.Default,
  TerminalUILive
);

if (isBackgroundWorkerInvocation(bootstrap.argv)) {
  runBackgroundWorkerFromArgv(bootstrap.argv).pipe(
    Effect.provide(
      bootstrap.telemetryDebug
        ? Layer.merge(workerLayers, telemetryDebugModeLayer(true))
        : workerLayers
    ),
    effect =>
      BunRuntime.runMain(effect, {
        disableErrorReporting: true,
        teardown: (_exit, onExit) => onExit(0),
      })
  );
} else {
  void import('./cli-main').then(({ runCli }) =>
    runCli({ telemetryDebug: bootstrap.telemetryDebug })
  );
}
