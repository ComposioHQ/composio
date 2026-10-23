import { Effect, Option } from 'effect';
import { commandInputError } from 'src/commands/errors';
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
  connectedAccountInfoTitle,
  formatConnectedAccountInfo,
  formatConnectedAccountInfoJson,
} from './connected-accounts.info.format';

/** The arguments of `composio dev connected-accounts info`. */
export type ConnectedAccountsInfoParams = {
  readonly id: Option.Option<string>;
};

const invalidInput = commandInputError('dev connected-accounts info');

const showConnectedAccount = (id: string) =>
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
          yield* ui.note(formatConnectedAccountInfo(account), connectedAccountInfoTitle(account));
          yield* ui.output(formatConnectedAccountInfoJson(account));
        }),
    });
  });

/**
 * Shows one connected account. A missing `<id>` fails with a `CommandInputError` before any
 * request; an API failure is reported with a hint and exits 1.
 */
export const runConnectedAccountsInfo = ({ id }: ConnectedAccountsInfoParams) =>
  Effect.gen(function* () {
    if (Option.isNone(id)) {
      return yield* invalidInput(`${MISSING_ID_MESSAGE}\n${missingIdHint('info')}`, '<id>');
    }
    yield* showConnectedAccount(id.value);
  });
