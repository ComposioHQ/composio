import { Args, Command } from '@effect/cli';
import { Effect, Option } from 'effect';
import { ComposioToolkitsRepository, HttpServerError } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { formatToolInfo } from '../format';

const slug = Args.text({ name: 'slug' }).pipe(
  Args.withDescription('Tool slug (e.g. "GMAIL_SEND_EMAIL")'),
  Args.optional
);

/**
 * View details of a specific tool including input/output schemas.
 *
 * @example
 * ```bash
 * composio tools info "GMAIL_SEND_EMAIL"
 * ```
 */
export const toolsCmd$Info = Command.make('info', { slug }, ({ slug }) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;

    // Missing slug guard
    if (Option.isNone(slug)) {
      yield* ui.log.warn('Missing required argument: <slug>');
      yield* ui.log.step(
        'Try specifying a tool slug, e.g.:\n> composio tools info "GMAIL_SEND_EMAIL"'
      );
      return;
    }

    const slugValue = slug.value;

    const toolOpt = yield* ui
      .withSpinner(`Fetching tool "${slugValue}"...`, repo.getToolDetailed(slugValue))
      .pipe(
        Effect.asSome,
        Effect.catchTag('services/HttpServerError', (e: HttpServerError) =>
          Effect.gen(function* () {
            // Show structured error message and suggested fix from the API
            if (e.details) {
              yield* ui.log.error(e.details.message);
              yield* ui.log.step(e.details.suggestedFix);
            } else {
              yield* ui.log.error(`Tool "${slugValue}" not found.`);
            }

            // Try to suggest similar tools
            const suggestions = yield* repo.searchTools({ search: slugValue, limit: 3 }).pipe(
              Effect.map(r => r.items),
              Effect.catchAll(() => Effect.succeed([]))
            );

            if (suggestions.length > 0) {
              const suggestionLines = suggestions
                .map(s => `  ${s.slug} — ${s.description}`)
                .join('\n');
              yield* ui.log.step(
                `Did you mean?\n${suggestionLines}\n\n> composio tools info "${suggestions[0]!.slug}"`
              );
            } else {
              yield* ui.log.step('Browse available tools:\n> composio tools list');
            }

            return Option.none();
          })
        )
      );

    if (Option.isNone(toolOpt)) {
      return;
    }

    const tool = toolOpt.value;

    yield* ui.note(formatToolInfo(tool), `Tool: ${tool.name}`);

    // Next step hint
    const toolkitSlug = tool.toolkit.slug;
    if (toolkitSlug) {
      yield* ui.log.step(
        `To list more tools in this toolkit:\n> composio tools list --toolkits "${toolkitSlug}"`
      );
    }

    yield* ui.output(JSON.stringify(tool, null, 2));
  })
).pipe(Command.withDescription('View details of a specific tool.'));
