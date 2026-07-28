import process from 'node:process';
import { Effect, Layer } from 'effect';
import { FetchHttpClient } from '@effect/platform';
import { BunFileSystem, BunPath, BunRuntime } from '@effect/platform-bun';
import { isBackgroundWorkerInvocation, runBackgroundWorkerFromArgv } from 'src/analytics/dispatch';
import { NodeOs } from 'src/services/node-os';
import { TerminalUILive } from 'src/services/terminal-ui';

const TELEMETRY_DEBUG_FLAG = '--telemetry-debug';
const CLI_TELEMETRY_DEBUG_ENV_VAR = 'COMPOSIO_CLI_TELEMETRY_DEBUG';

const stripTelemetryDebugFlag = (argv: ReadonlyArray<string>): string[] => {
  const normalizedArgv = [...argv];
  const flagIndex = normalizedArgv.indexOf(TELEMETRY_DEBUG_FLAG);
  if (flagIndex < 0) {
    return normalizedArgv;
  }

  normalizedArgv.splice(flagIndex, 1);
  // Bootstrap runs before the Effect runtime and ConfigProvider exist; the stripped flag is
  // persisted as an env var so later effect/Config reads and child processes observe it.
  // eslint-disable-next-line eslint-js/no-restricted-syntax -- pre-runtime env write during bootstrap
  process.env[CLI_TELEMETRY_DEBUG_ENV_VAR] = 'true';
  return normalizedArgv;
};

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
  process.argv = stripTelemetryDebugFlag(process.argv);
  void import('./cli-main');
}
