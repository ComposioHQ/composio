import { Args, Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { resolveToolRouterSession } from 'src/effects/create-tool-router-session';
import { extractMessage } from 'src/utils/api-error-extraction';
import { formatToolkitInfo, formatToolkitInfoJson } from '../format';

const slug = Args.text({ name: 'slug' }).pipe(
  Args.withDescription('Toolkit slug (e.g. "gmail")'),
  Args.optional
);

const userId = Options.text('user-id').pipe(
  Options.withDefault('default'),
  Options.withDescription('User ID for connection status (default: "default")')
);

/**
 * View details of a specific toolkit including connection status.
 *
 * @example
 * ```bash
 * composio toolkits info "gmail"
 * composio toolkits info "github" --user-id "alice"
 * ```
 */
export const toolkitsCmd$Info = Command.make('info', { slug, userId }, ({ slug, userId }) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;

    // Missing slug guard
    if (Option.isNone(slug)) {
      yield* ui.log.warn('Missing required argument: <slug>');
      yield* ui.log.step('Try specifying a toolkit slug, e.g.:\n> composio toolkits info "gmail"');
      return;
    }

    const slugValue = slug.value;

    const resultOpt = yield* ui
      .withSpinner(
        `Fetching toolkit "${slugValue}"...`,
        Effect.gen(function* () {
          const { client, sessionId } = yield* resolveToolRouterSession(userId);
          return yield* Effect.tryPromise(() =>
            client.toolRouter.session.toolkits(sessionId, {
              toolkits: [slugValue],
            })
          );
        })
      )
      .pipe(
        Effect.asSome,
        Effect.catchAll(error =>
          Effect.gen(function* () {
            const message = extractMessage(error) ?? `Failed to fetch toolkit "${slugValue}".`;
            yield* ui.log.error(message);
            yield* Effect.logDebug('Toolkit info error:', error);
            yield* ui.log.step('Browse available toolkits:\n> composio toolkits list');
            return Option.none();
          })
        )
      );

    if (Option.isNone(resultOpt)) {
      return;
    }

    const result = resultOpt.value;
    const toolkit = result.items[0];

    if (!toolkit) {
      yield* ui.log.warn(`Toolkit "${slugValue}" not found.`);

      // "Did you mean?" suggestions via legacy search
      const repo = yield* ComposioToolkitsRepository;
      const suggestions = yield* repo.searchToolkits({ search: slugValue, limit: 3 }).pipe(
        Effect.map(r =>
          r.items.map(s => ({
            label: `${s.slug} — ${s.meta.description}`,
            command: `> composio toolkits info "${s.slug}"`,
          }))
        ),
        Effect.catchAll(() => Effect.succeed([] as { label: string; command: string }[]))
      );

      const [first] = suggestions;
      if (first) {
        const lines = suggestions.map(s => `  ${s.label}`).join('\n');
        yield* ui.log.step(`Did you mean?\n${lines}\n\n${first.command}`);
      } else {
        yield* ui.log.step('Browse available toolkits:\n> composio toolkits list');
      }
      return;
    }

    yield* ui.note(formatToolkitInfo(toolkit), `Toolkit: ${toolkit.name}`);

    // Next step hint
    yield* ui.log.step(
      `To list tools in this toolkit:\n> composio tools list --toolkits "${toolkit.slug}"`
    );

    yield* ui.output(formatToolkitInfoJson(toolkit));
  })
).pipe(Command.withDescription('View details of a specific toolkit.'));
