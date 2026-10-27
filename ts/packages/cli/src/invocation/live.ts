/**
 * The production services of an invocation: every layer `runInvocation` needs, built on Bun.
 * `cli-main.ts` provides it; tests provide `TestLive` instead.
 */
import { Layer, Logger } from 'effect';
import * as Path from 'effect/Path';
import { CliConfig } from 'effect/cli';
import { FetchHttpClient } from 'effect/http';
import * as BunServices from '@effect/platform-bun/BunServices';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { withoutClientNotices } from 'src/effects/without-client-notices';
import { ComposioCliConfig } from 'src/cli-config';
import {
  ComposioClientSingleton,
  ComposioSessionRepository,
  ComposioToolkitsRepository,
} from 'src/services/composio-clients';
import { ComposioToolkitsRepositoryCached } from 'src/services/composio-clients-cached';
import { NodeOs } from 'src/services/node-os';
import { NodeProcess } from 'src/services/node-process';
import { JsPackageManagerDetector } from 'src/services/js-package-manager-detector';
import { ComposioCliUserConfigLive } from 'src/services/cli-user-config';
import { ComposioUserContextLive as _ComposioUserContextLive } from 'src/services/user-context';
import { UpgradeBinary } from 'src/services/upgrade-binary';
import { TerminalUILive } from 'src/services/terminal-ui';
import { TriggersRealtime } from 'src/services/triggers-realtime';
import { ToolsExecutorLive as _ToolsExecutorLive } from 'src/services/tools-executor';
import { DashboardToolExecution } from 'src/services/dashboard-tool-execution';
import { ToolkitSlugCatalog } from 'src/services/toolkit-slug-catalog';
import { ProjectContext } from 'src/services/project-context';
import { ProjectEnvironmentDetector } from 'src/services/project-environment-detector';
import { CommandRunner } from 'src/services/command-runner';
import { StdinLive } from 'src/services/stdin';
import { PluginHint } from 'src/services/plugin-hint';
import { UpdateNotice } from 'src/services/update-check';
import { BackendMismatchWarning } from 'src/services/backend-mismatch-warning';
import { CommandLifecycleTelemetry } from 'src/services/command-lifecycle-telemetry';
import { LogLevelFromConfigLive } from 'src/effects/with-log-level';
import { SetupSkillInstaller } from 'src/services/setup-skill-installer';
import { PendingLoginSession } from 'src/services/pending-login-session';

// Layer is contravariant in ROut and covariant in E, so `never`/`unknown` accept any
// produced context and error type while still pinning the requirements (RIn) to `never`.
type RequiredLayer = Layer.Layer<never, unknown, never>;

export const CliConfigLive = CliConfig.layer(ComposioCliConfig) satisfies RequiredLayer;

export const ComposioUserContextLive = Layer.provide(
  _ComposioUserContextLive,
  Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOs.Default)
) satisfies RequiredLayer;

export const ComposioCliUserConfigLayer = Layer.provide(
  ComposioCliUserConfigLive,
  Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOs.Default)
);

export const ComposioSessionRepositoryLive = Layer.provide(
  ComposioSessionRepository.Default,
  Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOs.Default)
) satisfies RequiredLayer;

export const ComposioToolkitsRepositoryLive = Layer.provide(
  ComposioToolkitsRepository.Default,
  Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOs.Default, LogLevelFromConfigLive)
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
  Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOs.Default)
) satisfies RequiredLayer;

export const ComposioClientSingletonLive = Layer.provide(
  ComposioClientSingleton.Default,
  Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOs.Default, LogLevelFromConfigLive)
) satisfies RequiredLayer;

// Fed the cached repository so that the staleness refresh behind it shares the
// one catalog fetch a run is allowed, rather than starting a second.
export const ToolkitSlugCatalogLive = Layer.provide(
  ToolkitSlugCatalog.Default,
  ComposioToolkitsRepositoryCachedLive
) satisfies RequiredLayer;

export const DashboardToolExecutionLive = Layer.provide(
  DashboardToolExecution.Default,
  Layer.mergeAll(ComposioUserContextLive, FetchHttpClient.layer)
);

export const ToolsExecutorLive = Layer.provide(
  _ToolsExecutorLive,
  Layer.mergeAll(ComposioClientSingletonLive, ToolkitSlugCatalogLive, DashboardToolExecutionLive)
) satisfies RequiredLayer;

export const ProjectContextLive = Layer.provide(
  ProjectContext.Default,
  Layer.mergeAll(BunFileSystem.layer, NodeOs.Default, NodeProcess.Default)
) satisfies RequiredLayer;

export const SetupSkillInstallerLive = Layer.provide(
  SetupSkillInstaller.Default,
  Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOs.Default)
) satisfies RequiredLayer;

export const PendingLoginSessionLive = Layer.provide(
  PendingLoginSession.Default,
  Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOs.Default)
) satisfies RequiredLayer;

export const BackendMismatchWarningLive = Layer.provide(
  BackendMismatchWarning.Default,
  Layer.mergeAll(ComposioUserContextLive, TerminalUILive)
) satisfies RequiredLayer;

// `Path.layer`, not `BunPath.layer`: the update notice and the plugin hint have always resolved
// their state files with Effect's own path implementation.
export const UpdateNoticeLive = Layer.provide(
  UpdateNotice.Default,
  Layer.mergeAll(TerminalUILive, BunFileSystem.layer, Path.layer, NodeOs.Default)
) satisfies RequiredLayer;

export const PluginHintLive = Layer.provide(
  PluginHint.Default,
  Layer.mergeAll(TerminalUILive, BunFileSystem.layer, Path.layer, NodeOs.Default)
) satisfies RequiredLayer;

export const CommandLifecycleTelemetryLive = Layer.provide(
  CommandLifecycleTelemetry.Default,
  Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOs.Default, TerminalUILive)
) satisfies RequiredLayer;

export const InvocationLive = Layer.mergeAll(
  CliConfigLive.pipe(Layer.provide(LogLevelFromConfigLive)),
  NodeOs.Default,
  NodeProcess.Default,
  UpgradeBinaryLive,
  ComposioCliUserConfigLayer,
  ComposioUserContextLive,
  ComposioSessionRepositoryLive,
  ComposioClientSingletonLive,
  ComposioToolkitsRepositoryCachedLive,
  ToolkitSlugCatalogLive,
  ToolsExecutorLive,
  JsPackageManagerDetector.Default,
  ProjectEnvironmentDetector.Default,
  CommandRunner.Default,
  SetupSkillInstallerLive,
  TriggersRealtimeLive,
  ProjectContextLive,
  PendingLoginSessionLive,
  BunServices.layer,
  BunFileSystem.layer,
  BunPath.layer,
  FetchHttpClient.layer,
  StdinLive,
  TerminalUILive,
  BackendMismatchWarningLive,
  UpdateNoticeLive,
  PluginHintLive,
  CommandLifecycleTelemetryLive,
  Layer.merge(
    Logger.layer([withoutClientNotices(Logger.consolePretty())]),
    Layer.succeed(Logger.LogToStderr, true)
  )
) satisfies RequiredLayer;
