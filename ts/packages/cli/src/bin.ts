import process from 'node:process';
import { Effect, Layer } from 'effect';
import * as FetchHttpClient from '@effect/platform/FetchHttpClient';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import { isBackgroundWorkerInvocation, runBackgroundWorkerFromArgv } from 'src/analytics/dispatch';
import { NodeOs } from 'src/services/node-os';
import { TerminalUILive } from 'src/services/terminal-ui';
import { stripTelemetryDebugFlag, telemetryDebugModeLayer } from 'src/services/runtime-flags';

// The one `process.argv` read: every later consumer receives this normalized argv explicitly.
const bootstrap = stripTelemetryDebugFlag(process.argv);

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
    runCli({ argv: bootstrap.argv, telemetryDebug: bootstrap.telemetryDebug })
  );
}
