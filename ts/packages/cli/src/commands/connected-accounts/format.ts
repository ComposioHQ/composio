import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import { bold, gray } from 'src/ui/colors';
import { redact } from 'src/ui/redact';
import { truncate } from 'src/ui/truncate';

/**
 * Format a list of connected accounts as a human-readable table.
 */
export function formatConnectedAccountsTable(items: ReadonlyArray<ConnectedAccountItem>): string {
  const header = `${bold('Id'.padEnd(18))} ${bold('Alias'.padEnd(14))} ${bold('Word'.padEnd(12))} ${bold('User Id'.padEnd(20))} ${bold('Toolkit'.padEnd(14))} ${bold('Auth Config'.padEnd(18))} ${bold('Auth Scheme'.padEnd(14))} ${bold('Status')}`;

  const rows = items.map(item => {
    const id = truncate(redact({ value: item.id, prefix: 'con_' }), 18).padEnd(18);
    const alias = truncate(item.alias || '-', 14).padEnd(14);
    const wordId = truncate(item.word_id || '-', 12).padEnd(12);
    const userId = truncate(item.user_id, 20).padEnd(20);
    const toolkit = truncate(item.toolkit.slug, 14).padEnd(14);
    const authConfig = truncate(redact({ value: item.auth_config.id, prefix: 'ac_' }), 18).padEnd(
      18
    );
    const authScheme = truncate(item.auth_config.auth_scheme || '-', 14).padEnd(14);
    const status = formatStatus(item.status);
    return `${id} ${alias} ${wordId} ${userId} ${toolkit} ${authConfig} ${authScheme} ${status}`;
  });

  return [header, ...rows].join('\n');
}

// --- shared by `info` and `whoami` ------------------------------------------------------------

/** The spinner label while `info` or `whoami` fetches one connected account. */
export const fetchingConnectedAccountMessage = (id: string) =>
  `Fetching connected account "${id}"...`;

/** The hint after `info` or `whoami` fails to fetch the account. */
export const BROWSE_CONNECTED_ACCOUNTS_HINT =
  'Browse available connected accounts:\n> composio dev connected-accounts list';

/** The warning when `info` or `whoami` is given no id. */
export const MISSING_ID_MESSAGE = 'Missing required argument: <id>';

/** The hint after `MISSING_ID_MESSAGE`, naming the subcommand that was run. */
export const missingIdHint = (subcommand: 'info' | 'whoami') =>
  `Try specifying a connected account ID, e.g.:\n> composio dev connected-accounts ${subcommand} "con_1a2b3c4d5e6f"\n\nTo find connected account IDs:\n> composio dev connected-accounts list`;

/** The `Status:` value: plain when active, gray otherwise. */
export const formatStatus = (status: string) => (status === 'ACTIVE' ? status : gray(status));
