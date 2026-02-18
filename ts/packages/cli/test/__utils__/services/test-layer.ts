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
import type { Toolkits } from 'src/models/toolkits';
import { NodeProcess } from 'src/services/node-process';
import {
  ComposioSessionRepository,
  ComposioToolkitsRepository,
  InvalidToolkitsError,
  InvalidToolkitVersionsError,
  type InvalidVersionDetail,
} from 'src/services/composio-clients';
import { ComposioEntitiesRepository } from 'src/services/composio-entities';
import type { ToolkitVersionOverrides } from 'src/effects/toolkit-version-overrides';
import { EnvLangDetector } from 'src/services/env-lang-detector';
import { JsPackageManagerDetector } from 'src/services/js-package-manager-detector';
import type { Tools } from 'src/models/tools';
import type { TriggerTypes, TriggerTypesAsEnums } from 'src/models/trigger-types';
import type { ToolkitVersionSpec } from 'src/effects/toolkit-version-overrides';
import { ComposioUserContextLive } from 'src/services/user-context';
import { UpgradeBinary } from 'src/services/upgrade-binary';
import { NodeOs } from 'src/services/node-os';

function asRecord(input: unknown): Record<string, unknown> | null {
  if (input !== null && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }

  return null;
}

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
    tools?: Tools;
    triggerTypesAsEnums?: TriggerTypesAsEnums;
    triggerTypes?: TriggerTypes;
  };

  entitiesData?: {
    authConfigs?: ReadonlyArray<Record<string, unknown>>;
    connectedAccounts?: ReadonlyArray<Record<string, unknown>>;
    triggerInstances?: ReadonlyArray<Record<string, unknown>>;
  };
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

/**
 * Effect layer that injects all the services needed for tests, using mocks to avoid
 * side-effects like unwanted HTTP requests to remote services.
 */
