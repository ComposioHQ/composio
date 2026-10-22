import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import { bold } from 'src/ui/colors';
import { redact } from 'src/ui/redact';
import { formatStatus } from '../format';

// --- stderr -----------------------------------------------------------------------------------

/** The warning for an account that is not ACTIVE. */
export const inactiveStatusMessage = (status: string) =>
  `This connected account has status ${status}.`;

/** The title of the note `formatConnectedAccountWhoami` fills. */
export const connectedAccountWhoamiTitle = (item: ConnectedAccountItem) =>
  `whoami: ${item.toolkit.slug}`;

/**
 * Format a connected account for the whoami display (compact 6-field subset).
 */
export function formatConnectedAccountWhoami(item: ConnectedAccountItem): string {
  const lines: string[] = [];
  lines.push(`${bold('Id:')} ${redact({ value: item.id, prefix: 'con_' })}`);
  lines.push(`${bold('Alias:')} ${item.alias || '-'}`);
  lines.push(`${bold('Word Id:')} ${item.word_id || '-'}`);
  lines.push(`${bold('Status:')} ${formatStatus(item.status)}`);
  lines.push(`${bold('Toolkit:')} ${item.toolkit.slug}`);
  lines.push(`${bold('User Id:')} ${item.user_id}`);
  lines.push(`${bold('Auth Config:')} ${redact({ value: item.auth_config.id, prefix: 'ac_' })}`);
  lines.push(`${bold('Auth Scheme:')} ${item.auth_config.auth_scheme}`);
  return lines.join('\n');
}

// --- stdout -----------------------------------------------------------------------------------

/** Who the account is connected as, as JSON. */
export const formatConnectedAccountWhoamiJson = (item: ConnectedAccountItem) =>
  JSON.stringify(
    {
      id: item.id,
      alias: item.alias,
      word_id: item.word_id,
      toolkit: item.toolkit.slug,
      user_id: item.user_id,
      status: item.status,
      auth_config_id: item.auth_config.id,
      auth_scheme: item.auth_config.auth_scheme,
    },
    null,
    2
  );
