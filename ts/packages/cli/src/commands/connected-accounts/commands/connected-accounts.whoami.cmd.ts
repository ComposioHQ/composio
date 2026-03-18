import { Args, Command } from '@effect/cli';
import { Effect, Option } from 'effect';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { handleHttpServerError } from 'src/effects/handle-http-error';
import { formatConnectedAccountWhoami } from '../format';

const id = Args.text({ name: 'id' }).pipe(
  Args.withDescription('Connected account ID (nanoid)'),
  Args.optional
);

/**
 * Show the external account profile for a connected account.
 *
 * Retrieves the connected account details and displays a summary
 * of who is connected (toolkit, user, status). Warns when the
 * connection is in a non-ACTIVE state.
 *
 * @example
 * ```bash
 * composio manage connected-accounts whoami "con_1a2b3c4d5e6f"
 * ```
 */
export const connectedAccountsCmd$Whoami = Command.make('whoami', { id }, ({ id }) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;

    // Missing ID guard
    if (Option.isNone(id)) {
      yield* ui.log.warn('Missing required argument: <id>');
      yield* ui.log.step(
        'Try specifying a connected account ID, e.g.:\n> composio manage connected-accounts whoami "con_1a2b3c4d5e6f"\n\nTo find connected account IDs:\n> composio manage connected-accounts list'
      );
      return;
    }

    const idValue = id.value;

    const itemOpt = yield* ui
      .withSpinner(`Fetching connected account "${idValue}"...`, repo.getConnectedAccount(idValue))
      .pipe(
        Effect.asSome,
        Effect.catchTag(
          'services/HttpServerError',
          handleHttpServerError(ui, {
            fallbackMessage: `Failed to fetch connected account "${idValue}".`,
            hint: 'Browse available connected accounts:\n> composio manage connected-accounts list',
            fallbackValue: Option.none(),
          })
        )
      );

    if (Option.isNone(itemOpt)) {
      return;
    }

    const item = itemOpt.value;

    // Warn for non-ACTIVE connections
    if (item.status !== 'ACTIVE') {
      yield* ui.log.warn(`This connected account has status ${item.status}.`);
    }

    yield* ui.note(formatConnectedAccountWhoami(item), `whoami: ${item.toolkit.slug}`);

    yield* ui.output(
      JSON.stringify(
        {
          id: item.id,
          toolkit: item.toolkit.slug,
          user_id: item.user_id,
          status: item.status,
          auth_config_id: item.auth_config.id,
          auth_scheme: item.auth_config.auth_scheme,
        },
        null,
        2
      )
    );
  })
).pipe(Command.withDescription('Show the external account profile for a connected account.'));
