import process from 'node:process';
import { Cause, Console, Effect, Exit, HashMap, Layer, Logger, Option } from 'effect';
import { captureErrors, prettyPrintFromCapturedErrors } from 'effect-errors/index';
import { CliConfig, CommandDescriptor, HelpDoc, Usage, ValidationError } from '@effect/cli';
import { FetchHttpClient } from '@effect/platform';
import { BunContext, BunRuntime, BunFileSystem } from '@effect/platform-bun';
import type { Teardown } from '@effect/platform/Runtime';
import { rootCommand, runWithConfig } from 'src/commands';
import * as constants from 'src/constants';
import { ComposioCliConfig } from 'src/cli-config';
import { BaseConfigProviderLive, ConfigLive, extendConfigProvider } from 'src/services/config';
import {
  ComposioSessionRepository,
  ComposioToolkitsRepository,
} from 'src/services/composio-clients';
import { ComposioToolkitsRepositoryCached } from 'src/services/composio-clients-cached';
import { NodeOs } from 'src/services/node-os';
import { NodeProcess } from 'src/services/node-process';
import { EnvLangDetector } from 'src/services/env-lang-detector';
import { JsPackageManagerDetector } from 'src/services/js-package-manager-detector';
import { ComposioUserContextLive as _ComposioUserContextLive } from 'src/services/user-context';
import { UpgradeBinary } from 'src/services/upgrade-binary';
import { TerminalUILive } from 'src/services/terminal-ui';

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

export const ComposioToolkitsRepositoryCachedLive = Layer.provide(
  ComposioToolkitsRepositoryCached,
  ComposioToolkitsRepositoryLive
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
  ComposioToolkitsRepositoryCachedLive, // Use the cached layer instead of the regular one
  EnvLangDetector.Default,
  JsPackageManagerDetector.Default,
  BunContext.layer,
  BunFileSystem.layer,
  TerminalUILive,
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

const collectValueOptionNamesFromUsage = (usage: Usage.Usage, acc: Set<string>) => {
  switch (usage._tag) {
    case 'Named': {
      if (Option.isSome(usage.acceptedValues)) {
        for (const name of usage.names) {
          if (name.startsWith('-')) {
            acc.add(name);
          }
        }
      }
      return;
    }
    case 'Optional':
    case 'Repeated': {
      collectValueOptionNamesFromUsage(usage.usage, acc);
      return;
    }
    case 'Alternation':
    case 'Concat': {
      collectValueOptionNamesFromUsage(usage.left, acc);
      collectValueOptionNamesFromUsage(usage.right, acc);
      return;
    }
    case 'Mixed':
    case 'Empty': {
      return;
    }
  }
};

const valueOptionNames = (() => {
  const names = new Set<string>();
  const visited = new Set<CommandDescriptor.Command<unknown>>();
  const visit = (command: CommandDescriptor.Command<unknown>) => {
    if (visited.has(command)) {
      return;
    }
    visited.add(command);
    collectValueOptionNamesFromUsage(CommandDescriptor.getUsage(command), names);
    for (const [, subcommand] of HashMap.toEntries(CommandDescriptor.getSubcommands(command))) {
      visit(subcommand);
    }
  };
  visit(rootCommand.descriptor);
  return names;
})();

/**
 * CLI entrypoint, which:
 * - runs the Effect runtime and sets up its runtime environment
 * - collects and displays errors
 */
runWithArgs.pipe(
  Effect.scoped,
  // @effect/cli already prints validation errors (missing args, invalid flags, etc.)
  // via its own printDocs before re-failing. Swallow the re-thrown error to avoid
  // routing it through the generic error box which would dump raw JSON.
  // When a flag is passed without its required value (e.g. `--query` instead of
  // `--query "text"`), @effect/cli reports it as "unknown argument" — add a tip.
  Effect.catchIf(ValidationError.isValidationError, error => {
    const text = HelpDoc.toAnsiText(error.error).trim();
    const flagMatch = text.match(/Received unknown argument: '(-{1,2}[\w-]+)'/);
    if (flagMatch && valueOptionNames.has(flagMatch[1])) {
      return Console.error(`Tip: ${flagMatch[1]} requires a value, e.g. ${flagMatch[1]} "value"`);
    }
    return Effect.void;
  }),
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
