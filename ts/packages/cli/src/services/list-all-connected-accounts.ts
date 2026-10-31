import type { ComposioClientShape, ComposioError } from '@composio/client/effect';
import type {
  ConnectedAccountListParams,
  ConnectedAccountListResponse,
} from '@composio/client/resources/connected-accounts';
import { Effect } from 'effect';
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
 * Fails with the client's error; each caller wraps it in its own error.
 */
export const listAllConnectedAccounts = (
  client: ComposioClientShape,
  query: Omit<ConnectedAccountListParams, 'cursor' | 'limit'>
): Effect.Effect<ConnectedAccountListResponse['items'], ComposioError> =>
  Effect.gen(function* () {
    const items: Array<ConnectedAccountListResponse['items'][number]> = [];
    let cursor: string | undefined;
    do {
      const page = yield* client.connectedAccounts.list(
        { ...query, limit: CONNECTED_ACCOUNTS_MAX_PAGE_SIZE, cursor },
        idempotent
      );
      items.push(...page.items);
      cursor = page.next_cursor ?? undefined;
    } while (cursor !== undefined);
    return items;
  });
