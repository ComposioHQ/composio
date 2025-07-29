import process from 'node:process';
import {
  Cause,
  Config,
  ConfigProvider,
  Console,
  Effect,
  Exit,
  Logger,
  Layer,
  LogLevel,
} from 'effect';
import { BunContext, BunRuntime } from '@effect/platform-bun';
import type { Teardown } from '@effect/platform/Runtime';
import path from 'node:path';
import os from 'node:os';
import { $ } from 'bun';

/**
 * Usage: `COMPOSIO_INSTALL_DIR=<INSTALL_DIR> bun scripts/build-binary.ts <BINARY_PATH>`
 */
export function installBinary() {
  return Effect.gen(function* () {
    const binaryPath = process.argv[2];

    if (!binaryPath) {
      return yield* Effect.logError('Missing <BINARY_PATH> argument');
    }

    const defaultInstallDir = path.join(os.homedir(), '.composio');
    const installDir = yield* Config.string('COMPOSIO_INSTALL_DIR').pipe(
      Config.withDefault(defaultInstallDir)
    );

    yield* Effect.logDebug(`Installing binary in ${installDir}`);

    yield* Effect.tryPromise(() => $`cp ${binaryPath} ${installDir}/composio`.quiet());

    yield* Console.log('Binary successfully installed in', installDir);
  });
}

export const teardown: Teardown = <E, A>(exit: Exit.Exit<E, A>, onExit: (code: number) => void) => {
  const shouldFail = Exit.isFailure(exit) && !Cause.isInterruptedOnly(exit.cause);
  const errorCode = Number(process.exitCode ?? 1);
  onExit(shouldFail ? errorCode : 0);
};

const ConfigLive = Effect.gen(function* () {
  const logLevel = yield* Config.logLevel('COMPOSIO_LOG_LEVEL').pipe(
    Config.withDefault(LogLevel.Info)
  );

  return Logger.minimumLogLevel(logLevel);
}).pipe(Layer.unwrapEffect, Layer.merge(Layer.setConfigProvider(ConfigProvider.fromEnv())));

if (require.main === module) {
  installBinary().pipe(
    Effect.provide(ConfigLive),
    Effect.provide(Logger.pretty),
    Effect.provide(BunContext.layer),
    Effect.scoped,
    Effect.map(() => ({ message: 'Process completed successfully.' })),
    BunRuntime.runMain({
      teardown,
    })
  );
}
