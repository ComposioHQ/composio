import { Effect, Option } from 'effect';
import { commandInputError } from 'src/commands/errors';
import { actingUser, CommandSurface } from 'src/commands/surface';
import { TerminalUI } from 'src/services/terminal-ui';
import { failedWith } from 'src/effects/request-error';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { clampLimit } from 'src/ui/clamp-limit';
import { resolveToolRouterSession } from 'src/effects/create-tool-router-session';
import { buildMinimalPayloadFromSchema } from 'src/ui/build-minimal-payload';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { idempotent } from 'src/services/composio-request';
import { isRemoteCustomToolSlug } from 'src/utils/remote-custom-toolkit';
import { toolInputRequiredError } from 'src/utils/tool-input-required';
import {
  primeConsumerConnectedToolkitsCacheInBackground,
  writeConsumerConnectedToolkitsCache,
} from 'src/services/consumer-short-term-cache';
import { appendCliSessionHistory } from 'src/services/cli-session-artifacts';
import {
  cacheToolInputDefinition,
  getOrFetchToolInputDefinition,
} from 'src/services/tool-input-validation';
import { ToolsSearchRequestError } from './tools.search.errors';
import {
  buildSearchNextSteps,
  collectToolsForResult,
  emitHumanSearchOutput,
  stripSearchResultMetadata,
  toHomeRelativePath,
  TOOL_SCHEMA_PATH_FORMAT,
  type SearchResponseRecord,
  type SearchToolSchema,
} from './tools.search.format';

export type ToolsSearchParams = {
  readonly query: ReadonlyArray<string>;
  readonly toolkits: Option.Option<string>;
  readonly limit: number;
  readonly json: boolean;
  readonly human: boolean;
};

const invalidSearchInput = commandInputError('search');

const buildSearchJsonPayload = (params: {
  searchResponse: SearchResponseRecord;
  cacheScope: { orgId?: string; consumerUserId?: string };
  projectScope: { orgId: string; projectId: string };
  nextSteps: Array<{ action: string; command: string }>;
}) =>
  Effect.gen(function* () {
    const cacheDir = yield* setupCacheDir;
    const primaryToolSlugs = Array.from(
      new Set(params.searchResponse.results.flatMap(result => result.primary_tool_slugs))
    );
    const primaryToolSchemaPaths = Object.fromEntries(
      yield* Effect.forEach(primaryToolSlugs, slug =>
        Effect.gen(function* () {
          const searchSchema = params.searchResponse.tool_schemas[slug];
          const definition =
            isRemoteCustomToolSlug(slug) && searchSchema?.input_schema
              ? yield* cacheToolInputDefinition({
                  slug,
                  schema: searchSchema.input_schema,
                })
              : yield* getOrFetchToolInputDefinition(slug, params.projectScope);
          return [slug, toHomeRelativePath(cacheDir, definition.schemaPath)] satisfies readonly [
            string,
            string,
          ];
        })
      )
    );
    const connectedToolkits = Array.from(
      new Set(
        params.searchResponse.toolkit_connection_statuses
          .filter(status => status.has_active_connection)
          .map(status => status.toolkit.toLowerCase())
      )
    );

    if (params.cacheScope.orgId && params.cacheScope.consumerUserId) {
      yield* writeConsumerConnectedToolkitsCache({
        orgId: params.cacheScope.orgId,
        consumerUserId: params.cacheScope.consumerUserId,
        toolkits: connectedToolkits,
      }).pipe(Effect.catch(() => Effect.void));
    }

    return {
      results: params.searchResponse.results.map(stripSearchResultMetadata),
      tool_schemas: {
        primary: primaryToolSchemaPaths,
        related_tools_path_format: TOOL_SCHEMA_PATH_FORMAT,
      },
      connected_toolkits: connectedToolkits,
      ...(params.searchResponse.error ? { error: params.searchResponse.error } : {}),
      next_steps: {
        guidance:
          'You can directly proceed with these steps without waiting for the user to ask. Link accounts first if needed, then execute tools.',
        steps: params.nextSteps,
      },
    };
  });

