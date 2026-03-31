import { Args, Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { clampLimit } from 'src/ui/clamp-limit';
import { resolveToolRouterSession } from 'src/effects/create-tool-router-session';
import { buildMinimalPayloadFromSchema } from 'src/ui/build-minimal-payload';
import { formatToolsTable } from '../format';
import type { Tool } from 'src/models/tools';
import { ComposioUserContext } from 'src/services/user-context';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import {
  resolveCommandProject,
  formatResolveCommandProjectError,
} from 'src/services/command-project';
import { commandHintExample, commandHintStep } from 'src/services/command-hints';
import {
  primeConsumerConnectedToolkitsCacheInBackground,
  writeConsumerConnectedToolkitsCache,
} from 'src/services/consumer-short-term-cache';
import { appendCliSessionHistory } from 'src/services/cli-session-artifacts';
import { getOrFetchToolInputDefinition } from 'src/services/tool-input-validation';

const query = Args.repeated(Args.text({ name: 'query' })).pipe(
  Args.withDescription(
    'One or more semantic use-case queries (e.g. "onboard a new GitHub repo", "notify Slack").'
  )
);

const toolkits = Options.text('toolkits').pipe(
  Options.withDescription('Filter by toolkit slugs, comma-separated (e.g. "gmail,outlook")'),
  Options.optional
);

const userId = Options.text('user-id').pipe(
  Options.optional,
  Options.withDescription('Developer-project user ID override')
);

const projectName = Options.text('project-name').pipe(
  Options.optional,
  Options.withDescription('Developer project name override for this command')
);

const limit = Options.integer('limit').pipe(
  Options.withDefault(10),
  Options.withDescription('Number of results per page (1-1000)')
);

const json = Options.boolean('json').pipe(
  Options.withDefault(false),
  Options.withDescription('Print the full search response as JSON (default behavior)')
);

const human = Options.boolean('human').pipe(
  Options.withDefault(false),
  Options.withDescription('Show formatted human-readable search output')
);

type SearchToolSchema = {
  tool_slug: string;
  toolkit: string;
  description?: string;
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
};

type SearchResultRecord = {
  use_case: string;
  primary_tool_slugs: string[];
  related_tool_slugs: string[];
  recommended_plan_steps?: string[];
  reference_workbench_snippets?: unknown;
  plan_id?: string;
};

type ToolkitConnectionStatusRecord = {
  toolkit: string;
  has_active_connection: boolean;
};

type SearchResponseRecord = {
  results: SearchResultRecord[];
  toolkit_connection_statuses: ToolkitConnectionStatusRecord[];
  tool_schemas: Record<string, SearchToolSchema>;
  next_steps_guidance: string[];
  error: string | null;
};

const stripSearchResultMetadata = <
  T extends { reference_workbench_snippets?: unknown; plan_id?: unknown },
>(
  result: T
) => {
  const {
    reference_workbench_snippets: _referenceWorkbenchSnippets,
    plan_id: _planId,
    ...rest
  } = result;
  return rest;
};

const TOOL_SCHEMA_PATH_FORMAT = '~/.composio/tool_definitions/<TOOL_SLUG>.json';

const toHomeRelativePath = (cacheDir: string, absolutePath: string) =>
  absolutePath.startsWith(cacheDir) ? absolutePath.replace(cacheDir, '~/.composio') : absolutePath;

const collectToolsForResult = (params: {
  result: {
    primary_tool_slugs: string[];
    related_tool_slugs: string[];
  };
  toolSchemas: Record<string, SearchToolSchema>;
  toolkitSet?: Set<string>;
  limit: number;
}): Tool[] => {
  const mergedSlugs: string[] = [];
  const seen = new Set<string>();
  for (const slug of [...params.result.primary_tool_slugs, ...params.result.related_tool_slugs]) {
    if (!seen.has(slug)) {
      seen.add(slug);
      mergedSlugs.push(slug);
    }
  }

  const toolsList: Tool[] = [];
  for (const slug of mergedSlugs) {
    const schema = params.toolSchemas[slug];
    if (!schema) continue;
    if (params.toolkitSet && !params.toolkitSet.has(schema.toolkit.toLowerCase())) continue;

    toolsList.push({
      slug: schema.tool_slug,
      name: schema.tool_slug,
      description: schema.description ?? '',
      tags: [],
      available_versions: [],
      input_parameters: (schema.input_schema ?? {}) as Record<string, unknown>,
      output_parameters: (schema.output_schema ?? {}) as Record<string, unknown>,
    } as Tool);

    if (toolsList.length >= params.limit) break;
  }

  return toolsList;
};

const buildSearchNextSteps = (params: {
  firstSlug?: string;
  firstToolkit?: string;
  firstDataArg: string;
  rootOnly: boolean;
}) => {
  const steps: Array<{ action: string; command: string }> = [];
  if (params.firstToolkit) {
    steps.push({
      action: 'Link a user account',
      command: params.rootOnly
        ? commandHintExample('root.link', { toolkit: String(params.firstToolkit).toLowerCase() })
        : commandHintExample('dev.connectedAccounts.link', {
            toolkit: String(params.firstToolkit).toLowerCase(),
            userId: '<user-id>',
          }),
    });
  }
  if (params.firstSlug) {
    steps.push({
      action: 'Execute a tool',
      command: params.rootOnly
        ? commandHintExample('root.execute', { slug: params.firstSlug, data: params.firstDataArg })
        : commandHintExample('dev.playgroundExecute', {
            slug: params.firstSlug,
            userId: '<user-id>',
            data: params.firstDataArg,
          }),
    });
  }
  return steps;
};

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
          const definition = yield* getOrFetchToolInputDefinition(slug, params.projectScope);
          return [slug, toHomeRelativePath(cacheDir, definition.schemaPath)] as const;
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
      }).pipe(Effect.catchAll(() => Effect.void));
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
    } as const;
  });

