import process from 'node:process';
import { Cause, Console, Effect, Exit, HashMap, Layer, Logger, Option } from 'effect';
import { captureErrors, prettyPrintFromCapturedErrors } from 'effect-errors/index';
import { CliConfig, CommandDescriptor, HelpDoc, Usage, ValidationError } from '@effect/cli';
import { FetchHttpClient } from '@effect/platform';
import { BunContext, BunRuntime, BunFileSystem } from '@effect/platform-bun';
import type { Teardown } from '@effect/platform/Runtime';
import { buildRootCommand, runWithConfig } from 'src/commands';
import { matchCommandFromArgv, getCommandHelpText } from 'src/commands/root-help';
import * as constants from 'src/constants';
import { ComposioCliConfig } from 'src/cli-config';
import { BaseConfigProviderLive, ConfigLive, extendConfigProvider } from 'src/services/config';
import {
  ComposioClientSingleton,
  ComposioSessionRepository,
  ComposioToolkitsRepository,
} from 'src/services/composio-clients';
import { ComposioToolkitsRepositoryCached } from 'src/services/composio-clients-cached';
import { NodeOs } from 'src/services/node-os';
import { NodeProcess } from 'src/services/node-process';
import { JsPackageManagerDetector } from 'src/services/js-package-manager-detector';
import { ComposioCliUserConfigLive, ComposioCliUserConfig } from 'src/services/cli-user-config';
import { ComposioUserContextLive as _ComposioUserContextLive } from 'src/services/user-context';
import { UpgradeBinary } from 'src/services/upgrade-binary';
import { TerminalUILive } from 'src/services/terminal-ui';
import { TriggersRealtime } from 'src/services/triggers-realtime';
import { ToolsExecutorLive as _ToolsExecutorLive } from 'src/services/tools-executor';
import { ProjectContext } from 'src/services/project-context';
import { ProjectEnvironmentDetector } from 'src/services/project-environment-detector';
import { CommandRunner } from 'src/services/command-runner';
import { StdinLive } from 'src/services/stdin';
import { showUpdateNotice, checkForUpdateInBackground } from 'src/services/update-check';
import {
  createCliCommandTelemetryContext,
  getPrimaryLifecycleFailedEvent,
  getPrimaryLifecycleInvokedEvent,
  getPrimaryLifecycleSucceededEvent,
} from 'src/analytics/events';
import { trackCliEvent, trackCliEventEffect } from 'src/analytics/dispatch';
import { mapOnlyComposioOverrideError } from 'src/services/composio-error-overrides';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RequiredLayer = Layer.Layer<any, any, never>;

export const CliConfigLive = CliConfig.layer(ComposioCliConfig) satisfies RequiredLayer;

export const ComposioUserContextLive = Layer.provide(
  _ComposioUserContextLive,
  Layer.mergeAll(BunFileSystem.layer, NodeOs.Default)
) satisfies RequiredLayer;

export const ComposioCliUserConfigLayer = Layer.provide(
  ComposioCliUserConfigLive,
  Layer.mergeAll(BunFileSystem.layer, NodeOs.Default)
);

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

export const TriggersRealtimeLive = Layer.provide(
  TriggersRealtime.Default,
  Layer.mergeAll(BunFileSystem.layer, NodeOs.Default)
) satisfies RequiredLayer;

export const ComposioClientSingletonLive = Layer.provide(
  ComposioClientSingleton.Default,
  Layer.mergeAll(BunFileSystem.layer, NodeOs.Default, ConfigLive)
) satisfies RequiredLayer;

export const ToolsExecutorLive = Layer.provide(
  _ToolsExecutorLive,
  ComposioClientSingletonLive
) satisfies RequiredLayer;

export const ProjectContextLive = Layer.provide(
  ProjectContext.Default,
  Layer.mergeAll(BunFileSystem.layer, NodeOs.Default, NodeProcess.Default)
) satisfies RequiredLayer;

