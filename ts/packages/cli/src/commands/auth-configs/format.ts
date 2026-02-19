import type { AuthConfigItem } from 'src/models/auth-configs';
import type { AuthConfigCreateResponse } from 'src/services/composio-clients';
import { bold, gray } from 'src/ui/colors';
import { redact } from 'src/ui/redact';
import { truncate } from 'src/ui/truncate';

/**
 * Format a list of auth configs as a human-readable table.
 */
export function formatAuthConfigsTable(items: ReadonlyArray<AuthConfigItem>): string {
  const header = `${bold('Name'.padEnd(24))} ${bold('Id'.padEnd(16))} ${bold('Toolkit'.padEnd(14))} ${bold('Auth Scheme'.padEnd(14))} ${bold('Type'.padEnd(10))} ${bold('Conns'.padEnd(7))} ${bold('Status')}`;

  const rows = items.map(item => {
    const name = truncate(item.name, 24).padEnd(24);
    const id = truncate(redact({ value: item.id, prefix: 'ac_' }), 16).padEnd(16);
    const toolkit = truncate(item.toolkit.slug, 14).padEnd(14);
    const authScheme = truncate(item.auth_scheme || '-', 14).padEnd(14);
    const type = item.type.padEnd(10);
    const conns = String(item.no_of_connections).padEnd(7);
    const status = item.status === 'ENABLED' ? item.status : gray(item.status);
    return `${name} ${id} ${toolkit} ${authScheme} ${type} ${conns} ${status}`;
  });

  return [header, ...rows].join('\n');
}

/**
 * Format auth configs as JSON for piped output.
 */
export function formatAuthConfigsJson(items: ReadonlyArray<AuthConfigItem>): string {
  return JSON.stringify(
    items.map(item => ({
      id: item.id,
      name: item.name,
      toolkit_slug: item.toolkit.slug,
      auth_scheme: item.auth_scheme,
      type: item.type,
      status: item.status,
      no_of_connections: item.no_of_connections,
      is_composio_managed: item.is_composio_managed,
    })),
    null,
    2
  );
}

/**
 * Format a single auth config for interactive display.
 */
export function formatAuthConfigInfo(item: AuthConfigItem): string {
  const lines: string[] = [];

  lines.push(`${bold('Id:')} ${redact({ value: item.id, prefix: 'ac_' })}`);
  lines.push(`${bold('Name:')} ${item.name}`);
  lines.push(`${bold('Toolkit:')} ${item.toolkit.slug}`);
  lines.push(`${bold('Auth Scheme:')} ${item.auth_scheme || '(none)'}`);
  lines.push(`${bold('Type:')} ${item.type}`);
  lines.push(`${bold('Status:')} ${item.status}`);
  lines.push(`${bold('Composio Managed:')} ${item.is_composio_managed ? 'Yes' : 'No'}`);
  lines.push(`${bold('Tool Router:')} ${item.is_enabled_for_tool_router ? 'Enabled' : 'Disabled'}`);
  lines.push(`${bold('Connected Accounts:')} ${item.no_of_connections}`);

  if (item.created_at) {
    lines.push(`${bold('Created:')} ${item.created_at}`);
  }

  return lines.join('\n');
}

/**
 * Format a create auth config response for interactive display.
 */
export function formatAuthConfigCreated(result: AuthConfigCreateResponse): string {
  const lines: string[] = [];

  lines.push(`${bold('Id:')} ${redact({ value: result.auth_config.id, prefix: 'ac_' })}`);
  lines.push(`${bold('Auth Scheme:')} ${result.auth_config.auth_scheme}`);
  lines.push(`${bold('Toolkit:')} ${result.toolkit.slug}`);
  lines.push(
    `${bold('Composio Managed:')} ${result.auth_config.is_composio_managed ? 'Yes' : 'No'}`
  );

  return lines.join('\n');
}