const emitHumanSearchOutput = (params: {
  ui: TerminalUI;
  queries: ReadonlyArray<string>;
  resultsWithTools: Array<{ result: SearchResultRecord; tools: Tool[] }>;
  nextStepsGuidance: ReadonlyArray<string>;
  firstSlug?: string;
  firstDataArg: string;
  rootOnly: boolean;
  error: string | null;
}) =>
  Effect.gen(function* () {
    for (const { result, tools } of params.resultsWithTools) {
      if (params.queries.length > 1) {
        yield* params.ui.log.info(`Results for "${result.use_case}"`);
      }

      if (tools.length === 0) {
        yield* params.ui.log.warn(`No tools found for "${result.use_case}".`);
        continue;
      }

      yield* params.ui.log.info(`Found ${tools.length} tools\n\n${formatToolsTable(tools)}`);

      const planSteps = Array.from(new Set(result.recommended_plan_steps ?? []));
      if (planSteps.length > 0) {
        yield* params.ui.log.info(
          `Plan:\n${planSteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}`
        );
      } else if (params.queries.length === 1 && params.nextStepsGuidance.length > 0) {
        yield* params.ui.log.info(
          `Plan:\n${params.nextStepsGuidance.map((step, i) => `${i + 1}. ${step}`).join('\n')}`
        );
      }
    }

    if (params.firstSlug) {
      const linkHint = params.rootOnly
        ? commandHintStep('Link an account', 'root.link', { toolkit: '<toolkit>' })
        : commandHintStep('Link an account', 'dev.connectedAccounts.link', {
            toolkit: '<toolkit>',
            userId: '<user-id>',
          });
      const executeHint = params.rootOnly
        ? commandHintStep('Execute a tool', 'root.execute', {
            slug: params.firstSlug,
            data: params.firstDataArg,
          })
        : commandHintStep('Test a tool against a playground user', 'dev.playgroundExecute', {
            slug: params.firstSlug,
            userId: '<user-id>',
            data: params.firstDataArg,
          });
      yield* params.ui.log.step([linkHint, executeHint].join('\n'));
    }

    if (params.error) {
      yield* params.ui.log.warn(params.error);
    }
  });

