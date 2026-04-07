import path from 'node:path';
import * as tempy from 'tempy';
import { CliApp, CliConfig } from '@effect/cli';
import { Command, FetchHttpClient, FileSystem } from '@effect/platform';
import { BunFileSystem, BunContext, BunPath } from '@effect/platform-bun';
import {
  ConfigProvider,
  Console,
  DateTime,
  Effect,
  Layer,
  Logger,
  LogLevel,
  Schedule,
  String,
} from 'effect';
import { ComposioCliConfig } from 'src/cli-config';
import * as MockConsole from './mock-console';
import * as MockTerminal from './mock-terminal';
import { TerminalUITest } from './terminal-ui-test';
import type { Toolkits, ToolkitDetailed } from 'src/models/toolkits';
import { NodeProcess } from 'src/services/node-process';
import {
  ComposioClientSingleton,
  ComposioSessionRepository,
  ComposioToolkitsRepository,
  HttpServerError,
  InvalidToolkitsError,
  InvalidToolkitVersionsError,
  type InvalidVersionDetail,
} from 'src/services/composio-clients';
import type { ToolkitVersionOverrides } from 'src/effects/toolkit-version-overrides';
import { JsPackageManagerDetector } from 'src/services/js-package-manager-detector';
import type { Tools } from 'src/models/tools';
import type { TriggerTypes, TriggerTypesAsEnums } from 'src/models/trigger-types';
import type { AuthConfigItem } from 'src/models/auth-configs';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import type { TriggerInstanceItem } from 'src/models/triggers';
import type { AuthConfigCreateResponse, LinkCreateResponse } from 'src/services/composio-clients';
import type { ToolkitVersionSpec } from 'src/effects/toolkit-version-overrides';
import { ComposioUserContextLive } from 'src/services/user-context';
import { ComposioCliUserConfigLive } from 'src/services/cli-user-config';
import { UpgradeBinary } from 'src/services/upgrade-binary';
import { NodeOs } from 'src/services/node-os';
import { TriggersRealtime } from 'src/services/triggers-realtime';
import { ToolsExecutor, ToolsExecutorLive } from 'src/services/tools-executor';
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
import { CommandRunner } from 'src/services/command-runner';
import { TerminalUI } from 'src/services/terminal-ui';
import { CommandExecutor } from '@effect/platform';

export interface TestLiveInput {
  /**
   * Base config provider to use in test.
   * If not provided, the default `ConfigProvider.fromMap(new Map([]))` is used.
   */
  baseConfigProvider?: ConfigProvider.ConfigProvider;

  /**
   * Fixture to use in test.
   * TODO: consider extracting `fixture` into another `Effect`.
   */
  fixture?: string;

  /**
   * Mock toolkit-related data to use in test.
   */
  toolkitsData?: {
    toolkits?: Toolkits;
    detailedToolkits?: ToolkitDetailed[];
    tools?: Tools;
    triggerTypesAsEnums?: TriggerTypesAsEnums;
    triggerTypes?: TriggerTypes;
  };

  /**
   * Mock auth-config data to use in test.
   */
  authConfigsData?: {
    items?: AuthConfigItem[];
    createResponse?: AuthConfigCreateResponse;
  };

  /**
   * Mock connected-account data to use in test.
   */
  connectedAccountsData?: {
    items?: ConnectedAccountItem[];
    linkResponse?: LinkCreateResponse;
    onPatch?: (params: { path: string; body: Record<string, unknown> | undefined }) => void;
  };

  /**
   * Mock trigger instance data to use in test.
   */
  triggersData?: {
    items?: TriggerInstanceItem[];
  };

  /**
   * Mock realtime trigger data to use in test.
   */
  realtimeData?: {
    events?: ReadonlyArray<Record<string, unknown>>;
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
  };

  /**
   * Override Tool Router session behavior for tests.
   *
   * Controls the mock `ComposioClientSingleton`'s `toolRouter.session.*` methods.
   * Each method can be overridden individually; defaults are provided for all.
   *
   * When `toolsExecutor` is also set, its mock takes precedence for `tools execute`
   * (the Tool Router mock is still used by `toolkits list`, `toolkits info`, etc.).
   */
  toolRouter?: {
    /** Override `session.create`. Receives the create params. */
    create?: (params: SessionCreateParams) => Promise<SessionCreateResponse>;
    /** Override `session.execute`. Receives sessionId and params. */
    execute?: (sessionId: string, params: SessionExecuteParams) => Promise<SessionExecuteResponse>;
    /** Override `session.executeMeta`. Receives sessionId and params. */
    executeMeta?: (
      sessionId: string,
      params: SessionExecuteMetaParams
    ) => Promise<SessionExecuteMetaResponse>;
    /** Override `session.link`. Receives sessionId and params. */
    link?: (sessionId: string, params: SessionLinkParams) => Promise<SessionLinkResponse>;
    /** Override `session.proxyExecute`. Receives sessionId and params. */
    proxyExecute?: (
      sessionId: string,
      params: SessionProxyExecuteParams
    ) => Promise<SessionProxyExecuteResponse>;
    /** Override `session.search`. Receives sessionId and params. */
    search?: (sessionId: string, params: SessionSearchParams) => Promise<SessionSearchResponse>;
    /** Override `session.toolkits`. Receives sessionId and optional params. */
    toolkits?: (
      sessionId: string,
      params?: SessionToolkitsParams | null
    ) => Promise<SessionToolkitsResponse>;
  };

