import { Args, Command } from '@effect/cli';
import { Effect, Option } from 'effect';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { handleHttpServerError } from 'src/effects/handle-http-error';
import { formatConnectedAccountInfo } from '../format';

const id = Args.text({ name: 'id' }).pipe(
  Args.withDescription('Connected account ID (nanoid)'),
  Args.optional
);

/**
 * View details of a specific connected account.
 *
 * @example
 * ```bash
 * composio dev connected-accounts info "con_1a2b3c4d5e6f"
 * ```
 */
export const connectedAccountsCmd$Info = Command.make('info', { id }, ({ id }) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;

    // Missing ID guard
    if (Option.isNone(id)) {
      yield* ui.log.warn('Missing required argument: <id>');
      yield* ui.log.step(
        'Try specifying a connected account ID, e.g.:\n> composio dev connected-accounts info "con_1a2b3c4d5e6f"\n\nTo find connected account IDs:\n> composio dev connected-accounts list'
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
            hint: 'Browse available connected accounts:\n> composio dev connected-accounts list',
            fallbackValue: Option.none(),
          })
        )
      );

    if (Option.isNone(itemOpt)) {
      return;
    }

    const item = itemOpt.value;

    yield* ui.note(formatConnectedAccountInfo(item), `Connected Account: ${item.toolkit.slug}`);

    yield* ui.output(JSON.stringify(item, null, 2));
  })
).pipe(Command.withDescription('View details of a specific connected account.'));
