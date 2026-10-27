import path from 'node:path';
import * as tempy from 'tempy';
import {
  Auth,
  make as makeComposioClient,
  type ComposioError,
  type RequestOptions,
} from '@composio/client/effect';
import type {
  TriggerInstanceListActiveParams,
  TriggerInstanceUpsertParams,
} from '@composio/client/resources/trigger-instances';
import { TIMESTAMP } from '../models/account';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import {
  ConfigProvider,
  Console,
  Context,
  DateTime,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  References,
  Schedule,
} from 'effect';
import { CliConfig, type Command as CliCommand } from 'effect/cli';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { ComposioCliConfig } from 'src/cli-config';
import { hostOnlyEnvConfigProvider } from 'test/__utils__/live-env-config-provider';
import * as MockConsole from './mock-console';
import * as MockTerminal from './mock-terminal';
import { TerminalUITest } from './terminal-ui-test';
import { NodeProcess } from 'src/services/node-process';
import { cliDebugFlagsLayer } from 'src/services/runtime-flags';
import { PendingLoginSession } from 'src/services/pending-login-session';
import {
  ComposioClientSingleton,
  ComposioSessionRepository,
  ComposioToolkitsRepository,
  type ClientScope,
} from 'src/services/composio-clients';
import { JsPackageManagerDetector } from 'src/services/js-package-manager-detector';
import type { TriggerInstanceItem } from 'src/models/triggers';
import { ComposioUserContextLive } from 'src/services/user-context';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { CliUserConfig } from 'src/models/cli-user-config';
import { UpgradeBinary } from 'src/services/upgrade-binary';
import { NodeOs } from 'src/services/node-os';
import { TriggersRealtime } from 'src/services/triggers-realtime';
import { ShutdownSignal } from 'src/services/shutdown-signal';
import { ToolsExecutor, ToolsExecutorLive } from 'src/services/tools-executor';
import { DashboardToolExecutionTest, type DashboardTestResponder } from '../layers/dashboard';
import { ToolkitSlugCatalog } from 'src/services/toolkit-slug-catalog';
import type { ToolExecuteResponse } from 'src/services/tools-executor';
import type {
  SessionCreateResponse,
  SessionExecuteResponse,
  SessionExecuteMetaResponse,
  SessionLinkResponse,
  SessionSearchResponse,
  SessionToolkitsResponse,
  SessionProxyExecuteResponse,
  SessionCreateParams,
  SessionExecuteParams,
  SessionExecuteMetaParams,
  SessionLinkParams,
  SessionProxyExecuteParams,
  SessionSearchParams,
  SessionToolkitsParams,
} from '@composio/client/resources/tool-router';
import { Stdin } from 'src/services/stdin';
import { ProjectContext } from 'src/services/project-context';
import { ProjectEnvironmentDetector } from 'src/services/project-environment-detector';
import type { CommandRunnerShape } from 'src/services/command-runner';
import { TerminalUI } from 'src/services/terminal-ui';
import type { SetupSkillInstallerShape } from 'src/services/setup-skill-installer';
import { FetchHttpClient, HttpClient } from 'effect/http';
import * as BunServices from '@effect/platform-bun/BunServices';
import { notFoundError } from '../layers/not-found';
import { DEFAULT_PAGE_LIMIT } from '../layers/page';
import { CommandRunnerTest } from '../layers/command-runner';
import { SetupSkillInstallerTest } from '../layers/setup';
import { InvocationHooksTest } from '../layers/invocation-hooks';
import {
  resolveToolkitsTestData,
  toolkitCatalogMethods,
  type ToolkitsTestData,
} from '../layers/toolkits';
import {
  mockAccountResources,
  type AccountTestData,
  type MockRequestScope,
} from '../layers/accounts';
import {
  connectedAccountRepositoryMethods,
  mockConnectedAccountResources,
  resolveAuthConfigsTestData,
  resolveConnectedAccountsTestData,
  type AuthConfigsTestData,
  type ConnectedAccountsTestData,
} from '../layers/connected-accounts';

export type { MockAccountRequest, MockRequestScope } from '../layers/accounts';

export interface TestLiveInput {
  /**
   * Config provider to use in test. Its values win; anything it leaves unset falls through to
   * `hostOnlyEnvConfigProvider`, the live host environment without any `COMPOSIO_*`,
   * `DEBUG_OVERRIDE_*`, or `FORCE_*` variable, so `HOST_CONFIG` (`CI`, `VITEST`, `PATH`, the
   * agent-host markers) keeps reading the real process the way the old raw-provider bypass did.
   */
  baseConfigProvider?: ConfigProvider.ConfigProvider;

  /**
   * Fixture to use in test.
   * TODO: consider extracting `fixture` into another `Effect`.
   */
  fixture?: string;

  /**
   * Override the running-executable path reported by `NodeProcess`.
   *
   * A relative value resolves against the per-test home directory, which is a
   * fresh temp dir created while the layer is being built — so a scenario that
   * needs an exec path underneath it (e.g. `.local/bin/composio`) can stay
   * relative instead of spelling out a path it cannot know up front.
   * Defaults to `<homedir>/composio`.
   */
  execPath?: string;

  /**
   * Mock toolkit-related data to use in test.
   */
  toolkitsData?: ToolkitsTestData;

