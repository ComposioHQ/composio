import type { AuthConfigCreateResponse } from '@composio/client/resources/auth-configs';
import { bold } from 'src/ui/colors';
import { redact } from 'src/ui/redact';

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
