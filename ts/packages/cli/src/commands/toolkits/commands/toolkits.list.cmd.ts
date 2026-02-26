import { Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { resolveToolRouterSession } from 'src/effects/create-tool-router-session';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { ProjectContext } from 'src/services/project-context';
import { clampLimit } from 'src/ui/clamp-limit';
import {
  formatLegacyToolkitsJson,
  formatLegacyToolkitsTable,
  formatToolkitsJson,
  formatToolkitsTable,
} from '../format';

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
  Options.optional,
  Options.withDescription('User ID for connection status (defaults to project test_user_id)')
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
      const repo = yield* ComposioToolkitsRepository;
      const projectContext = yield* ProjectContext;

      const clampedLimit = clampLimit(limit);
      const resolvedProjectContext = yield* projectContext.resolve;
      const testUserId = Option.flatMap(resolvedProjectContext, keys => keys.testUserId);
      const resolvedUserId = Option.orElse(userId, () => testUserId);
      const usingDefaultTestUserId = Option.isNone(userId) && Option.isSome(testUserId);

      if (usingDefaultTestUserId && Option.isSome(testUserId)) {
        yield* ui.log.info(`Showing connection status for user id "${testUserId.value}"`);
        yield* ui.log.message('To show status for a specific user, use `--user-id`.');
      }

      if (Option.isSome(resolvedUserId)) {
        const result = yield* ui.withSpinner(
          'Fetching toolkits...',
          Effect.gen(function* () {
            const { client, sessionId } = yield* resolveToolRouterSession(resolvedUserId.value);
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

        const firstSlug = items[0]?.slug;
        if (firstSlug) {
          yield* ui.log.step(
            `To view details of a toolkit:\n> composio toolkits info "${firstSlug}"`
          );
        }
        yield* ui.output(formatToolkitsJson(items));
        return;
      }

      if (Option.isSome(connected)) {
        yield* ui.log.warn(
          '`--connected` requires a user id. Use `--user-id` or run `composio init`.'
        );
      }

      const result = yield* ui.withSpinner(
        'Fetching toolkits...',
        repo.searchToolkits({
          search: Option.getOrUndefined(query),
          limit: clampedLimit,
        })
      );
      const items = result.items;
      if (items.length === 0) {
        yield* ui.log.warn('No toolkits found. Try broadening your search.');
        yield* ui.output('[]');
        return;
      }
      const showing = items.length;
      const total = result.total_items;
      yield* ui.log.info(
        `Listing ${showing} of ${total} toolkits\n\n${formatLegacyToolkitsTable(items)}`
      );

      // Next step hint
      const firstSlug = items[0]?.slug;
      if (firstSlug) {
        yield* ui.log.step(
          `To view details of a toolkit:\n> composio toolkits info "${firstSlug}"`
        );
      }

      yield* ui.output(formatLegacyToolkitsJson(items));
    })
).pipe(Command.withDescription('List available toolkits with connection status.'));