  /**
   * Account, session-info, and consumer data served by the mock client's
   * `org.*` and `auth.session.retrieveInfo` resources and its `get`/`post`
   * escape hatch.
   */
  accountData?: AccountTestData;

  /**
   * Mock auth-config data to use in test.
   */
  authConfigsData?: AuthConfigsTestData;

  /**
   * Mock connected-account data to use in test.
   */
  connectedAccountsData?: ConnectedAccountsTestData;

  /**
   * Mock trigger instance data to use in test.
   */
  triggersData?: {
    items?: TriggerInstanceItem[];
    /**
     * Make `triggerInstances.upsert` reject slugs missing from `toolkitsData.triggerTypes`,
     * as the API does for an unknown trigger type.
     */
    rejectUnknownTriggerSlugs?: boolean;
  };

  /**
   * Mock realtime trigger data to use in test.
   */
  realtimeData?: {
    events?: ReadonlyArray<Record<string, unknown>>;
  };

  cliUserConfig?: {
    developerModeEnabled?: boolean;
    developerDangerousCommandsEnabled?: boolean;
    experimentalFeatures?: Record<string, boolean>;
  };

  /**
   * Mock stdin for commands that read input.
   */
  stdin?: {
    isTTY: boolean;
    data: string;
  };

  /**
   * Override tools executor behavior for tests.
   *
   * When set, the `ToolsExecutor` service is replaced with a canned mock
   * that bypasses the real `ToolsExecutorLive` and the Tool Router entirely.
   * Use this only for tests that need to control the executor response directly
   * (e.g. soft failure tests).
   *
   * When NOT set, the real `ToolsExecutorLive` is used, which flows through
   * the mock `ComposioClientSingleton` → Tool Router session mocks.
   */
  toolsExecutor?: {
    failWith?: unknown;
    respondWith?: ToolExecuteResponse;
    /** Called each time the mock executor actually runs a tool call. */
    onExecute?: (slug: string) => void;
  };

  /**
   * Stand in for the Dashboard endpoints `composio execute` sends consumer
   * executions to.
   *
   * By default the test Dashboard does what the real one does with a request:
   * it creates a Tool Router session itself and executes on the mock client's
   * `toolRouter.session.*` handlers, relaying their answer or their status
   * error. Set `respond` to answer yourself; a rejection is delivered to the
   * CLI as a network failure.
   */
  dashboard?: {
    respond?: DashboardTestResponder;
  };

  /**
   * Override Tool Router session behavior for tests.
   *
   * Controls the mock `ComposioClientSingleton`'s `toolRouter.session.*` methods.
   * Each method can be overridden individually; defaults are provided for all.
   *
   * Each override answers with an Effect, so a test can fail a call with one
   * of the client's own errors or route it to a client over a stub transport.
   *
   * When `toolsExecutor` is also set, its mock takes precedence for `tools execute`
   * (the Tool Router mock is still used by `toolkits list`, `toolkits info`, etc.).
   */
  toolRouter?: {
    /** Override `session.create`. Receives the create params. */
    create?: (params: SessionCreateParams) => Effect.Effect<SessionCreateResponse, ComposioError>;
    /** Override `session.execute`. Receives sessionId, params, and request options. */
    execute?: (
      sessionId: string,
      params: SessionExecuteParams,
      options?: RequestOptions
    ) => Effect.Effect<SessionExecuteResponse, ComposioError>;
    /** Override `session.executeMeta`. Receives sessionId, params, and request options. */
    executeMeta?: (
      sessionId: string,
      params: SessionExecuteMetaParams,
      options?: RequestOptions
    ) => Effect.Effect<SessionExecuteMetaResponse, ComposioError>;
    /** Override `session.link`. Receives sessionId, params, and request options. */
    link?: (
      sessionId: string,
      params: SessionLinkParams,
      options?: RequestOptions
    ) => Effect.Effect<SessionLinkResponse, ComposioError>;
    /** Override `session.proxyExecute`. Receives sessionId, params, and request options. */
    proxyExecute?: (
      sessionId: string,
      params: SessionProxyExecuteParams,
      options?: RequestOptions
    ) => Effect.Effect<SessionProxyExecuteResponse, ComposioError>;
    /** Override `session.search`. Receives sessionId and params. */
    search?: (
      sessionId: string,
      params: SessionSearchParams
    ) => Effect.Effect<SessionSearchResponse, ComposioError>;
    /** Override `session.toolkits`. Receives sessionId and optional params. */
    toolkits?: (
      sessionId: string,
      params?: SessionToolkitsParams | null
    ) => Effect.Effect<SessionToolkitsResponse, ComposioError>;
  };

  /**
   * Override CommandRunner behavior for tests.
   * When set, the `CommandRunner` service uses the provided mock instance.
   * When NOT set, uses a default mock that always returns exit code 0.
   */
  commandRunner?: CommandRunnerShape;

  /** Override setup's Claude skill installer. Defaults to an idempotent no-op. */
  setupSkillInstaller?: SetupSkillInstallerShape;

  /**
   * Override TerminalUI behavior for tests.
   * When set, replaces the default TerminalUITest (which auto-selects first option).
   */
  terminalUI?: TerminalUI;
}

