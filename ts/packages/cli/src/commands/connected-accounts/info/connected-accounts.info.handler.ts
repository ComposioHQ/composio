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
  connectedAccountInfoTitle,
  formatConnectedAccountInfo,
  formatConnectedAccountInfoJson,
} from './connected-accounts.info.format';

/** The arguments of `composio dev connected-accounts info`. */
export type ConnectedAccountsInfoParams = {
  readonly id: Option.Option<string>;
};

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

/** Shows one connected account; a missing id warns and exits 0, as it always has. */
export const runConnectedAccountsInfo = ({ id }: ConnectedAccountsInfoParams) =>
  Option.match(id, {
    onNone: () =>
      Effect.gen(function* () {
        const ui = yield* TerminalUI;
        yield* ui.log.warn(MISSING_ID_MESSAGE);
        yield* ui.log.step(missingIdHint('info'));
      }),
    onSome: showConnectedAccount,
  });
