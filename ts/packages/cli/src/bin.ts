import process from 'node:process';
import { Cause, Effect, Exit, Layer } from 'effect';
import { prettyPrint } from 'effect-errors';
import { CliConfig } from '@effect/cli';
import { BunContext, BunRuntime, BunFileSystem } from '@effect/platform-bun';
import type { Teardown } from '@effect/platform/Runtime';
import { runWithConfig } from 'src/commands';
import * as constants from 'src/constants';
import { ComposioCliConfig } from 'src/cli-config';
import { UserConfigLive } from 'src/services/user-config';
import {
  ComposioSessionRepository,
  ComposioToolkitsRepository,
} from 'src/services/composio-clients';
import { NodeProcess } from 'src/services/node-process';
import { EnvLangDetector } from './services/env-lang-detector';
import { JsPackageManagerDetector } from './services/js-package-manager-detector';

/**
 * Concrete Effect layer compositions for the Composio CLI runtime.
 *
 *         ┌─── The service to be created
 *         │                ┌─── The possible error
 *         │                │      ┌─── The required dependencies
 *         ▼                ▼      ▼
 * Layer<RequirementsOut, Error, RequirementsIn>
 */

/**
 * Service layer that reads the user config.
 */
export const UserConfigProviderLiveFromFs = Layer.provide(UserConfigLive, BunFileSystem.layer);

/**
 * Service layer that configures the CLI appearance and default command options.
 */
export const CliConfigLive = CliConfig.layer(ComposioCliConfig);

const layers = Layer.mergeAll(
  UserConfigProviderLiveFromFs,
  CliConfigLive.pipe(Layer.provide(UserConfigProviderLiveFromFs)),
  NodeProcess.Default,
  ComposioSessionRepository.Default.pipe(Layer.provide(UserConfigProviderLiveFromFs)),
  ComposioToolkitsRepository.Default.pipe(Layer.provide(UserConfigProviderLiveFromFs)),
  EnvLangDetector.Default,
  JsPackageManagerDetector.Default,
  BunContext.layer,
  BunFileSystem.layer
);

export const teardown: Teardown = <E, A>(exit: Exit.Exit<E, A>, onExit: (code: number) => void) => {
  const shouldFail = Exit.isFailure(exit) && !Cause.isInterruptedOnly(exit.cause);
  const errorCode = Number(process.exitCode ?? 1);
  onExit(shouldFail ? errorCode : 0);
};

/**
 * CLI entrypoint, which:
 * - runs the Effect runtime and sets up its runtime environment
 * - collects and displays errors
 */
if (require.main === module) {
  const runWithArgs = Effect.flatMap(runWithConfig, run =>
    run(process.argv)
  ) satisfies Effect.Effect<void, unknown, unknown>;

  runWithArgs.pipe(
    Effect.provide(layers),
    Effect.provide(BunContext.layer),
    Effect.withSpan('composio-cli', {
      attributes: {
        name: constants.APP_NAME,
        filename: 'src/bin.ts',
      },
    }),
    Effect.sandbox,
    Effect.catchAll(e => Effect.fail(prettyPrint(e))),
    BunRuntime.runMain({
      teardown,
    })
  );
}