/**
 * Concrete Effect layer compositions for the Composio test suites.
 *
 *         ┌─── The service to be created
 *         │                ┌─── The possible error
 *         │                │      ┌─── The required dependencies
 *         ▼                ▼      ▼
 * Layer<RequirementsOut, Error, RequirementsIn>
 */

type RequiredLayer = Layer.Layer<CliCommand.Environment, unknown, never>;

/**
 * Effect layer that injects all the services needed for tests, using mocks to avoid
 * side-effects like unwanted HTTP requests to remote services.
 */
export const TestLayer = (input?: TestLiveInput) =>
  Effect.gen(function* () {
    const fixture = input?.fixture;
    const toolkitsData = resolveToolkitsTestData(input?.toolkitsData);

    const authConfigsData = resolveAuthConfigsTestData(input?.authConfigsData);
    const connectedAccountsData = resolveConnectedAccountsTestData(input?.connectedAccountsData);

    const defaultRealtimeData = {
      events: [] as ReadonlyArray<Record<string, unknown>>,
    } satisfies TestLiveInput['realtimeData'];
    const realtimeData = {
      ...defaultRealtimeData,
      ...(input?.realtimeData ?? {}),
    };

    const defaultTriggersData = {
      items: [] as TriggerInstanceItem[],
    } satisfies TestLiveInput['triggersData'];
    const triggersData = {
      ...defaultTriggersData,
      ...(input?.triggersData ?? {}),
    };

    const tempDir = tempy.temporaryDirectory({ prefix: 'test' });
    const cwd = (yield* setupFixtureFolder({ fixture, tempDir })) ?? tempDir;

    const ComposioToolkitsRepositoryTest = Layer.succeed(
      ComposioToolkitsRepository,
      ComposioToolkitsRepository.of({
        ...toolkitCatalogMethods(toolkitsData),
        ...connectedAccountRepositoryMethods(authConfigsData, connectedAccountsData),
        listActiveTriggers: (params: TriggerInstanceListActiveParams) => {
          let results = [...triggersData.items];

          const userIds = params.user_ids;
          if (userIds && userIds.length > 0) {
            const set = new Set(userIds);
            results = results.filter(item => set.has(item.user_id));
          }

          const connectedAccountIds = params.connected_account_ids;
          if (connectedAccountIds && connectedAccountIds.length > 0) {
            const set = new Set(connectedAccountIds);
            results = results.filter(item => set.has(item.connected_account_id));
          }

          const authConfigIds = params.auth_config_ids;
          if (authConfigIds && authConfigIds.length > 0) {
            const set = new Set(authConfigIds);
            results = results.filter(item => set.has(item.auth_config_id));
          }

          const triggerIds = params.trigger_ids;
          if (triggerIds && triggerIds.length > 0) {
            const set = new Set(triggerIds);
            results = results.filter(item => set.has(item.id));
          }

          const triggerNames = params.trigger_names;
          if (triggerNames && triggerNames.length > 0) {
            const set = new Set(triggerNames.map(name => name.toUpperCase()));
            results = results.filter(item => set.has(item.trigger_name.toUpperCase()));
          }

          const includeDisabled = params.show_disabled ?? false;
          if (!includeDisabled) {
            results = results.filter(item => item.disabled_at === null);
          }

          const limit = params.limit ?? DEFAULT_PAGE_LIMIT;
          const items = results.slice(0, limit);
          return Effect.succeed({
            items,
            total_items: results.length,
            total_pages: Math.ceil(results.length / limit),
            current_page: 1,
            next_cursor: null,
          });
        },
        createTrigger: (triggerSlug: string, params?: TriggerInstanceUpsertParams) =>
          Effect.succeed({
            trigger_id: `trg_${triggerSlug.toLowerCase()}_${params?.connected_account_id ?? 'new'}`,
          }),
        enableTrigger: () => Effect.succeed({ status: 'success' as const }),
        disableTrigger: () => Effect.succeed({ status: 'success' as const }),
      })
    );
    const ComposioSessionRepositoryTest = yield* setupComposioSessionRepository();
    const TriggersRealtimeTest = Layer.succeed(
      TriggersRealtime,
      TriggersRealtime.of({
        listen: (onEvent, options) =>
          Effect.gen(function* () {
            yield* options?.onSubscribed ?? Effect.void;
            yield* Effect.forEach(realtimeData.events, event => Effect.sync(() => onEvent(event)));
            return yield* Effect.never;
          }).pipe(Effect.scoped),
        listenInProject: (_scope, onEvent, options) =>
          Effect.gen(function* () {
            yield* options?.onSubscribed ?? Effect.void;
            yield* Effect.forEach(realtimeData.events, event => Effect.sync(() => onEvent(event)));
            return yield* Effect.never;
          }).pipe(Effect.scoped),
      })
    );

    // Mock operating-system details
    const NodeOsTest = Layer.succeed(
      NodeOs,
      NodeOs.of({
        homedir: cwd,
        tmpdir: tempy.rootTemporaryDirectory,
        arch: 'arm64',
        platform: 'darwin',
      })
    );

    // Mock `node:process`
    const NodeProcessTest = Layer.succeed(
      NodeProcess,
      NodeProcess.of({
        cwd,
        execPath: input?.execPath ? path.resolve(cwd, input.execPath) : path.join(cwd, 'composio'),
        platform: 'darwin',
        arch: 'arm64',
      })
    );

    const ComposioUserContextTest = Layer.provideMerge(
      ComposioUserContextLive,
      Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOsTest)
    );

    let rawCliUserConfig = CliUserConfig.make({
      developer: {
        enabled: input?.cliUserConfig?.developerModeEnabled ?? true,
        destructiveActions: input?.cliUserConfig?.developerDangerousCommandsEnabled ?? false,
      },
      experimentalFeatures: input?.cliUserConfig?.experimentalFeatures ?? {},
      artifactDirectory: Option.none(),
      security: 'auto',
    });

    const ComposioCliUserConfigTest = Layer.succeed(
      ComposioCliUserConfig,
      ComposioCliUserConfig.of({
        get data() {
          return {
            channel: 'beta' as const,
            developerModeEnabled: rawCliUserConfig.developer.enabled,
            developerDangerousCommandsEnabled: rawCliUserConfig.developer.destructiveActions,
            experimentalFeatures: rawCliUserConfig.experimentalFeatures,
            artifactDirectory: Option.getOrUndefined(rawCliUserConfig.artifactDirectory),
            security: 'auto' as const,
          };
        },
        get raw() {
          return rawCliUserConfig;
        },
        channel: 'beta',
        isDevModeEnabled: () => rawCliUserConfig.developer.enabled,
        areDeveloperDangerousCommandsEnabled: () => rawCliUserConfig.developer.destructiveActions,
        isExperimentalFeatureEnabled: feature =>
          rawCliUserConfig.experimentalFeatures[feature] ?? true,
        update: next =>
          Effect.sync(() => {
            rawCliUserConfig = CliUserConfig.make({
              ...rawCliUserConfig,
              ...next,
            });
          }),
      })
    );

    const UpgradeBinaryTest = Layer.provide(
      UpgradeBinary.Default,
      Layer.mergeAll(BunFileSystem.layer, FetchHttpClient.layer)
    );

    const StdinTest = Layer.succeed(
      Stdin,
      Stdin.of({
        isTTY: () => input?.stdin?.isTTY ?? true,
        readAll: () => Effect.succeed(input?.stdin?.data ?? ''),
      })
    );

    // --- Tool Router mock (ComposioClientSingleton) ---
    // Provides a fake `@composio/client` Composio instance with configurable
    // `toolRouter.session.*` methods. Each method has a sensible default that
    // can be overridden per-test via `input.toolRouter.<method>`.

    const toolRouterOverrides = input?.toolRouter;

    const defaultToolkitsHandler = (
      _sessionId: string,
      params?: SessionToolkitsParams | null
    ): Effect.Effect<SessionToolkitsResponse> =>
      Effect.sync(() => {
        let results: SessionToolkitsResponse['items'] = toolkitsData.toolkits.map(t => ({
          slug: t.slug,
          name: t.name,
          meta: { description: t.meta.description, logo: '' },
          is_no_auth: t.no_auth ?? false,
          enabled: true,
          connected_account: null,
          composio_managed_auth_schemes: [...(t.composio_managed_auth_schemes ?? [])],
        }));

        if (params?.search) {
          const q = params.search.toLowerCase();
          results = results.filter(
            t =>
              t.name.toLowerCase().includes(q) ||
              t.slug.toLowerCase().includes(q) ||
              t.meta.description.toLowerCase().includes(q)
          );
        }

        if (params?.toolkits) {
          const slugSet = new Set(params.toolkits.map(s => s.toLowerCase()));
          results = results.filter(t => slugSet.has(t.slug.toLowerCase()));
        }

        const limit = params?.limit ?? 1000;
        const items = results.slice(0, limit);
        return {
          items,
          current_page: 1,
          total_items: results.length,
          total_pages: Math.ceil(results.length / limit),
          next_cursor: null,
        };
      });

    const defaultSearchHandler = (
      _sessionId: string,
      params: SessionSearchParams
    ): Effect.Effect<SessionSearchResponse> =>
      Effect.sync(() => {
        const results = params.queries.map((query, index) => {
          const queryUseCase = query.use_case ?? '';
          const normalizedQuery = queryUseCase.toLowerCase();
          const matchedTools = toolkitsData.tools.filter(
            tool =>
              tool.name.toLowerCase().includes(normalizedQuery) ||
              tool.slug.toLowerCase().includes(normalizedQuery) ||
              tool.description.toLowerCase().includes(normalizedQuery)
          );

          return {
            index: index + 1,
            use_case: queryUseCase,
            primary_tool_slugs: matchedTools.map(tool => tool.slug),
            related_tool_slugs: [],
            toolkits: Array.from(
              new Set(
                matchedTools
                  .map(tool => tool.slug.split('_')[0]?.toLowerCase() ?? '')
                  .filter(Boolean)
              )
            ),
            matchedTools,
          };
        });

        const allMatchedTools = results.flatMap(result => result.matchedTools);
        const toolSchemas = Object.fromEntries(
          allMatchedTools.map(tool => [
            tool.slug,
            {
              tool_slug: tool.slug,
              toolkit: tool.slug.split('_')[0]?.toLowerCase() ?? '',
              description: tool.description,
              hasFullSchema: true,
              input_schema: tool.input_parameters,
              output_schema: tool.output_parameters,
            },
          ])
        );
        const toolkitConnectionStatuses = Array.from(
          new Set(
            allMatchedTools
              .map(tool => tool.slug.split('_')[0]?.toLowerCase() ?? '')
              .filter(Boolean)
          )
        ).map(toolkitSlug => ({
          toolkit: toolkitSlug,
          description: `${toolkitSlug} toolkit`,
          has_active_connection: false,
          status_message: 'No active connection',
        }));

        return {
          success: true,
          error: null,
          results: results.map(({ matchedTools: _matchedTools, ...result }) => result),
          tool_schemas: toolSchemas,
          toolkit_connection_statuses: toolkitConnectionStatuses,
          next_steps_guidance: [],
          session: {
            id: 'trs_test_session',
            generate_id: false,
            instructions: 'Reuse this session id for follow-up calls.',
          },
          time_info: {
            current_time_utc: TIMESTAMP,
            current_time_utc_epoch_seconds: 1767225600,
            message: 'UTC time',
          },
        };
      });

    // What the mock client answers with instead of calling the network.
    const resourceShadows = {
      ...mockConnectedAccountResources(connectedAccountsData),
      triggersTypes: {
        retrieve: (slug: string) => {
          const found = toolkitsData.triggerTypes.find(
            trigger => trigger.slug.toUpperCase() === slug.toUpperCase()
          );
          return found
            ? Effect.succeed(found)
            : Effect.fail(notFoundError(`Trigger type "${slug}" not found`));
        },
      },
      triggerInstances: {
        upsert: (
          triggerSlug: string,
          params?: {
            connected_account_id?: string;
            trigger_config?: Record<string, unknown>;
          }
        ) => {
          if (
            input?.triggersData?.rejectUnknownTriggerSlugs &&
            !toolkitsData.triggerTypes.some(
              trigger => trigger.slug.toUpperCase() === triggerSlug.toUpperCase()
            )
          ) {
            return Effect.fail(notFoundError(`Trigger type "${triggerSlug}" not found`));
          }
          return Effect.succeed({
            trigger_id: `trg_${triggerSlug.toLowerCase()}_${params?.connected_account_id ?? 'new'}`,
          });
        },
        manage: {
          update: (triggerId: string, params: { status: 'enable' | 'disable' }) =>
            Effect.succeed({
              trigger_id: triggerId,
              status: params.status,
            }),
        },
      },
      toolkits: {
        retrieve: (slug: string) => {
          const detailed = toolkitsData.detailedToolkits.find(
            t => t.slug.toLowerCase() === slug.toLowerCase()
          );
          if (detailed) {
            return Effect.succeed({
              name: detailed.name,
              slug: detailed.slug,
              is_local_toolkit: detailed.is_local_toolkit,
              composio_managed_auth_schemes: [...detailed.composio_managed_auth_schemes],
              no_auth: detailed.no_auth,
              meta: detailed.meta,
            });
          }

          const found = toolkitsData.toolkits.find(
            t => t.slug.toLowerCase() === slug.toLowerCase()
          );
          if (!found) {
            return Effect.fail(notFoundError(`Toolkit "${slug}" not found`));
          }
          return Effect.succeed({
            name: found.name,
            slug: found.slug,
            is_local_toolkit: found.is_local_toolkit,
            composio_managed_auth_schemes: [...found.composio_managed_auth_schemes],
            no_auth: found.no_auth,
            meta: found.meta,
          });
        },
      },
      files: {
        createPresignedURL: (params: {
          filename: string;
          mimetype: string;
          md5: string;
          tool_slug: string;
          toolkit_slug: string;
        }) =>
          Effect.succeed({
            key: `uploads/${params.filename}`,
            new_presigned_url: 'https://s3.test.composio.dev/upload',
          }),
      },
      toolRouter: {
        session: {
          create:
            toolRouterOverrides?.create ??
            ((params: SessionCreateParams) =>
              Effect.succeed({
                session_id: 'trs_test_session',
                config: { user_id: params.user_id },
                mcp: { type: 'http' as const, url: 'https://mcp.test.composio.dev' },
                tool_router_tools: ['COMPOSIO_SEARCH_TOOLS', 'COMPOSIO_MANAGE_CONNECTIONS'],
              })),
          execute:
            toolRouterOverrides?.execute ??
            ((_sessionId: string, params: SessionExecuteParams) =>
              Effect.succeed({
                result_type: 'completed' as const,
                data: { tool_slug: params.tool_slug, arguments: params.arguments },
                error: null,
                log_id: 'log_test',
              })),
          executeMeta:
            toolRouterOverrides?.executeMeta ??
            ((_sessionId: string, params: SessionExecuteMetaParams) =>
              Effect.succeed({
                result_type: 'completed' as const,
                data: { slug: params.slug, arguments: params.arguments },
                error: null,
                log_id: 'log_test',
              })),
          link:
            toolRouterOverrides?.link ??
            (() =>
              Effect.succeed({
                connected_account_id: 'con_test_link',
                link_token: 'lt_test_token',
                redirect_url: 'https://app.composio.dev/link?token=lt_test_token',
                account_type: 'PRIVATE' as const,
              })),
          proxyExecute:
            toolRouterOverrides?.proxyExecute ??
            ((_sessionId: string, params: SessionProxyExecuteParams) =>
              Effect.succeed({
                status: 200,
                data: {
                  toolkit_slug: params.toolkit_slug,
                  endpoint: params.endpoint,
                  method: params.method,
                  body: params.body ?? null,
                  parameters: params.parameters ?? [],
                },
                headers: {},
              })),
          search: toolRouterOverrides?.search ?? defaultSearchHandler,
          toolkits: toolRouterOverrides?.toolkits ?? defaultToolkitsHandler,
        },
      },
    };

    // A resource the shadows do not cover reaches the transport, which dies
    // with the URL instead of sending a live request.
    const dieOnNetworkCall = HttpClient.make(request =>
      Effect.die(new Error(`unexpected network call from the mock Composio client: ${request.url}`))
    );

    // Each shadow answers with an Effect, built when the call runs. A shadow
    // ignores the request options
    // (`signal`, `maxRetries`, headers beyond `decode`), and the
    // `connectedAccounts.list` shadow never pages (`next_cursor` is null):
    // pagination, retries, and abort are covered by `stubComposioClient`,
    // the real `make` over a recording transport.
    const withShadows = <Resources extends object>(base: Resources, shadows: object): Resources => {
      const shadowed = { ...base } as Record<string, unknown>;
      for (const [key, shadow] of Object.entries(shadows) as Array<[string, unknown]>) {
        shadowed[key] =
          typeof shadow === 'function'
            ? (...args: ReadonlyArray<unknown>) =>
                Effect.suspend(() => shadow(...args) as Effect.Effect<unknown, unknown>)
            : withShadows((shadowed[key] ?? {}) as object, shadow as object);
      }
      return shadowed as Resources;
    };

    const mockComposioClient = withShadows(
      makeComposioClient(
        {
          auth: Auth.project('test'),
          baseURL: 'https://mock.invalid',
        },
        dieOnNetworkCall
      ),
      resourceShadows
    );

    // --- Account, session-info, and consumer endpoints ---
    // Served per client scope; see `mockAccountResources`.
    const accountData = input?.accountData ?? {};

    const scopedClients = new Map<string, typeof mockComposioClient>();
    const mockClientFor = (scope: MockRequestScope) => {
      const key = JSON.stringify([scope.userApiKey, scope.apiKey, scope.orgId, scope.projectId]);
      const cached = scopedClients.get(key);
      if (cached) return cached;
      const scoped = withShadows(mockComposioClient, mockAccountResources(accountData, scope));
      scopedClients.set(key, scoped);
      return scoped;
    };

    const ComposioClientSingletonTest = Layer.succeed(
      ComposioClientSingleton,
      ComposioClientSingleton.of({
        get: Effect.fn(function* () {
          return mockClientFor({});
        }),
        getFor: Effect.fn(function* (params: ClientScope) {
          return mockClientFor({
            userApiKey: params.userApiKey,
            apiKey: params.projectApiKey,
            orgId: params.orgId,
            projectId: params.projectId,
          });
        }),
        getMetrics: () => Effect.succeed({ byteSize: 0, requests: 0 }),
      })
    );

    // Built per test layer, so each test resolves toolkit slugs against its own
    // cache directory rather than inheriting a memo from an earlier test.
    const ToolkitSlugCatalogTest = Layer.provide(
      ToolkitSlugCatalog.Default,
      ComposioToolkitsRepositoryTest
    );

    // --- ToolsExecutor ---
    // When `input.toolsExecutor` is set, use a canned mock (bypasses Tool Router).
    // Otherwise, use the real ToolsExecutorLive which flows through the mock ComposioClientSingleton.
    const ToolsExecutorTest = input?.toolsExecutor
      ? Layer.succeed(
          ToolsExecutor,
          ToolsExecutor.of({
            execute: (slug, params) =>
              Effect.suspend(() => {
                input.toolsExecutor!.onExecute?.(slug);
                if (input.toolsExecutor!.failWith) {
                  return Effect.fail(input.toolsExecutor!.failWith);
                }
                if (input.toolsExecutor!.respondWith) {
                  return Effect.succeed(input.toolsExecutor!.respondWith);
                }
                return Effect.succeed({
                  data: { slug, params },
                  error: null,
                  successful: true,
                  logId: 'log_test',
                });
              }),
          })
        )
      : Layer.provide(
          ToolsExecutorLive,
          Layer.mergeAll(
            ComposioClientSingletonTest,
            ToolkitSlugCatalogTest,
            Layer.provide(
              DashboardToolExecutionTest({
                toolRouter: mockComposioClient.toolRouter,
                respond: input?.dashboard?.respond,
              }),
              ComposioUserContextTest
            )
          )
        );

    const CliConfigLive = CliConfig.layer(ComposioCliConfig);

    // TerminalUI — use provided override or default TerminalUITest
    const TerminalUILayer = input?.terminalUI
      ? Layer.succeed(TerminalUI, input.terminalUI)
      : TerminalUITest;

    const _console = yield* MockConsole.make;

    const layers = Layer.mergeAll(
      Layer.succeed(Console.Console, _console),
      CliConfigLive,
      // Mirror `InvocationLive`: no custom `CliOutput.Formatter` is provided here either
      // — `CliOutput.Formatter` is a `Context.Reference` that falls back to v4's
      // own `CliOutput.defaultFormatter()`, so `Command.runWith` renders help,
      // errors, and `--version` identically to production.
      NodeProcessTest,
      UpgradeBinaryTest,
      ComposioCliUserConfigTest,
      ComposioUserContextTest,
      ComposioClientSingletonTest,
      ComposioSessionRepositoryTest,
      TriggersRealtimeTest,
      // No runner signals tests; a suite that needs one provides its own controller's service.
      ShutdownSignal.Default,
      ComposioToolkitsRepositoryTest,
      ToolkitSlugCatalogTest,
      JsPackageManagerDetector.Default,
      ProjectEnvironmentDetector.Default,
      CommandRunnerTest(input?.commandRunner),
      SetupSkillInstallerTest(input?.setupSkillInstaller),
      ToolsExecutorTest,
      BunFileSystem.layer,
      BunServices.layer,
      MockTerminal.layer,
      BunPath.layer,
      FetchHttpClient.layer,
      StdinTest,
      TerminalUILayer,
      // Recording no-op doubles of the hooks and telemetry sink the invocation runs around a
      // command; read their calls with `recordedInvocationCalls`.
      InvocationHooksTest,
      // `src/commands/index.ts` provides these for real invocations; direct-effect tests that
      // never route through the root command still need the "no CLI flag override" default.
      cliDebugFlagsLayer(),
      Layer.provide(
        PendingLoginSession.Default,
        Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOsTest)
      ),
      Layer.provide(
        ProjectContext.Default,
        Layer.mergeAll(BunFileSystem.layer, NodeOsTest, NodeProcessTest)
      )
    ) satisfies RequiredLayer;

    return layers;
  }).pipe(
    Effect.provideService(References.MinimumLogLevel, 'Debug'),
    Effect.scoped,
    Layer.unwrap,
    // `Layer.provide` only feeds `ConfigProvider` to the layers built above and hides it from
    // the resulting layer's output; downstream consumers of `TestLayer` (e.g. command handlers
    // reading `Config`/`DEBUG_OVERRIDE_*` at runtime) would fall back to the default
    // `ConfigProvider` reference instead of the test's `baseConfigProvider`. `Layer.provideMerge`
    // keeps `ConfigProvider` in the output so it stays visible to everything `TestLayer` provides.
    Layer.provideMerge(
      ConfigProvider.layer(
        input?.baseConfigProvider === undefined
          ? hostOnlyEnvConfigProvider
          : ConfigProvider.orElse(input.baseConfigProvider, hostOnlyEnvConfigProvider)
      )
    )
  );