  /**
   * Override CommandRunner behavior for tests.
   * When set, the `CommandRunner` service uses the provided mock instance.
   * When NOT set, uses a default mock that always returns exit code 0.
   */
  commandRunner?: CommandRunner;

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

type RequiredLayer = Layer.Layer<any, any, never>;

const ConsumerProjectResolveFetchMock = Layer.scopedDiscard(
  Effect.acquireRelease(
    Effect.sync(() => {
      const originalFetch = globalThis.fetch;

      globalThis.fetch = (async (requestInput: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof requestInput === 'string'
            ? requestInput
            : requestInput instanceof URL
              ? requestInput.toString()
              : requestInput.url;

        if (url.includes('/api/v3/org/consumer/project/resolve')) {
          const headers = new Headers(
            requestInput instanceof Request ? requestInput.headers : undefined
          );
          new Headers(init?.headers).forEach((value, key) => headers.set(key, value));

          const orgId = headers.get('x-org-id') ?? 'org_test';
          return new Response(
            JSON.stringify({
              project_id: 'consumer_project_id_test',
              project_nano_id: 'consumer_project_test',
              project_name: 'Consumer Project',
              org_id: orgId,
              project_type: 'CONSUMER',
              consumer_user_id: `consumer-user-${orgId}`,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        return originalFetch(requestInput, init);
      }) as typeof globalThis.fetch;

      return originalFetch;
    }),
    originalFetch =>
      Effect.sync(() => {
        globalThis.fetch = originalFetch;
      })
  )
);

/**
 * Effect layer that injects all the services needed for tests, using mocks to avoid
 * side-effects like unwanted HTTP requests to remote services.
 */
export const TestLayer = (input?: TestLiveInput) =>
  Effect.gen(function* () {
    const defaultAppClientData = {
      toolkits: [] as Toolkits,
      detailedToolkits: [] as ToolkitDetailed[],
      tools: [] as Tools,
      triggerTypesAsEnums: [] as TriggerTypesAsEnums,
      triggerTypes: [] as TriggerTypes,
    } satisfies TestLiveInput['toolkitsData'];
    const fixture = input?.fixture;
    const toolkitsData = {
      ...defaultAppClientData,
      ...(input?.toolkitsData ?? {}),
      detailedToolkits:
        input?.toolkitsData?.detailedToolkits ?? defaultAppClientData.detailedToolkits,
    };

    const defaultAuthConfigsData = {
      items: [] as AuthConfigItem[],
      createResponse: undefined as AuthConfigCreateResponse | undefined,
    } satisfies TestLiveInput['authConfigsData'];
    const authConfigsData = {
      ...defaultAuthConfigsData,
      ...(input?.authConfigsData ?? {}),
    };

    const defaultConnectedAccountsData = {
      items: [] as ConnectedAccountItem[],
      linkResponse: undefined as LinkCreateResponse | undefined,
    } satisfies TestLiveInput['connectedAccountsData'];
    const connectedAccountsData = {
      ...defaultConnectedAccountsData,
      ...(input?.connectedAccountsData ?? {}),
    };

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
      new ComposioToolkitsRepository({
        getToolkits: () => Effect.succeed(toolkitsData.toolkits),
        getToolkitsBySlugs: (slugs: ReadonlyArray<string>) => {
          const normalizedSlugs = new Set(slugs.map(s => String.toLowerCase(s)));
          const found = toolkitsData.toolkits.filter(t =>
            normalizedSlugs.has(String.toLowerCase(t.slug))
          );
          if (found.length !== slugs.length) {
            const foundSlugs = new Set(found.map(t => String.toLowerCase(t.slug)));
            const notFound = slugs.filter(s => !foundSlugs.has(String.toLowerCase(s)));
            return Effect.fail(
              new InvalidToolkitsError({
                invalidToolkits: [...notFound],
                availableToolkits: toolkitsData.toolkits.map(t => t.slug),
              })
            );
          }
          return Effect.succeed(found);
        },
        getMetrics: () => Effect.succeed({ byteSize: 0, requests: 0 }),
        getToolsAsEnums: () => Effect.succeed(toolkitsData.tools.map(tool => tool.slug)),
        getTriggerTypesAsEnums: () => Effect.succeed(toolkitsData.triggerTypesAsEnums),
        getTriggerTypes: (toolkitSlugs?: ReadonlyArray<string>) => {
          let triggers = toolkitsData.triggerTypes;
          if (toolkitSlugs && toolkitSlugs.length > 0) {
            const prefixes = toolkitSlugs.map(s => `${s.toUpperCase()}_`);
            triggers = triggers.filter(t => prefixes.some(p => t.slug.toUpperCase().startsWith(p)));
          }
          return Effect.succeed(triggers);
        },
        getTriggerTypeDetailed: (slug: string) => {
          const found = toolkitsData.triggerTypes.find(
            trigger => trigger.slug.toUpperCase() === slug.toUpperCase()
          );
          if (!found) {
            return Effect.fail(
              new HttpServerError({ cause: `Trigger type "${slug}" not found`, status: 404 })
            );
          }
          return Effect.succeed(found);
        },
        getTools: (toolkitSlugs?: ReadonlyArray<string>) => {
          let tools = toolkitsData.tools;
          if (toolkitSlugs && toolkitSlugs.length > 0) {
            const prefixes = toolkitSlugs.map(s => `${s.toUpperCase()}_`);
            tools = tools.filter(t => prefixes.some(p => t.slug.toUpperCase().startsWith(p)));
          }
          return Effect.succeed(tools);
        },
        validateToolkits: (toolkitSlugs: ReadonlyArray<string>) => {
          const normalizedInputSlugs = toolkitSlugs.map(slug => String.toLowerCase(slug));
          const availableSlugs = toolkitsData.toolkits.map(toolkit =>
            String.toLowerCase(toolkit.slug)
          );
          const invalidSlugs = normalizedInputSlugs.filter(slug => !availableSlugs.includes(slug));

          if (invalidSlugs.length > 0) {
            return Effect.fail(
              new InvalidToolkitsError({
                invalidToolkits: invalidSlugs,
                availableToolkits: availableSlugs,
              })
            );
          }

          return Effect.succeed(normalizedInputSlugs);
        },
        filterToolkitsBySlugs: (toolkits, toolkitSlugs) => {
          const normalizedSlugs = new Set(toolkitSlugs.map(slug => String.toLowerCase(slug)));
          return toolkits.filter(toolkit => normalizedSlugs.has(String.toLowerCase(toolkit.slug)));
        },
        getToolsByVersionSpecs: (specs: ReadonlyArray<ToolkitVersionSpec>) => {
          // Filter tools based on toolkit slugs from specs
          const toolkitSlugs = specs.map(s => s.toolkitSlug.toUpperCase());
          const prefixes = toolkitSlugs.map(s => `${s}_`);
          const tools = toolkitsData.tools.filter(t =>
            prefixes.some(p => t.slug.toUpperCase().startsWith(p))
          );
          return Effect.succeed(tools);
        },
        validateToolkitVersions: (
          overrides: ToolkitVersionOverrides,
          relevantToolkits?: ReadonlyArray<string>
        ) => {
          // Mock implementation that validates against test fixture
          const invalidVersions: InvalidVersionDetail[] = [];
          const warnings: string[] = [];

          for (const [toolkit, version] of overrides) {
            // Check if toolkit should be validated
            if (relevantToolkits && !relevantToolkits.map(s => s.toLowerCase()).includes(toolkit)) {
              warnings.push(`Version override for "${toolkit}" will be ignored`);
              continue;
            }

            // Check if toolkit exists in the fixture
            const toolkitExists = toolkitsData.toolkits.some(
              t => String.toLowerCase(t.slug) === toolkit
            );

            if (!toolkitExists) {
              return Effect.fail(
                new InvalidToolkitsError({
                  invalidToolkits: [toolkit],
                  availableToolkits: toolkitsData.toolkits.map(t => t.slug),
                })
              );
            }

            // Mock: only accept 'latest' or versions matching pattern YYYYMMDD_NN
            const validPattern = /^\d{8}_\d{2}$/;
            if (version !== 'latest' && !validPattern.test(version)) {
              invalidVersions.push({
                toolkit,
                requestedVersion: version,
                availableVersions: ['20250901_00', '20250815_00', '20250710_00'],
              });
            }
          }

          if (invalidVersions.length > 0) {
            return Effect.fail(new InvalidToolkitVersionsError({ invalidVersions }));
          }

          return Effect.succeed({
            validatedOverrides: overrides,
            warnings: warnings as ReadonlyArray<string>,
          });
        },
        searchToolkits: (params: {
          search?: string;
          category?: string;
          limit?: number;
          cursor?: string;
        }) => {
          let results = [...toolkitsData.toolkits];

          if (params.search) {
            const q = params.search.toLowerCase();
            results = results.filter(
              t =>
                t.name.toLowerCase().includes(q) ||
                t.slug.toLowerCase().includes(q) ||
                t.meta.description.toLowerCase().includes(q)
            );
          }

          const limit = params.limit ?? 30;
          const items = results.slice(0, limit);
          return Effect.succeed({
            items,
            total_items: results.length,
            total_pages: Math.ceil(results.length / limit),
            next_cursor: null,
          });
        },
        searchTools: (params: {
          search?: string;
          toolkit_slug?: string;
          tags?: string;
          limit?: number;
          cursor?: string;
        }) => {
          let results = [...toolkitsData.tools];

          if (params.toolkit_slug) {
            const slugs = params.toolkit_slug.split(',').map(s => s.trim().toUpperCase() + '_');
            results = results.filter(t => slugs.some(p => t.slug.toUpperCase().startsWith(p)));
          }

          if (params.search) {
            const q = params.search.toLowerCase();
            results = results.filter(
              t =>
                t.name.toLowerCase().includes(q) ||
                t.slug.toLowerCase().includes(q) ||
                t.description.toLowerCase().includes(q)
            );
          }

          if (params.tags) {
            const tagList = params.tags.split(',').map(t => t.trim().toLowerCase());
            results = results.filter(t =>
              tagList.some(tag => t.tags.map(tt => tt.toLowerCase()).includes(tag))
            );
          }

          const limit = params.limit ?? 30;
          const items = results.slice(0, limit);
          return Effect.succeed({
            items,
            total_pages: Math.ceil(results.length / limit),
            next_cursor: null,
          });
        },
        getToolDetailed: (slug: string) => {
          const found = toolkitsData.tools.find(t => t.slug.toUpperCase() === slug.toUpperCase());
          if (!found) {
            return Effect.fail(
              new HttpServerError({ cause: `Tool "${slug}" not found`, status: 404 })
            );
          }
          // Derive toolkit slug from tool slug prefix (e.g. GMAIL_SEND_EMAIL -> gmail)
          const parts = found.slug.split('_');
          const toolkitSlug = parts.length > 1 ? parts[0]!.toLowerCase() : '';
          return Effect.succeed({
            ...found,
            no_auth: false,
            toolkit: { name: toolkitSlug, slug: toolkitSlug },
          });
        },
        getToolkitDetailed: (slug: string) => {
          const found = toolkitsData.detailedToolkits.find(
            t => t.slug.toLowerCase() === slug.toLowerCase()
          );
          if (!found) {
            return Effect.fail(
              new HttpServerError({ cause: `Toolkit "${slug}" not found`, status: 404 })
            );
          }
          return Effect.succeed(found);
        },
        listAuthConfigs: (params: {
          search?: string;
          toolkit_slug?: string;
          limit?: number;
          show_disabled?: boolean;
        }) => {
          let results = [...authConfigsData.items];

          if (params.toolkit_slug) {
            const slugs = params.toolkit_slug.split(',').map(s => s.trim().toLowerCase());
            results = results.filter(item => slugs.includes(item.toolkit.slug.toLowerCase()));
          }

          if (params.search) {
            const q = params.search.toLowerCase();
            results = results.filter(
              item => item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)
            );
          }

          const limit = params.limit ?? 30;
          const items = results.slice(0, limit);
          return Effect.succeed({
            items,
            total_items: results.length,
            total_pages: Math.ceil(results.length / limit),
            current_page: 1,
            next_cursor: null,
          });
        },
        getAuthConfig: (nanoid: string) => {
          const found = authConfigsData.items.find(item => item.id === nanoid);
          if (!found) {
            return Effect.fail(
              new HttpServerError({
                cause: `Auth config "${nanoid}" not found`,
                status: 404,
                details: {
                  message: `Auth config "${nanoid}" not found.`,
                  suggestedFix: 'Check the auth config ID and try again.',
                  code: 404,
                },
              })
            );
          }
          return Effect.succeed(found);
        },
        createAuthConfig: () =>
          Effect.succeed(
            authConfigsData.createResponse ?? {
              auth_config: { id: 'ac_test', auth_scheme: 'OAUTH2', is_composio_managed: true },
              toolkit: { slug: 'test' },
            }
          ),
        deleteAuthConfig: (nanoid: string) => {
          const found = authConfigsData.items.find(item => item.id === nanoid);
          if (!found) {
            return Effect.fail(
              new HttpServerError({
                cause: `Auth config "${nanoid}" not found`,
                status: 404,
                details: {
                  message: `Auth config "${nanoid}" not found.`,
                  suggestedFix: 'Check the auth config ID and try again.',
                  code: 404,
                },
              })
            );
          }
          return Effect.succeed({});
        },
        listConnectedAccounts: (params: {
          toolkit_slugs?: string[];
          user_ids?: string[];
          statuses?: string[];
          limit?: number;
        }) => {
          let results = [...connectedAccountsData.items];

          if (params.toolkit_slugs && params.toolkit_slugs.length > 0) {
            const slugs = params.toolkit_slugs.map(s => s.toLowerCase());
            results = results.filter(item => slugs.includes(item.toolkit.slug.toLowerCase()));
          }

          if (params.user_ids && params.user_ids.length > 0) {
            const ids = new Set(params.user_ids);
            results = results.filter(item => ids.has(item.user_id));
          }

          if (params.statuses && params.statuses.length > 0) {
            const statuses = new Set(params.statuses);
            results = results.filter(item => statuses.has(item.status));
          }

          const limit = params.limit ?? 30;
          const items = results.slice(0, limit);
          return Effect.succeed({
            items,
            total_items: results.length,
            total_pages: Math.ceil(results.length / limit),
            current_page: 1,
            next_cursor: null,
          });
        },
        getConnectedAccount: (nanoid: string) => {
          const found = connectedAccountsData.items.find(item => item.id === nanoid);
          if (!found) {
            return Effect.fail(
              new HttpServerError({
                cause: `Connected account "${nanoid}" not found`,
                status: 404,
                details: {
                  message: `Connected account "${nanoid}" not found.`,
                  suggestedFix: 'Check the connected account ID and try again.',
                  code: 404,
                },
              })
            );
          }
          return Effect.succeed(found);
        },
        deleteConnectedAccount: (nanoid: string) => {
          const found = connectedAccountsData.items.find(item => item.id === nanoid);
          if (!found) {
            return Effect.fail(
              new HttpServerError({
                cause: `Connected account "${nanoid}" not found`,
                status: 404,
                details: {
                  message: `Connected account "${nanoid}" not found.`,
                  suggestedFix: 'Check the connected account ID and try again.',
                  code: 404,
                },
              })
            );
          }
          return Effect.succeed({});
        },
        createConnectedAccountLink: (params: { auth_config_id: string; user_id: string }) => {
          if (connectedAccountsData.linkResponse) {
            return Effect.succeed(connectedAccountsData.linkResponse);
          }
          return Effect.succeed({
            connected_account_id: 'con_test_link',
            expires_at: '2026-12-31T23:59:59Z',
            link_token: 'lt_test_token',
            redirect_url: `https://app.composio.dev/link?token=lt_test_token`,
          } satisfies LinkCreateResponse);
        },
        listActiveTriggers: (params: {
          user_ids?: string[];
          connected_account_ids?: string[];
          auth_config_ids?: string[];
          trigger_ids?: string[];
          trigger_names?: string[];
          show_disabled?: boolean;
          limit?: number;
        }) => {
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

          const limit = params.limit ?? 30;
          const items = results.slice(0, limit);
          return Effect.succeed({
            items,
            total_items: results.length,
            total_pages: Math.ceil(results.length / limit),
            current_page: 1,
            next_cursor: null,
          });
        },
        createTrigger: (
          triggerSlug: string,
          params?: {
            connected_account_id?: string;
            trigger_config?: Record<string, unknown>;
          }
        ) =>
          Effect.succeed({
            trigger_id: `trg_${triggerSlug.toLowerCase()}_${params?.connected_account_id ?? 'new'}`,
          }),
        enableTrigger: () => Effect.succeed({ status: 'success' as const }),
        disableTrigger: () => Effect.succeed({ status: 'success' as const }),
        deleteTrigger: triggerId => Effect.succeed({ trigger_id: triggerId }),
      })
    );
    const ComposioSessionRepositoryTest = yield* setupComposioSessionRepository();
    const TriggersRealtimeTest = Layer.succeed(
      TriggersRealtime,
      new TriggersRealtime({
        listen: onEvent =>
          Effect.gen(function* () {
            yield* Effect.forEach(realtimeData.events, event => Effect.sync(() => onEvent(event)));
            return yield* Effect.never;
          }),
        listenInProject: (_scope, onEvent) =>
          Effect.gen(function* () {
            yield* Effect.forEach(realtimeData.events, event => Effect.sync(() => onEvent(event)));
            return yield* Effect.never;
          }),
      })
    );

    // Mock `node:os`
    const NodeOsTest = Layer.succeed(
      NodeOs,
      new NodeOs({
        homedir: cwd,
        arch: 'arm64',
        platform: 'darwin',
      })
    );

    // Mock `node:process`
    const NodeProcessTest = Layer.succeed(
      NodeProcess,
      new NodeProcess({
        cwd,
        platform: 'darwin',
        arch: 'arm64',
      })
    );

    const ComposioUserContextTest = Layer.provideMerge(
      ComposioUserContextLive,
      Layer.merge(BunFileSystem.layer, NodeOsTest)
    );

    const ComposioCliUserConfigTest = Layer.provideMerge(
      ComposioCliUserConfigLive,
      Layer.mergeAll(BunFileSystem.layer, NodeOsTest)
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

    const defaultToolkitsHandler = async (
      _sessionId: string,
      params?: SessionToolkitsParams | null
    ): Promise<SessionToolkitsResponse> => {
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
    };

    const defaultSearchHandler = async (
      _sessionId: string,
      params: SessionSearchParams
    ): Promise<SessionSearchResponse> => {
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
              matchedTools.map(tool => tool.slug.split('_')[0]?.toLowerCase() ?? '').filter(Boolean)
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
          allMatchedTools.map(tool => tool.slug.split('_')[0]?.toLowerCase() ?? '').filter(Boolean)
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
          current_time_utc: '2026-01-01T00:00:00.000Z',
          current_time_utc_epoch_seconds: 1767225600,
          message: 'UTC time',
        },
      };
    };

    const mockComposioClient = {
      link: {
        create: async (params: { auth_config_id: string; user_id: string }) => {
          const response = connectedAccountsData.linkResponse ?? {
            connected_account_id: 'con_test_link',
            expires_at: '2026-12-31T23:59:59Z',
            link_token: 'lt_test_token',
            redirect_url: `https://app.composio.dev/link?token=lt_test_token`,
          };
          return response;
        },
      },
      patch: async (path: string, options?: { body?: Record<string, unknown> }) => {
        connectedAccountsData.onPatch?.({ path, body: options?.body });

        const match = path.match(/^\/api\/v3\/connected_accounts\/([^/]+)$/);
        if (!match) {
          throw new Error(`Unhandled PATCH path "${path}"`);
        }

        const connectedAccountId = match[1];
        const account = connectedAccountsData.items.find(item => item.id === connectedAccountId);
        if (!account) {
          throw new Error(`Connected account "${connectedAccountId}" not found`);
        }

        if (typeof options?.body?.alias === 'string') {
          Object.assign(account as { alias?: string | null }, {
            alias: options.body.alias,
          });
        }

        return account;
      },
      connectedAccounts: {
        list: async (params?: {
          toolkit_slugs?: string[];
          user_ids?: string[];
          statuses?: string[];
          limit?: number;
        }) => {
          let results = [...connectedAccountsData.items];

          if (params?.toolkit_slugs && params.toolkit_slugs.length > 0) {
            const slugs = new Set(params.toolkit_slugs.map(slug => slug.toLowerCase()));
            results = results.filter(item => slugs.has(item.toolkit.slug.toLowerCase()));
          }

          if (params?.user_ids && params.user_ids.length > 0) {
            const userIds = new Set(params.user_ids);
            results = results.filter(item => userIds.has(item.user_id));
          }

          if (params?.statuses && params.statuses.length > 0) {
            const statuses = new Set(params.statuses);
            results = results.filter(item => statuses.has(item.status));
          }

          const limit = params?.limit ?? 30;
          return {
            items: results.slice(0, limit),
            total_items: results.length,
            total_pages: Math.ceil(results.length / limit),
            current_page: 1,
            next_cursor: null,
          };
        },
        retrieve: async (nanoid: string) => {
          const found = connectedAccountsData.items.find(item => item.id === nanoid);
          if (!found) {
            throw new Error(`Connected account "${nanoid}" not found`);
          }
          return found;
        },
      },
      triggerInstances: {
        upsert: async (
          triggerSlug: string,
          params?: {
            connected_account_id?: string;
            trigger_config?: Record<string, unknown>;
          }
        ) => ({
          trigger_id: `trg_${triggerSlug.toLowerCase()}_${params?.connected_account_id ?? 'new'}`,
        }),
        manage: {
          update: async (triggerId: string, params: { status: 'enable' | 'disable' }) => ({
            trigger_id: triggerId,
            status: params.status,
          }),
          delete: async (triggerId: string) => ({ trigger_id: triggerId }),
        },
      },
      toolkits: {
        retrieve: async (slug: string) => {
          const detailed = toolkitsData.detailedToolkits.find(
            t => t.slug.toLowerCase() === slug.toLowerCase()
          );
          if (detailed) {
            return {
              name: detailed.name,
              slug: detailed.slug,
              is_local_toolkit: detailed.is_local_toolkit,
              composio_managed_auth_schemes: [...detailed.composio_managed_auth_schemes],
              no_auth: detailed.no_auth,
              meta: detailed.meta,
            };
          }

          const found = toolkitsData.toolkits.find(
            t => t.slug.toLowerCase() === slug.toLowerCase()
          );
          if (!found) {
            throw new Error(`Toolkit "${slug}" not found`);
          }
          return {
            name: found.name,
            slug: found.slug,
            is_local_toolkit: found.is_local_toolkit,
            composio_managed_auth_schemes: [...found.composio_managed_auth_schemes],
            no_auth: found.no_auth,
            meta: found.meta,
          };
        },
      },
      files: {
        createPresignedURL: async (params: {
          filename: string;
          mimetype: string;
          md5: string;
          tool_slug: string;
          toolkit_slug: string;
        }) => ({
          key: `uploads/${params.filename}`,
          new_presigned_url: 'https://s3.test.composio.dev/upload',
        }),
      },
      toolRouter: {
        session: {
          create:
            toolRouterOverrides?.create ??
            (async (params: SessionCreateParams) => ({
              session_id: 'trs_test_session',
              config: { user_id: params.user_id },
              mcp: { type: 'http' as const, url: 'https://mcp.test.composio.dev' },
              tool_router_tools: ['COMPOSIO_SEARCH_TOOLS', 'COMPOSIO_MANAGE_CONNECTIONS'],
            })),
          execute:
            toolRouterOverrides?.execute ??
            (async (_sessionId: string, params: SessionExecuteParams) => ({
              data: { tool_slug: params.tool_slug, arguments: params.arguments },
              error: null,
              log_id: 'log_test',
            })),
          executeMeta:
            toolRouterOverrides?.executeMeta ??
            (async (_sessionId: string, params: SessionExecuteMetaParams) => ({
              data: { slug: params.slug, arguments: params.arguments },
              error: null,
              log_id: 'log_test',
            })),
          link:
            toolRouterOverrides?.link ??
            (async () => ({
              connected_account_id: 'con_test_link',
              link_token: 'lt_test_token',
              redirect_url: 'https://app.composio.dev/link?token=lt_test_token',
            })),
          proxyExecute:
            toolRouterOverrides?.proxyExecute ??
            (async (_sessionId: string, params: SessionProxyExecuteParams) => ({
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
          tools: async () => ({
            items: [],
          }),
        },
      },
    };

    const ComposioClientSingletonTest = Layer.succeed(
      ComposioClientSingleton,
      new ComposioClientSingleton({
        get: Effect.fn(function* () {
          // Partial mock: only implements `toolRouter.session.*` methods used by
          // CLI commands under test. The full Composio client interface is too
          // large to mock completely for unit tests.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return mockComposioClient as any;
        }),
        getFor: Effect.fn(function* () {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return mockComposioClient as any;
        }),
      })
    );

    // --- ToolsExecutor ---
    // When `input.toolsExecutor` is set, use a canned mock (bypasses Tool Router).
    // Otherwise, use the real ToolsExecutorLive which flows through the mock ComposioClientSingleton.
    const ToolsExecutorTest = input?.toolsExecutor
      ? Layer.succeed(
          ToolsExecutor,
          ToolsExecutor.of({
            execute: (slug, params) => {
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
            },
          })
        )
      : Layer.provide(ToolsExecutorLive, ComposioClientSingletonTest);

    const CliConfigLive = CliConfig.layer(ComposioCliConfig);

    // CommandRunner mock — default returns exit code 0
    const CommandRunnerTest = input?.commandRunner
      ? Layer.succeed(CommandRunner, input.commandRunner)
      : Layer.succeed(
          CommandRunner,
          new CommandRunner({
            run: () => Effect.succeed(CommandExecutor.ExitCode(0)),
          })
        );

    // TerminalUI — use provided override or default TerminalUITest
    const TerminalUILayer = input?.terminalUI
      ? Layer.succeed(TerminalUI, input.terminalUI)
      : TerminalUITest;

    const _console = yield* MockConsole.make;

    const layers = Layer.mergeAll(
      Console.setConsole(_console),
      CliConfigLive,
      NodeProcessTest,
      UpgradeBinaryTest,
      ComposioCliUserConfigTest,
      ComposioUserContextTest,
      ComposioClientSingletonTest,
      ComposioSessionRepositoryTest,
      TriggersRealtimeTest,
      ComposioToolkitsRepositoryTest,
      JsPackageManagerDetector.Default,
      ProjectEnvironmentDetector.Default,
      CommandRunnerTest,
      ToolsExecutorTest,
      BunFileSystem.layer,
      BunContext.layer,
      MockTerminal.layer,
      BunPath.layer,
      FetchHttpClient.layer,
      ConsumerProjectResolveFetchMock,
      StdinTest,
      TerminalUILayer,
      Layer.provide(
        ProjectContext.Default,
        Layer.mergeAll(BunFileSystem.layer, NodeOsTest, NodeProcessTest)
      )
    ) satisfies RequiredLayer;

    return layers;
  }).pipe(
    Logger.withMinimumLogLevel(LogLevel.Debug),
    Effect.scoped,
    Layer.unwrapEffect,
    Layer.provide(
      Layer.setConfigProvider(input?.baseConfigProvider ?? ConfigProvider.fromMap(new Map([])))
    )
  );

// Run @effect/vitest suite with TestLive layer
export const runEffect =
  (input?: TestLiveInput) =>
  <E, A>(self: Effect.Effect<A, E, CliApp.CliApp.Environment>): Promise<A> =>
    Effect.provide(self, TestLayer(input)).pipe(Effect.scoped, Effect.runPromise);

function setupFixtureFolder({ fixture, tempDir }: { fixture?: string; tempDir: string }) {
  return Effect.gen(function* () {
    if (fixture === undefined) {
      return;
    }

    const fs = yield* FileSystem.FileSystem;

    const realFixturePath = path.resolve(
      new URL('.', import.meta.url).pathname,
      '..',
      '..',
      '__fixtures__',
      fixture
    );
    const tmpFixturesPath = path.join(tempDir, 'test', '__fixtures__', fixture);

    yield* Effect.logDebug(`Using fixture at: ${tmpFixturesPath}`);

    // Retry the task with a delay between retries and a maximum of 3 retries
    const policy = Schedule.addDelay(Schedule.recurs(3), () => '100 millis');

    // If all retries fail, run the fallback effect.
    // Use tar to skip heavy directories (.venv) that the global setup may have created.
    // tar --exclude is POSIX and available on any Linux/macOS without extra packages.
    const task = Effect.gen(function* () {
      yield* fs.makeDirectory(tmpFixturesPath, { recursive: true });
      const tarCmd = Command.make(
        'tar',
        '-cf',
        '-',
        '--exclude',
        '.venv',
        '-C',
        realFixturePath,
        '.'
      ).pipe(Command.pipeTo(Command.make('tar', '-xf', '-', '-C', tmpFixturesPath)));
      yield* tarCmd.pipe(Command.exitCode, Effect.provide(BunContext.layer));
    });

    const repeated = Effect.retryOrElse(policy, () =>
      Effect.die(`Failed to copy fixture to: ${tmpFixturesPath}`)
    );

    yield* repeated(task);

    yield* Effect.logDebug(`Copied fixture to: ${tmpFixturesPath}`);

    // Break symlinks in node_modules to isolate test from real packages
    const nodeModulesPath = path.join(tmpFixturesPath, 'node_modules');
    yield* breakSymlinksInNodeModules(fs, nodeModulesPath);

    return tmpFixturesPath;
  }).pipe(Effect.provide(BunFileSystem.layer));
}

/**
 * Breaks symlinks in node_modules to ensure test isolation.
 * - On Unix: Uses `find -type l` for O(1) shell call to detect all symlinks
 * - On Windows: Uses O(n) readLink approach for compatibility
 */
function breakSymlinksInNodeModules(
  fs: FileSystem.FileSystem,
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
    const findCmd = Command.make(
      'find',
      nodeModulesPath,
      '-maxdepth',
      '2',
      '-type',
      'l',
      '-not',
      '-path',
      '*/.*'
    );
    const output = yield* findCmd.pipe(Command.string, Effect.provide(BunContext.layer));
    const symlinks = output.trim().split('\n').filter(Boolean);

    if (symlinks.length === 0) {
      return;
    }

    yield* Effect.logDebug(`Found ${symlinks.length} symlinks to break`);
    yield* Effect.all(symlinks.map(breakSymlink), { concurrency: 'unbounded' });
  });

  // Windows: Use readLink to detect symlinks (O(n) but compatible)
  const breakSymlinksWindows = Effect.gen(function* () {
    const isSymlink = (p: string) =>
      fs.readLink(p).pipe(
        Effect.map(() => true),
        Effect.catchAll(() => Effect.succeed(false))
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
      Effect.catchAll(() => Effect.succeed(false))
    );

    if (nodeModulesLink) {
      yield* fs
        .remove(nodeModulesPath, { recursive: true })
        .pipe(Effect.catchAll(() => Effect.void));
      yield* fs
        .makeDirectory(nodeModulesPath, { recursive: true })
        .pipe(Effect.catchAll(() => Effect.void));
    }

    const isWindows = process.platform === 'win32';

    if (isWindows) {
      yield* breakSymlinksWindows;
    } else {
      yield* breakSymlinksUnix;
    }
  }).pipe(Effect.catchAll(() => Effect.void));
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

    const composioSessionRepositoryTest = new ComposioSessionRepository({
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
