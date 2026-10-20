import type { AuthConfigItem } from 'src/models/auth-configs';
import { bold } from 'src/ui/colors';
import { redact } from 'src/ui/redact';

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