// Run @effect/vitest suite with TestLive layer
export const runEffect =
  (input?: TestLiveInput) =>
  <E, A>(self: Effect.Effect<A, E, CliCommand.Environment>): Promise<A> =>
    Effect.provide(self, TestLayer(input)).pipe(Effect.scoped, Effect.runPromise);

function setupFixtureFolder({ fixture, tempDir }: { fixture?: string; tempDir: string }) {
  return Effect.gen(function* () {
    if (fixture === undefined) {
      return;
    }

    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const fixtureRoot = yield* path.fromFileUrl(new URL('.', import.meta.url));
    const realFixturePath = path.resolve(fixtureRoot, '..', '..', '__fixtures__', fixture);
    const tmpFixturesPath = path.join(tempDir, 'test', '__fixtures__', fixture);

    yield* Effect.logDebug(`Using fixture at: ${tmpFixturesPath}`);

    // Retry the task with a delay between retries and a maximum of 3 retries
    const policy = Schedule.addDelay(Schedule.recurs(3), () => Effect.succeed('100 millis'));

    // If all retries fail, run the fallback effect.
    // Use tar to skip heavy directories (.venv) that the global setup may have created.
    // tar --exclude is POSIX and available on any Linux/macOS without extra packages.
    const task = Effect.gen(function* () {
      yield* fs.makeDirectory(tmpFixturesPath, { recursive: true });
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const tarCmd = ChildProcess.make('tar', [
        '-cf',
        '-',
        '--exclude',
        '.venv',
        '-C',
        realFixturePath,
        '.',
      ]).pipe(ChildProcess.pipeTo(ChildProcess.make('tar', ['-xf', '-', '-C', tmpFixturesPath])));
      yield* spawner.exitCode(tarCmd);
    });

    const repeated = Effect.retryOrElse(policy, () =>
      Effect.die(`Failed to copy fixture to: ${tmpFixturesPath}`)
    );

    yield* repeated(task);

    yield* Effect.logDebug(`Copied fixture to: ${tmpFixturesPath}`);

    // Break symlinks in node_modules to isolate test from real packages
    const nodeModulesPath = path.join(tmpFixturesPath, 'node_modules');
    yield* breakSymlinksInNodeModules(fs, path, nodeModulesPath);

    return tmpFixturesPath;
  }).pipe(Effect.provide(BunServices.layer));
}

