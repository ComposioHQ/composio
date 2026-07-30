import process from 'node:process';
import { Effect, Layer } from 'effect';
import { FetchHttpClient } from '@effect/platform';
import { BunFileSystem, BunPath, BunRuntime } from '@effect/platform-bun';
import { isBackgroundWorkerInvocation, runBackgroundWorkerFromArgv } from 'src/analytics/dispatch';
import {
  isSkillRepinWorkerInvocation,
  isSelfUpdateWorkerInvocation,
  runSkillRepinWorkerFromArgv,
  runSelfUpdateWorkerFromArgv,
} from 'src/services/self-update';
import { NodeOs } from 'src/services/node-os';
import { TerminalUI, TerminalUILive } from 'src/services/terminal-ui';
import { recoverInterruptedBinaryReplacement } from 'src/services/upgrade-binary';

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

if (isSelfUpdateWorkerInvocation(process.argv)) {
  runSelfUpdateWorkerFromArgv(process.argv).pipe(
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
} else if (isSkillRepinWorkerInvocation(process.argv)) {
  runSkillRepinWorkerFromArgv(process.argv).pipe(
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
} else if (isBackgroundWorkerInvocation(process.argv)) {
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
  const bootstrap = recoverInterruptedBinaryReplacement(process.execPath).pipe(
    Effect.matchEffect({
      onFailure: error =>
        Effect.gen(function* () {
          const ui = yield* TerminalUI;
          yield* ui.error(`Unable to recover an interrupted Composio CLI update: ${String(error)}`);
          return false;
        }),
      onSuccess: status => {
        if (status === 'none') return Effect.succeed(true);
        return Effect.gen(function* () {
          const ui = yield* TerminalUI;
          yield* ui.error(
            status === 'busy'
              ? 'A Composio CLI update is still being applied. Please retry this command shortly.'
              : 'An interrupted Composio CLI update was rolled back. Please retry this command.'
          );
          return false;
        });
      },
    }),
    Effect.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer, TerminalUILive))
  );
  void Effect.runPromise(bootstrap).then(
    shouldStart => {
      if (shouldStart) {
        void import('./cli-main');
        return;
      }
      process.exitCode = 75;
    },
    () => {
      process.exitCode = 1;
    }
  );
}