const runToolsSearch = (params: {
  query: ReadonlyArray<string>;
  toolkits: Option.Option<string>;
  userId: Option.Option<string>;
  projectName: Option.Option<string>;
  limit: number;
  json: boolean;
  human: boolean;
  rootOnly: boolean;
}) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;
    const userContext = yield* ComposioUserContext;

    const clampedLimit = clampLimit(params.limit);
    const emitHuman = params.human;
    const emitJson = params.json || !emitHuman;
    const queries = params.query.map(q => q.trim()).filter(Boolean);
    if (queries.length === 0) {
      return yield* Effect.fail(new Error('At least one query is required.'));
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
      const resolvedProject = yield* resolveCommandProject({
        mode: 'consumer',
        projectName: params.rootOnly ? undefined : Option.getOrUndefined(params.projectName),
      }).pipe(Effect.mapError(formatResolveCommandProjectError));
      const resolvedUserId =
        resolvedProject.projectType === 'CONSUMER'
          ? Option.fromNullable(resolvedProject.consumerUserId)
          : Option.match(params.userId, {
              onSome: value => Option.some(value),
              onNone: () => userContext.data.testUserId,
            });
      if (Option.isNone(resolvedUserId)) {
        return yield* Effect.fail(
          new Error(
            'Missing user id. Provide --user-id or run composio login to set global test_user_id.'
          )
        );
      }
      const clientSingleton = yield* ComposioClientSingleton;
      const client = yield* clientSingleton.getFor({
        orgId: resolvedProject.orgId,
        projectId: resolvedProject.projectId,
      });
      if (resolvedProject.projectType === 'CONSUMER') {
        yield* primeConsumerConnectedToolkitsCacheInBackground({
          orgId: resolvedProject.orgId,
          consumerUserId: resolvedUserId.value,
        });
      }
      const { sessionId } = yield* resolveToolRouterSession(client, resolvedUserId.value, {
        toolkits: toolkitList,
      });
      const searchResponse = yield* Effect.tryPromise(() =>
        client.toolRouter.session.search(sessionId, {
          queries: queries.map(query => ({ use_case: query })),
        })
      );
      return {
        searchResponse,
        projectScope: {
          orgId: resolvedProject.orgId,
          projectId: resolvedProject.projectId,
        },
        historyScope:
          resolvedProject.projectType === 'CONSUMER'
            ? {
                orgId: resolvedProject.orgId,
                consumerUserId: resolvedUserId.value,
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
    const firstPayload = buildMinimalPayloadFromSchema(
      (firstSchema?.input_schema ?? {}) as Record<string, unknown>
    );
    const firstPayloadJson = JSON.stringify(firstPayload);
    const firstDataArg =
      Object.keys(firstPayload).length === 0 ? '-d "{}"' : `-d '${firstPayloadJson}'`;

    const nextSteps = buildSearchNextSteps({
      firstSlug,
      firstToolkit,
      firstDataArg,
      rootOnly: params.rootOnly,
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
    }).pipe(Effect.catchAll(() => Effect.void));

    if (emitHuman) {
      yield* emitHumanSearchOutput({
        ui,
        queries,
        resultsWithTools,
        nextStepsGuidance: searchResponse.next_steps_guidance,
        firstSlug,
        firstDataArg,
        rootOnly: params.rootOnly,
        error: searchResponse.error,
      });
    } else if (emitJson) {
      const outputJson = JSON.stringify(outputForJq, null, 2);
      yield* ui.log.message(outputJson);
      yield* ui.output(outputJson);
    }
  });

export const toolsCmd$Search = Command.make(
  'search',
  { query, toolkits, userId, projectName, limit, json, human },
  ({ query, toolkits, userId, projectName, limit, json, human }) =>
    runToolsSearch({ query, toolkits, userId, projectName, limit, json, human, rootOnly: false })
).pipe(
  Command.withDescription(
    [
      'Find tools by use case. Defaults to full JSON output; use `--human` for formatted output.',
      '',
      'Examples:',
      '  composio search "send an email"',
      '  composio search "send an email" "create a github issue"',
      '  composio search "create issue" --toolkits github',
      '  composio search "send an email" --human',
      '  composio search "list calendar events" --limit 5',
      '',
      'Next steps:',
      '  composio link <toolkit>                  Connect an account before executing tools',
      "  composio execute <slug> -d '{ ... }'    Run a tool from the results",
      "  composio tools info <slug>               Inspect a tool's schema before executing",
    ].join('\n')
  )
);

export const rootToolsCmd$Search = Command.make(
  'search',
  { query, toolkits, limit, json, human },
  ({ query, toolkits, limit, json, human }) =>
    runToolsSearch({
      query,
      toolkits,
      userId: Option.none(),
      projectName: Option.none(),
      limit,
      json,
      human,
      rootOnly: true,
    })
).pipe(
  Command.withDescription(
    [
      'Find tools by use case. Defaults to full JSON output; use `--human` for formatted output.',
      '',
      'Examples:',
      '  composio search "send an email"',
      '  composio search "send an email" "create a github issue"',
      '  composio search "create issue" --toolkits github',
      '  composio search "send an email" --human',
      '  composio search "list calendar events" --limit 5',
      '',
      'Next steps:',
      '  composio link <toolkit>                  Connect an account before executing tools',
      "  composio execute <slug> -d '{ ... }'    Run a tool from the results",
      "  composio tools info <slug>               Inspect a tool's schema before executing",
    ].join('\n')
  )
);