/**
 * Breaks symlinks in node_modules to ensure test isolation.
 * - On Unix: Uses `find -type l` for O(1) shell call to detect all symlinks
 * - On Windows: Uses O(n) readLink approach for compatibility
 */
function breakSymlinksInNodeModules(
  fs: FileSystem.FileSystem,
  path: Path.Path,
  nodeModulesPath: string
): Effect.Effect<void, never, never> {
  // Helper: break a symlink by replacing it with a copy of its target
  const breakSymlink = (symlinkPath: string) =>
    Effect.gen(function* () {
      const realPath = yield* fs.realPath(symlinkPath);
      yield* Effect.logDebug(`Breaking symlink: ${symlinkPath} -> ${realPath}`);
      yield* fs.remove(symlinkPath, { recursive: true });
      yield* fs.copy(realPath, symlinkPath);
    });

  // Unix: Use `find` command for fast symlink detection
  const breakSymlinksUnix = Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const findCmd = ChildProcess.make('find', [
      nodeModulesPath,
      '-maxdepth',
      '2',
      '-type',
      'l',
      '-not',
      '-path',
      '*/.*',
    ]);
    const output = yield* spawner.string(findCmd);
    const symlinks = output.trim().split('\n').filter(Boolean);

    if (symlinks.length === 0) {
      return;
    }

    yield* Effect.logDebug(`Found ${symlinks.length} symlinks to break`);
    yield* Effect.all(symlinks.map(breakSymlink), { concurrency: 'unbounded' });
  }).pipe(Effect.provide(BunServices.layer));

  // Windows: Use readLink to detect symlinks (O(n) but compatible)
  const breakSymlinksWindows = Effect.gen(function* () {
    const isSymlink = (p: string) =>
      fs.readLink(p).pipe(
        Effect.map(() => true),
        Effect.catch(() => Effect.succeed(false))
      );

    const entries = yield* fs.readDirectory(nodeModulesPath);

    yield* Effect.all(
      entries.map(entry => {
        if (entry.startsWith('.')) {
          return Effect.void;
        }

        const entryPath = path.join(nodeModulesPath, entry);
        return Effect.gen(function* () {
          const isLink = yield* isSymlink(entryPath);

          if (isLink) {
            yield* breakSymlink(entryPath);
          } else if (entry.startsWith('@')) {
            const scopedEntries = yield* fs.readDirectory(entryPath);
            yield* Effect.all(
              scopedEntries.map(scopedEntry => {
                const scopedPath = path.join(entryPath, scopedEntry);
                return Effect.gen(function* () {
                  const isScopedLink = yield* isSymlink(scopedPath);
                  if (isScopedLink) {
                    yield* breakSymlink(scopedPath);
                  }
                });
              }),
              { concurrency: 'unbounded' }
            );
          }
        });
      }),
      { concurrency: 'unbounded' }
    );
  });

  return Effect.gen(function* () {
    const exists = yield* fs.exists(nodeModulesPath);
    if (!exists) {
      return;
    }

    // Some fixtures can contain node_modules as a symlink (often broken in temp copies).
    // Normalize it first so tests can safely create nested paths like node_modules/@scope/pkg.
    const nodeModulesLink = yield* fs.readLink(nodeModulesPath).pipe(
      Effect.map(() => true),
      Effect.catch(() => Effect.succeed(false))
    );

    if (nodeModulesLink) {
      yield* fs.remove(nodeModulesPath, { recursive: true }).pipe(Effect.catch(() => Effect.void));
      yield* fs
        .makeDirectory(nodeModulesPath, { recursive: true })
        .pipe(Effect.catch(() => Effect.void));
    }

    const isWindows = process.platform === 'win32';

    if (isWindows) {
      yield* breakSymlinksWindows;
    } else {
      yield* breakSymlinksUnix;
    }
  }).pipe(Effect.catch(() => Effect.void));
}

