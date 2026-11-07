import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import { bold } from 'src/ui/colors';
import { redact } from 'src/ui/redact';
import { formatStatus } from '../format';

// --- stderr -----------------------------------------------------------------------------------

/** The title of the note `formatConnectedAccountInfo` fills. */
export const connectedAccountInfoTitle = (item: ConnectedAccountItem) =>
  `Connected Account: ${item.toolkit.slug}`;

/**
 * Format a single connected account for interactive display.
 */
export function formatConnectedAccountInfo(item: ConnectedAccountItem): string {
  const lines: string[] = [];

  lines.push(`${bold('Id:')} ${redact({ value: item.id, prefix: 'con_' })}`);
  lines.push(`${bold('Alias:')} ${item.alias || '-'}`);
  lines.push(`${bold('Word Id:')} ${item.word_id || '-'}`);
  lines.push(`${bold('Status:')} ${formatStatus(item.status)}`);

  if (item.status_reason) {
    lines.push(`${bold('Status Reason:')} ${item.status_reason}`);
  }

  lines.push(`${bold('Toolkit:')} ${item.toolkit.slug}`);
  lines.push(`${bold('User Id:')} ${item.user_id}`);
  lines.push(
    `${bold('Auth Config:')} ${redact({ value: item.auth_config.id, prefix: 'ac_' })} (${item.auth_config.auth_scheme})`
  );
  lines.push(`${bold('Composio Managed:')} ${item.auth_config.is_composio_managed ? 'Yes' : 'No'}`);
  lines.push(`${bold('Disabled:')} ${item.is_disabled ? 'Yes' : 'No'}`);
  lines.push(`${bold('Created:')} ${item.created_at}`);
  lines.push(`${bold('Updated:')} ${item.updated_at}`);

  if (item.test_request_endpoint) {
    lines.push(`${bold('Test Endpoint:')} ${item.test_request_endpoint}`);
  }

  return lines.join('\n');
}

// --- stdout -----------------------------------------------------------------------------------

/** The whole decoded account, as JSON. */
export const formatConnectedAccountInfoJson = (item: ConnectedAccountItem) =>
  JSON.stringify(item, null, 2);
