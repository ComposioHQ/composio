import { Effect, Option } from 'effect';
import { handleClientApiError } from 'src/effects/handle-http-error';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { CLIENT_API_ERROR_TAGS } from 'src/services/composio-errors';
import { TerminalUI } from 'src/services/terminal-ui';
import {
  BROWSE_CONNECTED_ACCOUNTS_HINT,
  MISSING_ID_MESSAGE,
  fetchingConnectedAccountMessage,
  missingIdHint,
} from '../format';
import {
  connectedAccountWhoamiTitle,
  formatConnectedAccountWhoami,
  formatConnectedAccountWhoamiJson,
  inactiveStatusMessage,
} from './connected-accounts.whoami.format';

/** The arguments of `composio dev connected-accounts whoami`. */
export type ConnectedAccountsWhoamiParams = {
  readonly id: Option.Option<string>;
};

const showConnectedAccountProfile = (id: string) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;

    const item = yield* ui
      .withSpinner(fetchingConnectedAccountMessage(id), repo.getConnectedAccount(id))
      .pipe(
        Effect.asSome,
        Effect.catchTag(
          CLIENT_API_ERROR_TAGS,
          handleClientApiError(ui, {
            fallbackMessage: `Failed to fetch connected account "${id}".`,
            hint: BROWSE_CONNECTED_ACCOUNTS_HINT,
            fallbackValue: Option.none(),
          })
        )
      );

    yield* Option.match(item, {
      onNone: () => Effect.void,
      onSome: account =>
        Effect.gen(function* () {
          if (account.status !== 'ACTIVE') {
            yield* ui.log.warn(inactiveStatusMessage(account.status));
          }
          yield* ui.note(
            formatConnectedAccountWhoami(account),
            connectedAccountWhoamiTitle(account)
          );
          yield* ui.output(formatConnectedAccountWhoamiJson(account));
        }),
    });
  });

/**
 * Shows who a connected account is connected as (toolkit, user, status), warning when the
 * connection is not ACTIVE; a missing id warns and exits 0, as it always has.
 */
export const runConnectedAccountsWhoami = ({ id }: ConnectedAccountsWhoamiParams) =>
  Option.match(id, {
    onNone: () =>
      Effect.gen(function* () {
        const ui = yield* TerminalUI;
        yield* ui.log.warn(MISSING_ID_MESSAGE);
        yield* ui.log.step(missingIdHint('whoami'));
      }),
    onSome: showConnectedAccountProfile,
  });
