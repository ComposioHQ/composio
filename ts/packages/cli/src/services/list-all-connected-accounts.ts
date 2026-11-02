import type { ComposioClientShape, ComposioError } from '@composio/client/effect';
import type {
  ConnectedAccountListParams,
  ConnectedAccountListResponse,
} from '@composio/client/resources/connected-accounts';
import { Effect, Stream } from 'effect';
import { ConnectedAccountListShapeError } from 'src/effects/decode-connected-account-list';
import { idempotent } from 'src/services/composio-request';

/**
 * The largest page `GET /connected_accounts` serves. The server clamps a
 * larger `limit` to this without an error, so a single request for more
 * returns 50 items and a `next_cursor`.
 */
export const CONNECTED_ACCOUNTS_MAX_PAGE_SIZE = 50;

/**
 * Lists every connected account matching `query`, following `next_cursor`
 * page by page until the server reports no next page. A single
 * `connectedAccounts.list` call returns at most
 * {@link CONNECTED_ACCOUNTS_MAX_PAGE_SIZE} accounts, so a caller that needs
 * the whole list (e.g. "is this toolkit connected?") must come through here.
 * The client's stream owns cursor traversal and pagination guards. Callers
 * decode the collected accounts; pagination failures keep the CLI's redacted
 * shape-error contract.
 */
export const listAllConnectedAccounts = (
  client: ComposioClientShape,
  query: Omit<ConnectedAccountListParams, 'cursor' | 'limit'>
): Effect.Effect<
  ConnectedAccountListResponse['items'],
  ComposioError | ConnectedAccountListShapeError
> =>
  client.connectedAccounts
    .listStream({ ...query, limit: CONNECTED_ACCOUNTS_MAX_PAGE_SIZE }, idempotent)
    .pipe(
      Stream.runCollect,
      Effect.catchTag(
        '@composio/client/ConfigurationError',
        (error): Effect.Effect<never, ComposioError | ConnectedAccountListShapeError> =>
          error.message.startsWith('Pagination ')
            ? Effect.fail(
                new ConnectedAccountListShapeError({
                  message: 'Invalid connected-account pagination response.',
                })
              )
            : Effect.fail(error)
      )
    );
