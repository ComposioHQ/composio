import { Args, Command } from '@effect/cli';
import { Effect, Option } from 'effect';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { handleHttpServerError } from 'src/effects/handle-http-error';
import { formatToolkitInfo } from '../format';

const slug = Args.text({ name: 'slug' }).pipe(
  Args.withDescription('Toolkit slug (e.g. "gmail")'),
  Args.optional
);

/**
 * View details of a specific toolkit including auth schemes and required fields.
 *
 * @example
 * ```bash
 * composio toolkits info "gmail"
 * ```
 */
export const toolkitsCmd$Info = Command.make('info', { slug }, ({ slug }) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;

    // Missing slug guard
    if (Option.isNone(slug)) {
      yield* ui.log.warn('Missing required argument: <slug>');
      yield* ui.log.step('Try specifying a toolkit slug, e.g.:\n> composio toolkits info "gmail"');
      return;
    }

    const slugValue = slug.value;

    const toolkitOpt = yield* ui
      .withSpinner(`Fetching toolkit "${slugValue}"...`, repo.getToolkitDetailed(slugValue))
      .pipe(
        Effect.asSome,
        Effect.catchTag(
          'services/HttpServerError',
          handleHttpServerError(ui, {
            fallbackMessage: `Failed to fetch toolkit "${slugValue}".`,
            hint: 'Browse available toolkits:\n> composio toolkits list',
            fallbackValue: Option.none(),
            searchForSuggestions: () =>
              repo.searchToolkits({ search: slugValue, limit: 3 }).pipe(
                Effect.map(r =>
                  r.items.map(s => ({
                    label: `${s.slug} — ${s.meta.description}`,
                    command: `> composio toolkits info "${s.slug}"`,
                  }))
                )
              ),
          })
        )
      );

    if (Option.isNone(toolkitOpt)) {
      return;
    }

    const toolkit = toolkitOpt.value;

    yield* ui.note(formatToolkitInfo(toolkit), `Toolkit: ${toolkit.name}`);

    // Next step hint
    yield* ui.log.step(
      `To list tools in this toolkit:\n> composio tools list --toolkits "${toolkit.slug}"`
    );

    yield* ui.output(JSON.stringify(toolkit, null, 2));
  })
).pipe(Command.withDescription('View details of a specific toolkit.'));
