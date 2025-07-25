import process from 'node:process';
import { Cause, Console, Effect, Exit, Layer, Logger } from 'effect';
import { captureErrors, prettyPrintFromCapturedErrors } from 'effect-errors';
import { CliConfig } from '@effect/cli';
import { FetchHttpClient } from '@effect/platform';
import { BunContext, BunRuntime, BunFileSystem } from '@effect/platform-bun';
import type { Teardown } from '@effect/platform/Runtime';
import { runWithConfig } from 'src/commands';
import * as constants from 'src/constants';
import { ComposioCliConfig } from 'src/cli-config';
import { BaseConfigProviderLive, ConfigLive, extendConfigProvider } from 'src/services/config';
import {
  ComposioSessionRepository,
  ComposioToolkitsRepository,
} from 'src/services/composio-clients';
import { NodeOs } from 'src/services/node-os';
import { NodeProcess } from 'src/services/node-process';
import { EnvLangDetector } from 'src/services/env-lang-detector';
import { JsPackageManagerDetector } from 'src/services/js-package-manager-detector';
import { ComposioUserContextLive as _ComposioUserContextLive } from 'src/services/user-context';
import { UpgradeBinary } from 'src/services/upgrade-binary';

/**
 * Concrete Effect layer compositions for the Composio CLI runtime.
 *
 *         ┌─── The service to be created
 *         │                ┌─── The possible error
 *         │                │      ┌─── The required dependencies
 *         ▼                ▼      ▼
 * Layer<RequirementsOut, Error, RequirementsIn>
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RequiredLayer = Layer.Layer<any, any, never>;

/**
 * Service layer that configures the CLI appearance and default command options.
 */
export const CliConfigLive = CliConfig.layer(ComposioCliConfig) satisfies RequiredLayer;

export const ComposioUserContextLive = Layer.provide(
  _ComposioUserContextLive,
  Layer.mergeAll(BunFileSystem.layer, NodeOs.Default)
) satisfies RequiredLayer;

export const ComposioSessionRepositoryLive = Layer.provide(
  ComposioSessionRepository.Default,
  Layer.mergeAll(BunFileSystem.layer, NodeOs.Default)
) satisfies RequiredLayer;

export const ComposioToolkitsRepositoryLive = Layer.provide(
  ComposioToolkitsRepository.Default,
  Layer.mergeAll(BunFileSystem.layer, NodeOs.Default, ConfigLive)
) satisfies RequiredLayer;

export const UpgradeBinaryLive = Layer.provide(
  UpgradeBinary.Default,
  Layer.mergeAll(BunFileSystem.layer, FetchHttpClient.layer)
) satisfies RequiredLayer;

const layers = Layer.mergeAll(
  CliConfigLive.pipe(Layer.provide(ConfigLive)),
  NodeOs.Default,
  NodeProcess.Default,
  UpgradeBinaryLive,
  ComposioUserContextLive,
  ComposioSessionRepositoryLive,
  ComposioToolkitsRepositoryLive,
  EnvLangDetector.Default,
  JsPackageManagerDetector.Default,
  BunContext.layer,
  BunFileSystem.layer,
  Logger.pretty
) satisfies RequiredLayer;

export const teardown: Teardown = <E, A>(exit: Exit.Exit<E, A>, onExit: (code: number) => void) => {
  const shouldFail = Exit.isFailure(exit) && !Cause.isInterruptedOnly(exit.cause);
  const errorCode = Number(process.exitCode ?? 1);
  onExit(shouldFail ? errorCode : 0);
};

const runWithArgs = Effect.flatMap(runWithConfig, run => run(process.argv)) satisfies Effect.Effect<
  void,
  unknown,
  unknown
>;

/**
 * CLI entrypoint, which:
 * - runs the Effect runtime and sets up its runtime environment
 * - collects and displays errors
 */
runWithArgs.pipe(
  Effect.scoped,
  Effect.withSpan('composio-cli', {
    attributes: {
      name: constants.APP_NAME,
      filename: 'src/bin.ts',
    },
  }),
  Effect.sandbox,
  Effect.catchAll(
    Effect.fn(function* (cause) {
      const captured = yield* captureErrors(cause, {
        stripCwd: true,
      });
      const message = prettyPrintFromCapturedErrors(captured, {
        hideStackTrace: true,
        stripCwd: true,
        enabled: true,
      });

      yield* Console.error(message);
    })
  ),
  Effect.provide(layers),
  Effect.withConfigProvider(extendConfigProvider(BaseConfigProviderLive)),
  BunRuntime.runMain({
    teardown,
  })
);
