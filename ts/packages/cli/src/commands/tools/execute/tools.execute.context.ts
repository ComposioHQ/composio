import { Effect, Option } from 'effect';
import { actingUser } from 'src/commands/surface';
import { APP_CONFIG } from 'src/config';
import { toolkitFromToolSlug } from 'src/effects/toolkit-from-tool-slug';
import { resolveCliSessionArtifacts } from 'src/services/cli-session-artifacts';
import { resolveCommandProject } from 'src/services/command-project';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import type { ToolkitProjectScope } from 'src/services/composio-clients';
import { resolveConnectedAccountForToolkit } from 'src/services/connected-account-selection';
import { resolveConsumerExecutionTransport } from 'src/services/dashboard-tool-execution';
import { TerminalUI } from 'src/services/terminal-ui';
import { getOrFetchToolInputDefinition } from 'src/services/tool-input-validation';
import { ToolsExecutor } from 'src/services/tools-executor';
import type { ToolExecuteParams } from 'src/services/tools-executor';
import { injectSingleFileArgument, parseArguments, resolveInput } from './tools.execute.arguments';

export type RunToolsExecuteParams = {
  slug: string;
  data: Option.Option<string>;
  file: Option.Option<string>;
  account: Option.Option<string>;
  projectName: Option.Option<string>;
  surface: 'root' | 'dev';
  projectMode: 'consumer' | 'developer';
  getSchema: boolean;
  dryRun: boolean;
  skipConnectionCheck: boolean;
  skipToolParamsCheck: boolean;
  skipChecks: boolean;
};

export type SharedRunToolsExecuteParams = Omit<RunToolsExecuteParams, 'slug' | 'data' | 'file'>;

export type ResolvedExecuteContext = {
  readonly ui: TerminalUI;
  readonly executor: ToolsExecutor;
  readonly resolvedProject: {
    readonly orgId: string;
    readonly projectId: string;
    readonly projectType: 'CONSUMER' | 'DEVELOPER';
    readonly consumerUserId?: string;
  };
  readonly args: Record<string, unknown>;
  readonly resolvedUserId: string;
  readonly selectedConnectedAccountId?: string;
  readonly executeParams: ToolExecuteParams;
  readonly executeOutputDir?: string;
};

/**
 * The resolved project as toolkit resolution needs it: custom toolkits are
 * listed per project, and it has to be the project execute runs against.
 */
export const toolkitProjectScope = (resolvedProject: ToolkitProjectScope): ToolkitProjectScope => ({
  orgId: resolvedProject.orgId,
  projectId: resolvedProject.projectId,
});

type ResolvedSchemaContext = {
  readonly ui: TerminalUI;
  readonly resolvedProject: {
    readonly orgId: string;
    readonly projectId: string;
    readonly projectType: 'CONSUMER' | 'DEVELOPER';
    readonly consumerUserId?: string;
  };
};

export const resolveExecuteContext = (
  params: RunToolsExecuteParams,
  /** The acting user; `--parallel` resolves it once for all its tools. */
  user: ReturnType<typeof actingUser> = actingUser()
) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const executor = yield* ToolsExecutor;
    const input = (yield* resolveInput(params.data)) ?? '{}';
    const parsedArgs = yield* parseArguments(input);
    const runOutputDirectory = yield* APP_CONFIG.RUN_OUTPUT_DIR;

    const { userId: resolvedUserId, project: resolvedProject } = yield* user;
    const clientSingleton = yield* ComposioClientSingleton;
    const client = yield* clientSingleton.getFor({
      orgId: resolvedProject.orgId,
      projectId: resolvedProject.projectId,
    });
    const toolkitSlug = yield* toolkitFromToolSlug(
      params.slug,
      toolkitProjectScope(resolvedProject)
    );
    const selectedConnectedAccountId = yield* resolveConnectedAccountForToolkit({
      client,
      toolkitSlug,
      userId: resolvedUserId,
      selector: params.account,
    });
    const args = Option.isSome(params.file)
      ? yield* getOrFetchToolInputDefinition(params.slug, {
          orgId: resolvedProject.orgId,
          projectId: resolvedProject.projectId,
        }).pipe(
          Effect.flatMap(definition =>
            injectSingleFileArgument({
              slug: params.slug,
              args: parsedArgs,
              filePath: Option.getOrThrow(params.file),
              schema: definition.schema,
            })
          )
        )
      : parsedArgs;
    const executeOutputDir =
      runOutputDirectory ||
      Option.getOrUndefined(
        yield* resolveCliSessionArtifacts({
          orgId: resolvedProject.projectType === 'CONSUMER' ? resolvedProject.orgId : undefined,
          consumerUserId:
            resolvedProject.projectType === 'CONSUMER' ? resolvedProject.consumerUserId : undefined,
        }).pipe(Effect.map(Option.map(artifacts => artifacts.directoryPath)))
      );

    // Root `execute` (the consumer surface, which is also what `composio run`
    // spawns) goes through the Dashboard; `dev playground-execute` stays on the
    // backend. The one exception is a backend URL overridden without a
    // matching `COMPOSIO_WEB_URL`: the key is never sent to another
    // deployment's Dashboard.
    const executesViaDashboard =
      params.surface === 'root' && (yield* resolveConsumerExecutionTransport) === 'dashboard';

    return {
      ui,
      executor,
      resolvedProject,
      args,
      resolvedUserId,
      selectedConnectedAccountId,
      executeOutputDir,
      executeParams: {
        userId: resolvedUserId,
        target: executesViaDashboard
          ? { kind: 'dashboard', orgId: resolvedProject.orgId }
          : { kind: 'backend' },
        arguments: args,
        client,
        projectScope: {
          orgId: resolvedProject.orgId,
          projectId: resolvedProject.projectId,
        },
        connectedAccounts:
          toolkitSlug && selectedConnectedAccountId
            ? {
                [toolkitSlug]: selectedConnectedAccountId,
              }
            : undefined,
        cacheScope:
          resolvedProject.projectType === 'CONSUMER' && resolvedProject.consumerUserId
            ? {
                orgId: resolvedProject.orgId,
                projectId: resolvedProject.projectId,
                consumerUserId: resolvedProject.consumerUserId,
              }
            : undefined,
      },
    } satisfies ResolvedExecuteContext;
  });

export const resolveSchemaContext = (params: SharedRunToolsExecuteParams) =>
  Effect.gen(function* () {
    const resolvedProject = yield* resolveCommandProject({
      mode: params.projectMode,
      projectName:
        params.surface === 'root' ? undefined : Option.getOrUndefined(params.projectName),
    });
    const ui = yield* TerminalUI;

    return {
      ui,
      resolvedProject,
    } satisfies ResolvedSchemaContext;
  });
