import { Option, pipe } from 'effect';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import { redact } from 'src/ui/redact';
import { formatConnectedAccountsTable } from '../format';

// --- stderr -----------------------------------------------------------------------------------

export const FETCHING_CONNECTED_ACCOUNTS_MESSAGE = 'Fetching connected accounts...';
export const LIST_CONNECTED_ACCOUNTS_FAILED_MESSAGE = 'Failed to list connected accounts.';

/**
 * The warning for an empty page, naming the first filter that was given: `--toolkits`, then
 * `--user-id`, then `--status`.
 */
export const noConnectedAccountsMessage = (filters: {
  readonly toolkits: Option.Option<string>;
  readonly userId: Option.Option<string>;
  readonly status: Option.Option<string>;
}) =>
  pipe(
    Option.map(
      filters.toolkits,
      toolkits =>
        `No connected accounts found for toolkit "${toolkits}". Verify the toolkit slug with:\n> composio dev toolkits list`
    ),
    Option.orElse(() =>
      Option.map(filters.userId, userId => `No connected accounts found for user "${userId}".`)
    ),
    Option.orElse(() =>
      Option.map(filters.status, status => `No connected accounts found with status "${status}".`)
    ),
    Option.getOrElse(() => 'No connected accounts found.')
  );

/** The page as a table, under how many of the total it shows. */
export const listingMessage = (items: ReadonlyArray<ConnectedAccountItem>, total: number) =>
  `Listing ${items.length} of ${total} connected accounts\n\n${formatConnectedAccountsTable(items)}`;

/** The next step after a listing, naming the first account. */
export const viewDetailsHint = (id: string) =>
  `To view details of a connected account:\n> composio dev connected-accounts info "${redact({ value: id, prefix: 'con_' })}"`;

// --- stdout -----------------------------------------------------------------------------------

/**
 * Format connected accounts as JSON for piped output.
 */
export function formatConnectedAccountsJson(items: ReadonlyArray<ConnectedAccountItem>): string {
  return JSON.stringify(
    items.map(item => ({
      id: item.id,
      alias: item.alias,
      word_id: item.word_id,
      user_id: item.user_id,
      toolkit_slug: item.toolkit.slug,
      auth_config_id: item.auth_config.id,
      auth_scheme: item.auth_config.auth_scheme,
      status: item.status,
      created_at: item.created_at,
    })),
    null,
    2
  );
}
