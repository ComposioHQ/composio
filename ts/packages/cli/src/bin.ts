import process from 'node:process';
import { Effect, Layer } from 'effect';
import { FetchHttpClient } from '@effect/platform';
import { BunFileSystem, BunPath, BunRuntime } from '@effect/platform-bun';
import { isBackgroundWorkerInvocation, runBackgroundWorkerFromArgv } from 'src/analytics/dispatch';
import { NodeOs } from 'src/services/node-os';
import { TerminalUILive } from 'src/services/terminal-ui';
import { enableRuntimeTelemetryDebug, TELEMETRY_DEBUG_FLAG } from 'src/services/runtime-flags';

const stripTelemetryDebugFlag = (argv: ReadonlyArray<string>): string[] => {
  const normalizedArgv = [...argv];
  const flagIndex = normalizedArgv.indexOf(TELEMETRY_DEBUG_FLAG);
  if (flagIndex < 0) {
    return normalizedArgv;
  }

  normalizedArgv.splice(flagIndex, 1);
  enableRuntimeTelemetryDebug();
  return normalizedArgv;
};

process.argv = stripTelemetryDebugFlag(process.argv);

if (isBackgroundWorkerInvocation(process.argv)) {
  runBackgroundWorkerFromArgv(process.argv).pipe(
    Effect.provide(
      Layer.mergeAll(
        BunFileSystem.layer,
        BunPath.layer,
        FetchHttpClient.layer,
        NodeOs.Default,
        TerminalUILive
      )
    ),
    effect =>
      BunRuntime.runMain(effect, {
        disableErrorReporting: true,
        teardown: (_exit, onExit) => onExit(0),
      })
  );
} else {
  void import('./cli-main');
}
