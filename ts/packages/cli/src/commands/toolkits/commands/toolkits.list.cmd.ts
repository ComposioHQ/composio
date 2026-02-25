import { Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { resolveToolRouterSession } from 'src/effects/create-tool-router-session';
import { clampLimit } from 'src/ui/clamp-limit';
import { formatToolkitsTable, formatToolkitsJson } from '../format';

const query = Options.text('query').pipe(
  Options.withDescription('Text search by name, slug, or description'),
  Options.optional
);

const limit = Options.integer('limit').pipe(
  Options.withDefault(30),
  Options.withDescription('Number of results per page (1-1000)')
);

const connected = Options.boolean('connected').pipe(
  Options.withDescription('Filter to connected toolkits only'),
  Options.optional
);

const userId = Options.text('user-id').pipe(
  Options.withDefault('default'),
  Options.withDescription('User ID for connection status (default: "default")')
);

/**
 * List available toolkits with connection status.
 *
 * @example
 * ```bash
 * composio toolkits list
 * composio toolkits list --query "email"
 * composio toolkits list --connected
 * composio toolkits list --user-id "alice"
 * ```
 */
export const toolkitsCmd$List = Command.make(
  'list',
  { query, limit, connected, userId },
  ({ query, limit, connected, userId }) =>
    Effect.gen(function* () {
      if (!(yield* requireAuth)) return;

      const ui = yield* TerminalUI;

      const clampedLimit = clampLimit(limit);

      const result = yield* ui.withSpinner(
        'Fetching toolkits...',
        Effect.gen(function* () {
          const { client, sessionId } = yield* resolveToolRouterSession(userId);
          return yield* Effect.tryPromise(() =>
            client.toolRouter.session.toolkits(sessionId, {
              search: Option.getOrUndefined(query),
              limit: clampedLimit,
              is_connected: Option.getOrUndefined(connected),
            })
          );
        })
      );

      const { items } = result;

      if (items.length === 0) {
        yield* ui.log.warn('No toolkits found. Try broadening your search.');
        yield* ui.output('[]');
        return;
      }

      const showing = items.length;
      const total = result.total_items;

      yield* ui.log.info(
        `Listing ${showing} of ${total} toolkits\n\n${formatToolkitsTable(items)}`
      );

      // Next step hint
      const firstSlug = items[0]?.slug;
      if (firstSlug) {
        yield* ui.log.step(
          `To view details of a toolkit:\n> composio toolkits info "${firstSlug}"`
        );
      }

      yield* ui.output(formatToolkitsJson(items));
    })
).pipe(Command.withDescription('List available toolkits with connection status.'));
