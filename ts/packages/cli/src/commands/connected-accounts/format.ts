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
    const status = item.status === 'ACTIVE' ? item.status : gray(item.status);
    return `${id} ${alias} ${wordId} ${userId} ${toolkit} ${authConfig} ${authScheme} ${status}`;
  });

  return [header, ...rows].join('\n');
}

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

/**
 * Format a single connected account for interactive display.
 */
export function formatConnectedAccountInfo(item: ConnectedAccountItem): string {
  const lines: string[] = [];

  lines.push(`${bold('Id:')} ${redact({ value: item.id, prefix: 'con_' })}`);
  lines.push(`${bold('Alias:')} ${item.alias || '-'}`);
  lines.push(`${bold('Word Id:')} ${item.word_id || '-'}`);
  lines.push(`${bold('Status:')} ${item.status === 'ACTIVE' ? item.status : gray(item.status)}`);

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

/**
 * Format a connected account for the whoami display (compact 6-field subset).
 */
export function formatConnectedAccountWhoami(item: ConnectedAccountItem): string {
  const lines: string[] = [];
  lines.push(`${bold('Id:')} ${redact({ value: item.id, prefix: 'con_' })}`);
  lines.push(`${bold('Alias:')} ${item.alias || '-'}`);
  lines.push(`${bold('Word Id:')} ${item.word_id || '-'}`);
  lines.push(`${bold('Status:')} ${item.status === 'ACTIVE' ? item.status : gray(item.status)}`);
  lines.push(`${bold('Toolkit:')} ${item.toolkit.slug}`);
  lines.push(`${bold('User Id:')} ${item.user_id}`);
  lines.push(`${bold('Auth Config:')} ${redact({ value: item.auth_config.id, prefix: 'ac_' })}`);
  lines.push(`${bold('Auth Scheme:')} ${item.auth_config.auth_scheme}`);
  return lines.join('\n');
}
