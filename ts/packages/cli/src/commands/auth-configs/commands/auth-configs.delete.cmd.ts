import { Args, Command } from '@effect/cli';
import { Effect, Option } from 'effect';
import { ComposioToolkitsRepository, HttpServerError } from 'src/services/composio-clients';
import { ComposioUserContext } from 'src/services/user-context';
import { TerminalUI } from 'src/services/terminal-ui';

const id = Args.text({ name: 'id' }).pipe(
  Args.withDescription('Auth config ID (nanoid)'),
  Args.optional
);

/**
 * Delete an auth config.
 *
 * This is a soft-delete — the auth config is marked as deleted and cannot be used
 * for new connections. This operation cannot be undone.
 *
 * @example
 * ```bash
 * composio auth-configs delete "ac_1232323"
 * ```
 */
export const authConfigsCmd$Delete = Command.make('delete', { id }, ({ id }) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const ctx = yield* ComposioUserContext;
    const repo = yield* ComposioToolkitsRepository;

    // Auth guard
    if (Option.isNone(ctx.data.apiKey)) {
      yield* ui.log.warn('You are not logged in yet. Please run `composio login`.');
      return;
    }

    // Missing ID guard
    if (Option.isNone(id)) {
      yield* ui.log.warn('Missing required argument: <id>');
      yield* ui.log.step(
        'Try specifying an auth config ID, e.g.:\n> composio auth-configs delete "ac_1232323"\n\nTo find auth config IDs:\n> composio auth-configs list'
      );
      return;
    }

    const idValue = id.value;

    const deleted = yield* ui
      .withSpinner(`Deleting auth config "${idValue}"...`, repo.deleteAuthConfig(idValue))
      .pipe(
        Effect.as(true),
        Effect.catchTag('services/HttpServerError', (e: HttpServerError) =>
          Effect.gen(function* () {
            if (e.details) {
              yield* ui.log.error(e.details.message);
              yield* ui.log.step(e.details.suggestedFix);
            } else {
              yield* ui.log.error(`Failed to delete auth config "${idValue}".`);
            }

            yield* ui.log.step('Browse available auth configs:\n> composio auth-configs list');

            return false;
          })
        )
      );

    if (!deleted) {
      return;
    }

    yield* ui.log.success(`Auth config "${idValue}" deleted.`);
  })
).pipe(Command.withDescription('Delete an auth config.'));