const layers = Layer.mergeAll(
  CliConfigLive.pipe(Layer.provide(ConfigLive)),
  NodeOs.Default,
  NodeProcess.Default,
  UpgradeBinaryLive,
  ComposioCliUserConfigLayer,
  ComposioUserContextLive,
  ComposioSessionRepositoryLive,
  ComposioClientSingletonLive,
  ComposioToolkitsRepositoryCachedLive,
  ToolsExecutorLive,
  JsPackageManagerDetector.Default,
  ProjectEnvironmentDetector.Default,
  CommandRunner.Default,
  TriggersRealtimeLive,
  ProjectContextLive,
  BunContext.layer,
  BunFileSystem.layer,
  FetchHttpClient.layer,
  StdinLive,
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

const commandTelemetryContext = createCliCommandTelemetryContext(
  process.argv,
  constants.APP_VERSION
);
if (commandTelemetryContext.commandPath === 'run' && commandTelemetryContext.runId) {
  process.env.COMPOSIO_CLI_PARENT_RUN_ID = commandTelemetryContext.runId;
}

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

const collectValueOptionNames = (rootCommand: ReturnType<typeof buildRootCommand>) => {
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
};

showUpdateNotice();
checkForUpdateInBackground();
trackCliEvent(getPrimaryLifecycleInvokedEvent(commandTelemetryContext));

runWithArgs.pipe(
  Effect.scoped,
  Effect.mapError(error =>
    ValidationError.isValidationError(error) ? error : mapOnlyComposioOverrideError({ error })
  ),
  Effect.tap(() => trackCliEventEffect(getPrimaryLifecycleSucceededEvent(commandTelemetryContext))),
  Effect.tapErrorCause(cause =>
    trackCliEventEffect(
      getPrimaryLifecycleFailedEvent(commandTelemetryContext, Cause.squash(cause))
    )
  ),
  Effect.catchIf(ValidationError.isValidationError, error => {
    return Effect.gen(function* () {
      const cliUserConfig = yield* ComposioCliUserConfig;
      const visibility = {
        isDevModeEnabled: cliUserConfig.isDevModeEnabled(),
        isExperimentalFeatureEnabled: (feature: string) =>
          cliUserConfig.isExperimentalFeatureEnabled(feature),
      };
      const valueOptionNames = collectValueOptionNames(buildRootCommand(visibility));
      const text = HelpDoc.toAnsiText(error.error).trim();
      const errorEffect = text.length > 0 ? Console.error(text) : Effect.void;
      const flagMatch = text.match(/Received unknown argument: '(-{1,2}[\w-]+)'/);
      const tipEffect =
        flagMatch && valueOptionNames.has(flagMatch[1])
          ? Console.error(`Tip: ${flagMatch[1]} requires a value, e.g. ${flagMatch[1]} "value"`)
          : Effect.void;
      const cmdName = matchCommandFromArgv(process.argv, visibility);
      const helpText = cmdName ? getCommandHelpText(cmdName, visibility) : undefined;
      const helpEffect = helpText ? Console.error(helpText) : Effect.void;
      return yield* Effect.all([errorEffect, tipEffect, helpEffect], { discard: true }).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            process.exitCode = 1;
          })
        )
      );
    });
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
      const filteredErrors = captured.errors.filter(
        error => error.errorType !== 'ToolExecutionError'
      );
      if (captured.interrupted || filteredErrors.length > 0) {
        const message = prettyPrintFromCapturedErrors(
          { ...captured, errors: filteredErrors },
          {
            hideStackTrace: true,
            stripCwd: true,
            enabled: true,
          }
        ).trim();
        if (message.length > 0) {
          yield* Console.error(message);
          const cliUserConfig = yield* ComposioCliUserConfig;
          const visibility = {
            isDevModeEnabled: cliUserConfig.isDevModeEnabled(),
            isExperimentalFeatureEnabled: (feature: string) =>
              cliUserConfig.isExperimentalFeatureEnabled(feature),
          };
          const cmdName = matchCommandFromArgv(process.argv, visibility);
          const helpText = cmdName ? getCommandHelpText(cmdName, visibility) : undefined;
          if (helpText) {
            yield* Console.error(helpText);
          }
          process.exitCode = 1;
        }
      }
    })
  ),
  Effect.provide(layers),
  Effect.withConfigProvider(extendConfigProvider(BaseConfigProviderLive)),
  effect =>
    (BunRuntime.runMain({ teardown }) as (e: Effect.Effect<void, unknown, unknown>) => void)(effect)
);