export const TestLayer = (input?: TestLiveInput) =>
  Effect.gen(function* () {
    const defaultAppClientData = {
      toolkits: [] as Toolkits,
      tools: [] as Tools,
      triggerTypesAsEnums: [] as TriggerTypesAsEnums,
      triggerTypes: [] as TriggerTypes,
    } satisfies TestLiveInput['toolkitsData'];
    const defaultEntitiesData = {
      authConfigs: [] as ReadonlyArray<Record<string, unknown>>,
      connectedAccounts: [] as ReadonlyArray<Record<string, unknown>>,
      triggerInstances: [] as ReadonlyArray<Record<string, unknown>>,
    } satisfies NonNullable<TestLiveInput['entitiesData']>;

    const {
      fixture,
      toolkitsData,
      entitiesData: partialEntitiesData,
    } = Object.assign(
      { fixture: undefined, toolkitsData: defaultAppClientData, entitiesData: defaultEntitiesData },
      input
    );
    const entitiesData = {
      ...defaultEntitiesData,
      ...(partialEntitiesData ?? {}),
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
      })
    );

    const defaultAuthConfigs =
      entitiesData.authConfigs.length > 0
        ? entitiesData.authConfigs
        : toolkitsData.toolkits.map((toolkit, idx) => ({
            id: `ac_${idx + 1}`,
            name: `${toolkit.slug}-auth-config`,
            auth_scheme: 'OAUTH2',
            no_of_connections: 0,
            status: 'ENABLED',
            toolkit: { slug: toolkit.slug, logo: 'https://example.com/logo.png' },
            credentials: {},
            created_at: '2026-01-01T00:00:00.000Z',
            last_updated_at: '2026-01-01T00:00:00.000Z',
          }));

    const defaultConnectedAccounts =
      entitiesData.connectedAccounts.length > 0
        ? entitiesData.connectedAccounts
        : toolkitsData.toolkits.map((toolkit, idx) => ({
            id: `ca_${idx + 1}`,
            user_id: 'default',
            status: 'ACTIVE',
            toolkit: { slug: toolkit.slug },
            auth_config: {
              id: `ac_${idx + 1}`,
              is_composio_managed: true,
              is_disabled: false,
            },
            state: { status: 'ACTIVE' },
            test_request_endpoint: '/users/me',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          }));

    const defaultTriggerInstances =
      entitiesData.triggerInstances.length > 0
        ? entitiesData.triggerInstances
        : toolkitsData.triggerTypes.slice(0, 3).map((triggerType, idx) => ({
            id: `ti_${idx + 1}`,
            trigger_name: triggerType.slug,
            connected_account_id: `ca_${idx + 1}`,
            user_id: 'default',
            trigger_config: {},
            state: {},
            trigger_data: null,
            disabled_at: null,
            updated_at: '2026-01-01T00:00:00.000Z',
          }));

    const paginateRecords = (items: ReadonlyArray<Record<string, unknown>>) => ({
      items,
      nextCursor: null,
      totalPages: 1,
      currentPage: 1,
      totalItems: items.length,
    });

    const ComposioEntitiesRepositoryTest = Layer.succeed(
      ComposioEntitiesRepository,
      new ComposioEntitiesRepository({
        toolsList: query => {
          let items = toolkitsData.tools.map(tool => ({ ...tool })) as ReadonlyArray<
            Record<string, unknown>
          >;

          if (query.toolkit_slug) {
            const prefixes = query.toolkit_slug
              .split(',')
              .map(slug => `${slug.trim().toUpperCase()}_`)
              .filter(Boolean);
            items = items.filter(tool => {
              const slug = globalThis.String(tool.slug ?? '').toUpperCase();
              return prefixes.some(prefix => slug.startsWith(prefix));
            });
          }

          if (query.tool_slugs) {
            const allowed = new Set(
              query.tool_slugs
                .split(',')
                .map(slug => slug.trim().toUpperCase())
                .filter(Boolean)
            );
            items = items.filter(tool =>
              allowed.has(globalThis.String(tool.slug ?? '').toUpperCase())
            );
          }

          if (query.search) {
            const search = query.search.toLowerCase();
            items = items.filter(tool => {
              const haystack =
                `${globalThis.String(tool.name ?? '')} ${globalThis.String(tool.slug ?? '')} ${globalThis.String(tool.description ?? '')}`.toLowerCase();
              return haystack.includes(search);
            });
          }

          if (query.tags && query.tags.length > 0) {
            const targetTags = new Set(query.tags.map(tag => tag.toLowerCase()));
            items = items.filter(tool => {
              const tags = Array.isArray(tool.tags) ? tool.tags : [];
              return tags.some(tag => targetTags.has(globalThis.String(tag).toLowerCase()));
            });
          }

          if (query.limit !== undefined) {
            items = items.slice(0, query.limit);
          }

          return Effect.succeed(paginateRecords(items));
        },
        toolsRetrieve: (toolSlug: string) => {
          const tool = toolkitsData.tools.find(
            item => item.slug.toUpperCase() === toolSlug.toUpperCase()
          );

          return Effect.succeed(tool ? { ...tool } : {});
        },
        toolsExecute: (toolSlug: string, body) =>
          Effect.succeed({
            successful: true,
            error: null,
            log_id: 'log_test_1',
            data: {
              tool_slug: toolSlug,
              body,
            },
          }),
        toolsProxy: body =>
          Effect.succeed({
            status: 200,
            successful: true,
            error: null,
            data: {
              endpoint: body.endpoint,
              method: body.method,
              connected_account_id: body.connected_account_id ?? null,
            },
          }),
        toolkitsList: query => {
          let items = toolkitsData.toolkits.map(toolkit => ({
            ...toolkit,
            meta: {
              ...toolkit.meta,
              tools_count: toolkitsData.tools.filter(tool =>
                tool.slug.toUpperCase().startsWith(`${toolkit.slug.toUpperCase()}_`)
              ).length,
              triggers_count: toolkitsData.triggerTypes.filter(trigger =>
                trigger.slug.toUpperCase().startsWith(`${toolkit.slug.toUpperCase()}_`)
              ).length,
              version: toolkit.meta.available_versions[0] ?? 'latest',
            },
          })) as ReadonlyArray<Record<string, unknown>>;

          if (query.search) {
            const search = query.search.toLowerCase();
            items = items.filter(toolkit => {
              const description =
                (toolkit.meta as Record<string, unknown>)?.['description']?.toString() ?? '';
              const haystack =
                `${globalThis.String(toolkit.name ?? '')} ${globalThis.String(toolkit.slug ?? '')} ${description}`.toLowerCase();
              return haystack.includes(search);
            });
          }

          if (query.category) {
            items = items.filter(toolkit => {
              const meta = toolkit.meta as Record<string, unknown>;
              const categories = Array.isArray(meta?.categories) ? meta.categories : [];
              return categories.some(category => {
                const categoryRecord =
                  category !== null && typeof category === 'object'
                    ? (category as Record<string, unknown>)
                    : null;
                const id = categoryRecord?.id?.toString().toLowerCase();
                const slug = categoryRecord?.slug?.toString().toLowerCase();
                const name = categoryRecord?.name?.toString().toLowerCase();
                const target = query.category?.toLowerCase();
                return target === id || target === slug || target === name;
              });
            });
          }

          if (query.limit !== undefined) {
            items = items.slice(0, query.limit);
          }

          return Effect.succeed(paginateRecords(items));
        },
        toolkitsRetrieve: (toolkitSlug: string) => {
          const toolkit = toolkitsData.toolkits.find(
            item => item.slug.toLowerCase() === toolkitSlug.toLowerCase()
          );

          if (!toolkit) {
            return Effect.succeed({});
          }

          return Effect.succeed({
            ...toolkit,
            meta: {
              ...toolkit.meta,
              tools_count: toolkitsData.tools.filter(tool =>
                tool.slug.toUpperCase().startsWith(`${toolkit.slug.toUpperCase()}_`)
              ).length,
              triggers_count: toolkitsData.triggerTypes.filter(trigger =>
                trigger.slug.toUpperCase().startsWith(`${toolkit.slug.toUpperCase()}_`)
              ).length,
              version: toolkit.meta.available_versions[0] ?? 'latest',
            },
            auth_config_details: [
              {
                mode: 'OAUTH2',
                name: 'OAuth 2.0',
                fields: {
                  auth_config_creation: {
                    required: [],
                    optional: [],
                  },
                  connected_account_initiation: {
                    required: [],
                    optional: [],
                  },
                },
              },
            ],
          });
        },
        authConfigsList: query => {
          let items = [...defaultAuthConfigs];

          if (query.toolkit_slug) {
            const slugs = query.toolkit_slug
              .split(',')
              .map(slug => slug.trim().toLowerCase())
              .filter(Boolean);
            items = items.filter(item => {
              const toolkit = asRecord(item.toolkit);
              const slug = globalThis.String(toolkit?.slug ?? '').toLowerCase();
              return slugs.includes(slug);
            });
          }

          if (query.search) {
            const search = query.search.toLowerCase();
            items = items.filter(item =>
              globalThis
                .String(item.name ?? '')
                .toLowerCase()
                .includes(search)
            );
          }

          if (query.limit !== undefined) {
            items = items.slice(0, query.limit);
          }

          return Effect.succeed(paginateRecords(items));
        },
        authConfigsRetrieve: authConfigId => {
          const authConfig = defaultAuthConfigs.find(item => item.id === authConfigId);
          return Effect.succeed(authConfig ?? {});
        },
        authConfigsCreate: body =>
          Effect.succeed({
            toolkit: body.toolkit,
            auth_config: {
              id: 'ac_created_1',
              auth_scheme:
                body.auth_config.type === 'use_custom_auth'
                  ? body.auth_config.authScheme
                  : 'OAUTH2',
              is_composio_managed: body.auth_config.type === 'use_composio_managed_auth',
            },
          }),
        authConfigsDelete: () => Effect.succeed({ success: true }),
        connectedAccountsList: query => {
          let items = [...defaultConnectedAccounts];

          if (query.user_ids && query.user_ids.length > 0) {
            const users = new Set(query.user_ids.map(v => v.toLowerCase()));
            items = items.filter(item =>
              users.has(globalThis.String(item.user_id ?? '').toLowerCase())
            );
          }

          if (query.toolkit_slugs && query.toolkit_slugs.length > 0) {
            const toolkits = new Set(query.toolkit_slugs.map(v => v.toLowerCase()));
            items = items.filter(item => {
              const toolkit = asRecord(item.toolkit);
              return toolkits.has(globalThis.String(toolkit?.slug ?? '').toLowerCase());
            });
          }

          if (query.connected_account_ids && query.connected_account_ids.length > 0) {
            const ids = new Set(query.connected_account_ids);
            items = items.filter(item => ids.has(globalThis.String(item.id ?? '')));
          }

          if (query.statuses && query.statuses.length > 0) {
            const statuses = new Set(query.statuses.map(v => v.toUpperCase()));
            items = items.filter(item =>
              statuses.has(globalThis.String(item.status ?? '').toUpperCase())
            );
          }

          if (query.limit !== undefined) {
            items = items.slice(0, query.limit);
          }

          return Effect.succeed(paginateRecords(items));
        },
        connectedAccountsRetrieve: connectedAccountId => {
          const account = defaultConnectedAccounts.find(item => item.id === connectedAccountId);
          return Effect.succeed(account ?? {});
        },
        connectedAccountsDelete: () => Effect.succeed({ success: true }),
        connectedAccountsLink: body =>
          Effect.succeed({
            connected_account_id: 'ca_link_1',
            redirect_url: `https://connect.composio.dev/link?user=${body.user_id}`,
            expires_at: '2026-01-01T01:00:00.000Z',
            link_token: 'link_token_1',
          }),
        triggerTypesList: query => {
          let items = toolkitsData.triggerTypes.map(trigger => ({ ...trigger })) as ReadonlyArray<
            Record<string, unknown>
          >;

          if (query.toolkit_slugs && query.toolkit_slugs.length > 0) {
            const prefixes = query.toolkit_slugs.map(slug => `${slug.toUpperCase()}_`);
            items = items.filter(item => {
              const slug = globalThis.String(item.slug ?? '').toUpperCase();
              return prefixes.some(prefix => slug.startsWith(prefix));
            });
          }

          if (query.limit !== undefined) {
            items = items.slice(0, query.limit);
          }

          return Effect.succeed(paginateRecords(items));
        },
        triggerTypesRetrieve: triggerSlug => {
          const trigger = toolkitsData.triggerTypes.find(
            item => item.slug.toUpperCase() === triggerSlug.toUpperCase()
          );

          return Effect.succeed(trigger ? { ...trigger } : {});
        },
        triggerInstancesUpsert: triggerSlug =>
          Effect.succeed({
            trigger_id: `ti_${triggerSlug.toLowerCase()}`,
            deprecated: {
              id: `ti_${triggerSlug.toLowerCase()}`,
              trigger_name: triggerSlug,
              uuid: `uuid_${triggerSlug.toLowerCase()}`,
            },
          } as never),
        triggerInstancesListActive: query => {
          let items = [...defaultTriggerInstances];

          if (query.connected_account_ids && query.connected_account_ids.length > 0) {
            const ids = new Set(query.connected_account_ids);
            items = items.filter(item =>
              ids.has(globalThis.String(item.connected_account_id ?? ''))
            );
          }

          if (query.user_ids && query.user_ids.length > 0) {
            const ids = new Set(query.user_ids.map(v => v.toLowerCase()));
            items = items.filter(item =>
              ids.has(globalThis.String(item.user_id ?? '').toLowerCase())
            );
          }

          if (query.trigger_ids && query.trigger_ids.length > 0) {
            const ids = new Set(query.trigger_ids);
            items = items.filter(item => ids.has(globalThis.String(item.id ?? '')));
          }

          if (query.trigger_names && query.trigger_names.length > 0) {
            const names = new Set(query.trigger_names.map(name => name.toUpperCase()));
            items = items.filter(item =>
              names.has(globalThis.String(item.trigger_name ?? '').toUpperCase())
            );
          }

          if (query.limit !== undefined) {
            items = items.slice(0, query.limit);
          }

          return Effect.succeed(paginateRecords(items));
        },
        triggerInstancesDelete: triggerId =>
          Effect.succeed({
            trigger_id: triggerId,
          }),
        triggerInstancesPatchStatus: () =>
          Effect.succeed({
            status: 'success',
          }),
      })
    );

    const ComposioSessionRepositoryTest = yield* setupComposioSessionRepository();

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

    const UpgradeBinaryTest = Layer.provide(
      UpgradeBinary.Default,
      Layer.mergeAll(BunFileSystem.layer, FetchHttpClient.layer)
    );

    const CliConfigLive = CliConfig.layer(ComposioCliConfig);

    const _console = yield* MockConsole.effect;

    const layers = Layer.mergeAll(
      Console.setConsole(_console),
      CliConfigLive,
      NodeProcessTest,
      UpgradeBinaryTest,
      ComposioUserContextTest,
      ComposioSessionRepositoryTest,
      ComposioToolkitsRepositoryTest,
      ComposioEntitiesRepositoryTest,
      EnvLangDetector.Default,
      JsPackageManagerDetector.Default,
      BunFileSystem.layer,
      BunContext.layer,
      MockTerminal.layer,
      BunPath.layer
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

    // If all retries fail, run the fallback effect
    const task = Effect.gen(function* () {
      yield* fs.makeDirectory(tmpFixturesPath, { recursive: true });
      yield* fs.copy(realFixturePath, tmpFixturesPath);
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
    });
    const ComposioSessionRepositoryTest = Layer.succeed(
      ComposioSessionRepository,
      composioSessionRepositoryTest
    );

    return ComposioSessionRepositoryTest;
  });
}
