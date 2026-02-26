import { Args, Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { clampLimit } from 'src/ui/clamp-limit';
import { resolveToolRouterSession } from 'src/effects/create-tool-router-session';
import { formatToolsTable } from '../format';
import type { Tool } from 'src/models/tools';

const query = Args.text({ name: 'query' }).pipe(
  Args.withDescription('Search query (e.g. "send emails")')
);

const toolkits = Options.text('toolkits').pipe(
  Options.withDescription('Filter by toolkit slugs, comma-separated (e.g. "gmail,outlook")'),
  Options.optional
);

const limit = Options.integer('limit').pipe(
  Options.withDefault(10),
  Options.withDescription('Number of results per page (1-1000)')
);

/**
 * Search tools by use case.
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
  { query, toolkits, limit },
  ({ query, toolkits, limit }) =>
    Effect.gen(function* () {
      if (!(yield* requireAuth)) return;

      const ui = yield* TerminalUI;
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
          const { client, sessionId } = yield* resolveToolRouterSession('default-cli', {
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

      // For machine-readable output (e.g. piping to jq), expose the full API payload.
      yield* ui.output(JSON.stringify(searchResponse, null, 2));
    })
).pipe(Command.withDescription('Search tools by use case.'));
