import { Args, Command } from '@effect/cli';
import { Effect, Option } from 'effect';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { handleHttpServerError } from 'src/effects/handle-http-error';
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
 * composio manage tools info "GMAIL_SEND_EMAIL"
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
        'Try specifying a tool slug, e.g.:\n> composio manage tools info "GMAIL_SEND_EMAIL"'
      );
      return;
    }

    const slugValue = slug.value;

    const toolOpt = yield* ui
      .withSpinner(`Fetching tool "${slugValue}"...`, repo.getToolDetailed(slugValue))
      .pipe(
        Effect.asSome,
        Effect.catchTag(
          'services/HttpServerError',
          handleHttpServerError(ui, {
            fallbackMessage: `Tool "${slugValue}" not found.`,
            hint: 'Browse available tools:\n> composio manage tools list',
            fallbackValue: Option.none(),
            searchForSuggestions: () =>
              repo.searchTools({ search: slugValue, limit: 3 }).pipe(
                Effect.map(r =>
                  r.items.map(s => ({
                    label: `${s.slug} — ${s.description}`,
                    command: `> composio manage tools info "${s.slug}"`,
                  }))
                )
              ),
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
        `To list more tools in this toolkit:\n> composio manage tools list --toolkits "${toolkitSlug}"`
      );
    }

    yield* ui.output(JSON.stringify(tool, null, 2));
  })
).pipe(Command.withDescription('View details of a specific tool.'));