export const runToolsSearch = (params: ToolsSearchParams) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const { tree } = yield* CommandSurface;

    const clampedLimit = clampLimit(params.limit);
    const emitHuman = params.human;
    const emitJson = params.json || !emitHuman;
    const queries = params.query.map(q => q.trim()).filter(Boolean);
    if (queries.length === 0) {
      return yield* invalidSearchInput('At least one query is required.', '<query>');
    }
    const toolkitFilter = Option.getOrUndefined(params.toolkits);
    const toolkitList =
      toolkitFilter && toolkitFilter.trim().length > 0
        ? toolkitFilter
            .split(',')
            .map(s => s.trim().toLowerCase())
            .filter(Boolean)
        : undefined;

    const runSearchRequest = Effect.gen(function* () {
      const { userId: resolvedUserId, project: resolvedProject } = yield* actingUser({
        // As before `actingUser`, an empty consumer user id still counts as a user.
        legacy: { acceptEmptyConsumerUserId: true },
        // Keep the earlier message, which mentions --user-id, over the root tree's default.
        missingUserMessage: () =>
          'Missing user id. Provide --user-id or run composio login to set global test_user_id.',
      }).pipe(
        // Re-fail with the `CommandInputError` the command has always failed with, so
        // `cli.command.failed` keeps reporting it as `error_name`.
        Effect.catchTag('commands/MissingActingUserError', error =>
          Effect.fail(invalidSearchInput(error.message, '--user-id'))
        )
      );
      const clientSingleton = yield* ComposioClientSingleton;
      const client = yield* clientSingleton.getFor({
        orgId: resolvedProject.orgId,
        projectId: resolvedProject.projectId,
      });
      if (resolvedProject.projectType === 'CONSUMER') {
        yield* primeConsumerConnectedToolkitsCacheInBackground({
          orgId: resolvedProject.orgId,
          consumerUserId: resolvedUserId,
        });
      }
      const { sessionId } = yield* resolveToolRouterSession(client, resolvedUserId, {
        toolkits: toolkitList,
        cacheScope:
          resolvedProject.projectType === 'CONSUMER' && resolvedProject.consumerUserId
            ? {
                orgId: resolvedProject.orgId,
                projectId: resolvedProject.projectId,
                consumerUserId: resolvedProject.consumerUserId,
              }
            : undefined,
      });
      const searchPayload = {
        queries: queries.map(query => ({ use_case: query })),
      };
      // The command reads a few of the search response's fields; the rest, enums
      // among them, may change without this version of the CLI noticing.
      const searchResponse = yield* client.toolRouter.session
        .search(sessionId, searchPayload, idempotent)
        .pipe(failedWith(ToolsSearchRequestError, 'Failed to search tools.'));
      const customToolSlugsMissingSchemas = Object.entries(searchResponse.tool_schemas)
        .filter(([slug, schema]) => isRemoteCustomToolSlug(slug) && !schema.input_schema)
        .map(([slug]) => slug);
      const hydratedSearchResponse =
        customToolSlugsMissingSchemas.length === 0
          ? searchResponse
          : yield* Effect.gen(function* () {
              const schemasFailed = (cause: unknown) =>
                new ToolsSearchRequestError({
                  message: 'Failed to fetch custom tool schemas.',
                  cause,
                });
              // Fetching tool schemas is a read, so it is retried like one.
              const schemaResponse = yield* client.toolRouter.session
                .executeMeta(
                  sessionId,
                  {
                    slug: 'COMPOSIO_GET_TOOL_SCHEMAS',
                    arguments: { tool_slugs: customToolSlugsMissingSchemas },
                  },
                  idempotent
                )
                .pipe(Effect.mapError(schemasFailed));
              if (schemaResponse.result_type === 'input_required') {
                return yield* schemasFailed(
                  toolInputRequiredError('COMPOSIO_GET_TOOL_SCHEMAS', schemaResponse)
                );
              }
              if (schemaResponse.result_type === 'blocked') {
                return yield* schemasFailed(new Error(schemaResponse.message));
              }
              if (schemaResponse.error) {
                return yield* schemasFailed(new Error(schemaResponse.error));
              }

              const resolvedSchemas = schemaResponse.data.tool_schemas;
              if (!resolvedSchemas || typeof resolvedSchemas !== 'object') {
                return yield* schemasFailed(new Error('Tool Router returned no tool schemas.'));
              }

              return {
                ...searchResponse,
                tool_schemas: {
                  ...searchResponse.tool_schemas,
                  ...(resolvedSchemas as Record<string, SearchToolSchema>),
                },
              };
            });
      return {
        searchResponse: hydratedSearchResponse,
        projectScope: {
          orgId: resolvedProject.orgId,
          projectId: resolvedProject.projectId,
        },
        historyScope:
          resolvedProject.projectType === 'CONSUMER'
            ? {
                orgId: resolvedProject.orgId,
                consumerUserId: resolvedUserId,
                toolRouterSessionId: sessionId,
              }
            : undefined,
      };
    });

    const searchResult = emitHuman
      ? yield* ui.withSpinner(
          queries.length === 1
            ? `Searching tools for "${queries[0]}"...`
            : `Searching tools for ${queries.length} queries...`,
          runSearchRequest
        )
      : yield* runSearchRequest;
    const searchResponse = searchResult.searchResponse;

    const toolkitSet = toolkitList && toolkitList.length > 0 ? new Set(toolkitList) : undefined;

    const resultsWithTools = searchResponse.results.map(result => ({
      result,
      tools: collectToolsForResult({
        result,
        toolSchemas: searchResponse.tool_schemas,
        toolkitSet,
        limit: clampedLimit,
      }),
    }));

    const totalToolCount = resultsWithTools.reduce((sum, item) => sum + item.tools.length, 0);
    if (totalToolCount === 0) {
      const description =
        queries.length === 1 ? `"${queries[0]}"` : `the provided ${queries.length} queries`;
      if (emitHuman) {
        yield* ui.log.warn(`No tools found matching ${description}. Try broadening your search.`);
      } else if (emitJson) {
        yield* ui.log.message('[]');
        yield* ui.output('[]');
      }
      return;
    }

    const firstToolsList = resultsWithTools.find(item => item.tools.length > 0)?.tools ?? [];
    const firstSlug = firstToolsList[0]?.slug;
    const firstSchema =
      firstSlug && searchResponse.tool_schemas[firstSlug]
        ? searchResponse.tool_schemas[firstSlug]
        : undefined;
    const firstToolkit = firstSchema?.toolkit;
    const firstPayload = buildMinimalPayloadFromSchema(firstSchema?.input_schema ?? {});
    const firstPayloadJson = JSON.stringify(firstPayload);
    const firstDataArg =
      Object.keys(firstPayload).length === 0 ? '-d "{}"' : `-d '${firstPayloadJson}'`;

    const nextSteps = buildSearchNextSteps({
      firstSlug,
      firstToolkit,
      firstDataArg,
      tree,
    });

    const outputForJq = yield* buildSearchJsonPayload({
      searchResponse,
      cacheScope: {
        orgId: searchResult.historyScope?.orgId,
        consumerUserId: searchResult.historyScope?.consumerUserId,
      },
      projectScope: searchResult.projectScope,
      nextSteps,
    });

    yield* appendCliSessionHistory({
      orgId: searchResult.historyScope?.orgId,
      consumerUserId: searchResult.historyScope?.consumerUserId,
      entry: {
        command: 'search',
        query: queries.join(' | '),
        queries,
        toolkitFilter: toolkitList ?? [],
        limit: clampedLimit,
        resultCount: totalToolCount,
        toolRouterSessionId: searchResult.historyScope?.toolRouterSessionId,
        nextSteps: searchResponse.next_steps_guidance,
      },
    }).pipe(Effect.catch(() => Effect.void));

    if (emitHuman) {
      yield* emitHumanSearchOutput({
        ui,
        queries,
        resultsWithTools,
        nextStepsGuidance: searchResponse.next_steps_guidance,
        firstSlug,
        firstDataArg,
        tree,
        error: searchResponse.error,
      });
    } else if (emitJson) {
      const outputJson = JSON.stringify(outputForJq, null, 2);
      yield* ui.log.message(outputJson);
      yield* ui.output(outputJson);
    }
  });
