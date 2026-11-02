import type { ComposioClientShape, ComposioError } from '@composio/client/effect';
import type {
  ConnectedAccountListParams,
  ConnectedAccountListResponse,
} from '@composio/client/resources/connected-accounts';
import { Effect } from 'effect';
import {
  decodeConnectedAccountPage,
  type ConnectedAccountListShapeError,
} from 'src/effects/decode-connected-account-list';
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
 * Validates each page's container and cursor before reading them. Callers
 * decode the collected accounts and wrap request or shape failures.
 */
export const listAllConnectedAccounts = (
  client: ComposioClientShape,
  query: Omit<ConnectedAccountListParams, 'cursor' | 'limit'>
): Effect.Effect<
  ConnectedAccountListResponse['items'],
  ComposioError | ConnectedAccountListShapeError
> =>
  Effect.gen(function* () {
    const items: Array<ConnectedAccountListResponse['items'][number]> = [];
    let cursor: string | undefined;
    do {
      const rawPage = yield* client.connectedAccounts.list(
        { ...query, limit: CONNECTED_ACCOUNTS_MAX_PAGE_SIZE, cursor },
        idempotent
      );
      const page = yield* decodeConnectedAccountPage(rawPage);
      items.push(...page.items);
      cursor = page.next_cursor || undefined;
    } while (cursor !== undefined);
    return items;
  });