function setupComposioSessionRepository() {
  return Effect.gen(function* () {
    const now = yield* DateTime.now;
    const sessionId = 'te00st11-d0c4-4efa-8117-c638886063e0';
    const sessionCode = '001122';
    const expiresAt = DateTime.add(now, { minutes: 10 });

    const accountName = 'test-name';
    const accountId = 'test-id';
    const accountEmail = 'test.name@gmail.com';

    const account = {
      name: accountName,
      id: accountId,
      email: accountEmail,
    };

    const composioSessionRepositoryTest = ComposioSessionRepository.of({
      createSession: () =>
        Effect.succeed({
          id: sessionId,
          code: sessionCode,
          expiresAt,
          status: 'pending',
        }),
      getSession: () =>
        Effect.succeed({
          id: sessionId,
          code: sessionCode,
          expiresAt,
          status: 'pending',
          api_key: null,
        }),
      getRealtimeCredentials: () =>
        Effect.succeed({
          project_id: 'proj_test',
          pusher_key: 'pusher_test_key',
          pusher_cluster: 'mt1',
        }),
      authRealtimeChannel: () =>
        Effect.succeed({
          auth: 'mock:auth',
          channel_data: undefined,
        }),
    });
    const ComposioSessionRepositoryTest = Layer.succeed(
      ComposioSessionRepository,
      composioSessionRepositoryTest
    );

    return ComposioSessionRepositoryTest;
  });
}
