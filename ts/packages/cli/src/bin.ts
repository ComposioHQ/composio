import process from 'node:process';
import { Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import { isBackgroundWorkerInvocation, runBackgroundWorkerFromArgv } from 'src/analytics/dispatch';
import { NodeOs } from 'src/services/node-os';
import { TerminalUILive } from 'src/services/terminal-ui';
import { readTelemetryDebugOverride, telemetryDebugModeLayer } from 'src/services/runtime-flags';

// Read process.argv once and pass it unchanged to the worker or command framework.
const argv = process.argv;

const workerLayers = Layer.mergeAll(
  BunFileSystem.layer,
  BunPath.layer,
  FetchHttpClient.layer,
  NodeOs.Default,
  TerminalUILive
);

if (isBackgroundWorkerInvocation(argv)) {
  runBackgroundWorkerFromArgv(argv).pipe(
    Effect.provide(
      readTelemetryDebugOverride(argv) === true
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
  void import('./cli-main').then(({ runCli }) => runCli({ argv }));
}
