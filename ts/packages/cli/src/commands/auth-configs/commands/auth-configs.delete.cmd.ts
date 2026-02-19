import { Args, Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { handleHttpServerError } from 'src/effects/handle-http-error';

const id = Args.text({ name: 'id' }).pipe(
  Args.withDescription('Auth config ID (nanoid)'),
  Args.optional
);

const yes = Options.boolean('yes').pipe(
  Options.withAlias('y'),
  Options.withDescription('Skip confirmation prompt'),
  Options.withDefault(false)
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
 * composio auth-configs delete "ac_1232323" --yes
 * ```
 */
export const authConfigsCmd$Delete = Command.make('delete', { id, yes }, ({ id, yes }) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;

    // Missing ID guard
    if (Option.isNone(id)) {
      yield* ui.log.warn('Missing required argument: <id>');
      yield* ui.log.step(
        'Try specifying an auth config ID, e.g.:\n> composio auth-configs delete "ac_1232323"\n\nTo find auth config IDs:\n> composio auth-configs list'
      );
      return;
    }

    const idValue = id.value;

    // Confirmation prompt (skipped with --yes or in non-interactive/piped mode)
    if (!yes) {
      const confirmed = yield* ui.confirm(
        `Delete auth config "${idValue}"? This cannot be undone.`,
        { defaultValue: false }
      );
      if (!confirmed) {
        yield* ui.log.warn('Deletion cancelled.');
        return;
      }
    }

    const deleted = yield* ui
      .withSpinner(`Deleting auth config "${idValue}"...`, repo.deleteAuthConfig(idValue))
      .pipe(
        Effect.as(true),
        Effect.catchTag(
          'services/HttpServerError',
          handleHttpServerError(ui, {
            fallbackMessage: `Failed to delete auth config "${idValue}".`,
            hint: 'Browse available auth configs:\n> composio auth-configs list',
            fallbackValue: false,
          })
        )
      );

    if (!deleted) {
      return;
    }

    yield* ui.log.success(`Auth config "${idValue}" deleted.`);
  })
).pipe(Command.withDescription('Delete an auth config.'));
