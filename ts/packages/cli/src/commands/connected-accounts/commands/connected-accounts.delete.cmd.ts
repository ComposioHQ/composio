import { Args, Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { handleHttpServerError } from 'src/effects/handle-http-error';

const id = Args.text({ name: 'id' }).pipe(
  Args.withDescription('Connected account ID (nanoid)'),
  Args.optional
);

const yes = Options.boolean('yes').pipe(
  Options.withAlias('y'),
  Options.withDescription('Skip confirmation prompt'),
  Options.withDefault(false)
);

/**
 * Delete a connected account.
 *
 * This is a soft-delete — the connected account is marked as deleted and cannot
 * be used for API calls. This operation cannot be undone.
 *
 * @example
 * ```bash
 * composio dev connected-accounts delete "con_1a2b3c4d5e6f"
 * composio dev connected-accounts delete "con_1a2b3c4d5e6f" --yes
 * ```
 */
export const connectedAccountsCmd$Delete = Command.make('delete', { id, yes }, ({ id, yes }) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;

    // Missing ID guard
    if (Option.isNone(id)) {
      yield* ui.log.warn('Missing required argument: <id>');
      yield* ui.log.step(
        'Try specifying a connected account ID, e.g.:\n> composio dev connected-accounts delete "con_1a2b3c4d5e6f"\n\nTo find connected account IDs:\n> composio dev connected-accounts list'
      );
      return;
    }

    const idValue = id.value;

    // Confirmation prompt (skipped with --yes or in non-interactive/piped mode)
    if (!yes) {
      const confirmed = yield* ui.confirm(
        `Delete connected account "${idValue}"? This cannot be undone.`,
        { defaultValue: false }
      );
      if (!confirmed) {
        yield* ui.log.warn('Deletion cancelled.');
        return;
      }
    }

    const deleted = yield* ui
      .withSpinner(
        `Deleting connected account "${idValue}"...`,
        repo.deleteConnectedAccount(idValue)
      )
      .pipe(
        Effect.as(true),
        Effect.catchTag(
          'services/HttpServerError',
          handleHttpServerError(ui, {
            fallbackMessage: `Failed to delete connected account "${idValue}".`,
            hint: 'Browse available connected accounts:\n> composio dev connected-accounts list',
            fallbackValue: false,
          })
        )
      );

    if (!deleted) {
      return;
    }

    yield* ui.log.success(`Connected account "${idValue}" deleted.`);
  })
).pipe(Command.withDescription('Delete a connected account.'));
