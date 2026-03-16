import { Args, Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { clampLimit } from 'src/ui/clamp-limit';
import { resolveToolRouterSession } from 'src/effects/create-tool-router-session';
import { buildMinimalPayloadFromSchema } from 'src/ui/build-minimal-payload';
import { formatToolsTable } from '../format';
import type { Tool } from 'src/models/tools';
import { ProjectContext } from 'src/services/project-context';
import { ComposioUserContext } from 'src/services/user-context';

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
  Options.withDescription('User ID for the session (falls back to project/global test_user_id)')
);

const limit = Options.integer('limit').pipe(
  Options.withDefault(10),
  Options.withDescription('Number of results per page (1-1000)')
);

/**
 * Search tools semantically by use case.
 *
 * The query is interpreted semantically (not exact keyword matching), so you can
 * describe an outcome or workflow. The command returns the most relevant tools
 * for that use case and includes recommended guidance/plan steps to help execute it.
 *
 * @example
 * ```bash
 * composio tools search "send emails"
 * composio tools search "send emails" --toolkits "gmail,outlook"
 * composio tools search "messaging" --limit 5
 * ```
 */
export const toolsCmd$Search = Command.make(
  'search',
  { query, toolkits, userId, limit },
  ({ query, toolkits, userId, limit }) =>
    Effect.gen(function* () {
      if (!(yield* requireAuth)) return;

      const ui = yield* TerminalUI;
      const projectContext = yield* ProjectContext;
      const userContext = yield* ComposioUserContext;
      const resolvedProjectContext = yield* projectContext.resolve.pipe(
        Effect.catchAll(() => Effect.succeed(Option.none()))
      );
      const testUserId = Option.flatMap(resolvedProjectContext, keys => keys.testUserId);
      const globalTestUserId = userContext.data.testUserId;
      const resolvedUserId = Option.match(userId, {
        onSome: value => Option.some(value),
        onNone: () => Option.orElse(testUserId, () => globalTestUserId),
      });

      if (Option.isNone(resolvedUserId)) {
        return yield* Effect.fail(
          new Error(
            'Missing user id. Provide --user-id or run composio init to set test_user_id, or composio login to set global test_user_id.'
          )
        );
      }

      if (Option.isNone(userId) && Option.isSome(testUserId)) {
        yield* ui.log.warn(`Using test user id "${testUserId.value}"`);
      } else if (Option.isNone(userId) && Option.isSome(globalTestUserId)) {
        yield* ui.log.warn(`Using global test user id "${globalTestUserId.value}"`);
      }

      const clampedLimit = clampLimit(limit);
      const toolkitFilter = Option.getOrUndefined(toolkits);
      const toolkitList =
        toolkitFilter && toolkitFilter.trim().length > 0
          ? toolkitFilter
              .split(',')
              .map(s => s.trim().toLowerCase())
              .filter(Boolean)
          : undefined;

      const searchResponse = yield* ui.withSpinner(
        `Searching tools for "${query}"...`,
        Effect.gen(function* () {
          const { client, sessionId } = yield* resolveToolRouterSession(resolvedUserId.value, {
            toolkits: toolkitList,
          });
          return yield* Effect.tryPromise(() =>
            client.toolRouter.session.search(sessionId, {
              queries: [{ use_case: query }],
            })
          );
        })
      );

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
        yield* ui.log.warn(`No tools found matching "${query}". Try broadening your search.`);
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

      // Next step hint
      const firstSlug = toolsList[0]?.slug;
      if (firstSlug) {
        yield* ui.log.step(
          [
            'Hints:',
            `> composio tools info "${firstSlug}"`,
            `> composio tools execute "${firstSlug}" --user-id "<user-id>" --arguments '{}'`,
          ].join('\n')
        );
      }

      if (searchResponse.error) {
        yield* ui.log.warn(searchResponse.error);
      }

      // For machine-readable output (e.g. piping to jq), expose the full API payload with CTA.
      const firstSchema =
        firstSlug && searchResponse.tool_schemas[firstSlug]
          ? searchResponse.tool_schemas[firstSlug]
          : undefined;
      const firstToolkit = firstSchema?.toolkit;

      const cta: Array<{ action: string; command: string }> = [];
      if (firstSlug) {
        const payload = buildMinimalPayloadFromSchema(
          firstSchema?.input_schema as Record<string, unknown>
        );
        const payloadJson = JSON.stringify(payload);
        cta.push({
          action: 'Execute a tool',
          command: `composio execute "${firstSlug}" -d '${payloadJson}'`,
        });
      }
      if (firstToolkit) {
        cta.push({
          action: 'Connect a user account',
          command: `composio link ${String(firstToolkit).toLowerCase()}`,
        });
      }

      const outputForJq = {
        ...searchResponse,
        CTA: cta,
      };
      yield* ui.output(JSON.stringify(outputForJq, null, 2));
    })
).pipe(
  Command.withDescription(
    'Semantically search tools by use case; returns best-fit tools plus recommended usage guidance.'
  )
);
