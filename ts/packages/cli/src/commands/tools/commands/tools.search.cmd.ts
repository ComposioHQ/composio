import { Args, Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
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
import { primeConsumerConnectedToolkitsCacheInBackground } from 'src/services/consumer-short-term-cache';
import { appendCliSessionHistory } from 'src/services/cli-session-artifacts';

const query = Args.text({ name: 'query' }).pipe(
  Args.withDescription(
    'Semantic use-case query (e.g. "onboard a new GitHub repo and notify Slack").'
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

const runToolsSearch = (params: {
  query: string;
  toolkits: Option.Option<string>;
  userId: Option.Option<string>;
  projectName: Option.Option<string>;
  limit: number;
  rootOnly: boolean;
}) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;
    const userContext = yield* ComposioUserContext;

    const clampedLimit = clampLimit(params.limit);
    const toolkitFilter = Option.getOrUndefined(params.toolkits);
    const toolkitList =
      toolkitFilter && toolkitFilter.trim().length > 0
        ? toolkitFilter
            .split(',')
            .map(s => s.trim().toLowerCase())
            .filter(Boolean)
        : undefined;

    const searchResult = yield* ui.withSpinner(
      `Searching tools for "${params.query}"...`,
      Effect.gen(function* () {
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
            queries: [{ use_case: params.query }],
          })
        );
        return {
          searchResponse,
          historyScope:
            resolvedProject.projectType === 'CONSUMER'
              ? {
                  orgId: resolvedProject.orgId,
                  consumerUserId: resolvedUserId.value,
                  toolRouterSessionId: sessionId,
                }
              : undefined,
        };
      })
    );
    const searchResponse = searchResult.searchResponse;

    const toolkitSet = toolkitList && toolkitList.length > 0 ? new Set(toolkitList) : undefined;

    const mergedSlugs: string[] = [];
    const seen = new Set<string>();
    for (const item of searchResponse.results) {
      for (const slug of [...item.primary_tool_slugs, ...item.related_tool_slugs]) {
        if (!seen.has(slug)) {
          seen.add(slug);
          mergedSlugs.push(slug);
        }
      }
    }

    const toolsList: Tool[] = [];
    for (const slug of mergedSlugs) {
      const schema = searchResponse.tool_schemas[slug];
      if (!schema) continue;
      if (toolkitSet && !toolkitSet.has(schema.toolkit.toLowerCase())) continue;

      toolsList.push({
        slug: schema.tool_slug,
        name: schema.tool_slug,
        description: schema.description ?? '',
        tags: [],
        available_versions: [],
        input_parameters: (schema.input_schema ?? {}) as Record<string, unknown>,
        output_parameters: (schema.output_schema ?? {}) as Record<string, unknown>,
      } as Tool);

      if (toolsList.length >= clampedLimit) break;
    }

    if (toolsList.length === 0) {
      yield* ui.log.warn(`No tools found matching "${params.query}". Try broadening your search.`);
      return;
    }

    const showing = toolsList.length;
    yield* ui.log.info(`Found ${showing} tools\n\n${formatToolsTable(toolsList)}`);

    const planSteps = Array.from(
      new Set(searchResponse.results.flatMap(result => result.recommended_plan_steps ?? []))
    );
    if (planSteps.length > 0) {
      yield* ui.log.info(`Plan:\n${planSteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}`);
    } else if (searchResponse.next_steps_guidance.length > 0) {
      yield* ui.log.info(
        `Plan:\n${searchResponse.next_steps_guidance
          .map((step, i) => `${i + 1}. ${step}`)
          .join('\n')}`
      );
    }

    const firstSlug = toolsList[0]?.slug;
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

    if (firstSlug) {
      const executeHint = params.rootOnly
        ? commandHintStep('Execute a tool', 'root.execute', {
            slug: firstSlug,
            data: firstDataArg,
          })
        : commandHintStep('Test a tool against a playground user', 'dev.playgroundExecute', {
            slug: firstSlug,
            userId: '<user-id>',
            data: firstDataArg,
          });
      const linkHint = params.rootOnly
        ? commandHintStep('Link an account', 'root.link', { toolkit: '<toolkit>' })
        : commandHintStep('Link an account', 'dev.connectedAccounts.link', {
            toolkit: '<toolkit>',
            userId: '<user-id>',
          });
      yield* ui.log.step([executeHint, linkHint].join('\n'));
    }

    if (searchResponse.error) {
      yield* ui.log.warn(searchResponse.error);
    }

    const cta: Array<{ action: string; command: string }> = [];
    if (firstSlug) {
      cta.push({
        action: 'Execute a tool',
        command: params.rootOnly
          ? commandHintExample('root.execute', { slug: firstSlug, data: firstDataArg })
          : commandHintExample('dev.playgroundExecute', {
              slug: firstSlug,
              userId: '<user-id>',
              data: firstDataArg,
            }),
      });
    }
    if (firstToolkit) {
      cta.push({
        action: 'Connect a user account',
        command: params.rootOnly
          ? commandHintExample('root.link', { toolkit: String(firstToolkit).toLowerCase() })
          : commandHintExample('dev.connectedAccounts.link', {
              toolkit: String(firstToolkit).toLowerCase(),
              userId: '<user-id>',
            }),
      });
    }

    const outputForJq = {
      ...searchResponse,
      CTA: cta,
    };
    yield* appendCliSessionHistory({
      orgId: searchResult.historyScope?.orgId,
      consumerUserId: searchResult.historyScope?.consumerUserId,
      entry: {
        command: 'search',
        query: params.query,
        toolkitFilter: toolkitList ?? [],
        limit: clampedLimit,
        resultCount: toolsList.length,
        toolRouterSessionId: searchResult.historyScope?.toolRouterSessionId,
        nextSteps: searchResponse.next_steps_guidance,
      },
    }).pipe(Effect.catchAll(() => Effect.void));
    yield* ui.output(JSON.stringify(outputForJq, null, 2));
  });

export const toolsCmd$Search = Command.make(
  'search',
  { query, toolkits, userId, projectName, limit },
  ({ query, toolkits, userId, projectName, limit }) =>
    runToolsSearch({ query, toolkits, userId, projectName, limit, rootOnly: false })
).pipe(
  Command.withDescription(
    [
      'Find tools by use case. Returns matching tools with slugs you can pass directly to `execute`.',
      '',
      'Examples:',
      '  composio search "send an email"',
      '  composio search "create issue" --toolkits github',
      '  composio search "list calendar events" --limit 5',
      '',
      'Next steps:',
      "  composio execute <slug> -d '{ ... }'    Run a tool from the results",
      "  composio tools info <slug>               Inspect a tool's schema before executing",
      '  composio link <toolkit>                  Connect an account if execute tells you to',
    ].join('\n')
  )
);

export const rootToolsCmd$Search = Command.make(
  'search',
  { query, toolkits, limit },
  ({ query, toolkits, limit }) =>
    runToolsSearch({
      query,
      toolkits,
      userId: Option.none(),
      projectName: Option.none(),
      limit,
      rootOnly: true,
    })
).pipe(
  Command.withDescription(
    [
      'Find tools by use case. Returns matching tools with slugs you can pass directly to `execute`.',
      '',
      'Examples:',
      '  composio search "send an email"',
      '  composio search "create issue" --toolkits github',
      '  composio search "list calendar events" --limit 5',
      '',
      'Next steps:',
      "  composio execute <slug> -d '{ ... }'    Run a tool from the results",
      "  composio tools info <slug>               Inspect a tool's schema before executing",
      '  composio link <toolkit>                  Connect an account if execute tells you to',
    ].join('\n')
  )
);
