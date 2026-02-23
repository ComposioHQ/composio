import type { Toolkit, ToolkitDetailed, AuthConfigDetail } from 'src/models/toolkits';
import { bold, gray } from 'src/ui/colors';
import { truncate } from 'src/ui/truncate';

/**
 * Format a list of toolkits as a human-readable table.
 */
export function formatToolkitsTable(toolkits: ReadonlyArray<Toolkit>): string {
  const header = `${bold('Name'.padEnd(20))} ${bold('Slug'.padEnd(20))} ${bold('Version'.padEnd(12))} ${bold('Tools'.padEnd(7))} ${bold('Triggers'.padEnd(10))} ${bold('Description')}`;

  const rows = toolkits.map(t => {
    const name = t.name.padEnd(20);
    const slug = t.slug.padEnd(20);
    const version = (t.meta.available_versions.at(-1) ?? '-').padEnd(12);
    const tools = String(t.meta.tools_count).padEnd(7);
    const triggers = String(t.meta.triggers_count).padEnd(10);
    const desc = gray(truncate(t.meta.description, 50));
    return `${name} ${slug} ${version} ${tools} ${triggers} ${desc}`;
  });

  return [header, ...rows].join('\n');
}

/**
 * Format toolkits as JSON for piped output.
 */
export function formatToolkitsJson(toolkits: ReadonlyArray<Toolkit>): string {
  return JSON.stringify(
    toolkits.map(t => ({
      name: t.name,
      slug: t.slug,
      latest_version: t.meta.available_versions.at(-1) ?? null,
      tools_count: t.meta.tools_count,
      triggers_count: t.meta.triggers_count,
      description: t.meta.description,
    })),
    null,
    2
  );
}

/**
 * Format auth config fields for display.
 */
function formatFields(group: AuthConfigDetail['fields']['auth_config_creation']) {
  const allFields = [
    ...group.required.map(f => ({ ...f, label: 'required' })),
    ...group.optional.map(f => ({ ...f, label: 'optional' })),
  ];

  if (allFields.length === 0) {
    return '    (none)';
  }

  const nameWidth = Math.max(...allFields.map(f => f.name.length));
  const labelWidth = Math.max(...allFields.map(f => f.label.length));
  const typeWidth = Math.max(...allFields.map(f => f.type.length));

  return allFields
    .map(field => {
      const desc = field.description ? `  ${gray(`"${field.description}"`)}` : '';
      return `    ${field.name.padEnd(nameWidth)} ${field.label.padEnd(labelWidth)} ${field.type.padEnd(typeWidth)}${desc}`;
    })
    .join('\n');
}

/**
 * Format a detailed toolkit for interactive display.
 */
export function formatToolkitInfo(toolkit: ToolkitDetailed): string {
  const lines: string[] = [];

  lines.push(`${bold('Name:')} ${toolkit.name}`);
  lines.push(`${bold('Slug:')} ${toolkit.slug}`);

  const versions = toolkit.meta.available_versions;
  const latest = versions.at(-1);
  if (latest) {
    lines.push(`${bold('Latest Version:')} ${latest} (${versions.length} available)`);
  } else {
    lines.push(`${bold('Latest Version:')} -`);
  }

  lines.push(`${bold('Description:')} ${toolkit.meta.description || '(none)'}`);

  // Derive auth schemes from auth_config_details
  const authSchemes = toolkit.auth_config_details.map(d => d.mode);
  if (toolkit.no_auth) {
    lines.push(`${bold('Auth:')} No authentication required`);
  } else if (authSchemes.length > 0) {
    lines.push(`${bold('Auth Schemes:')} ${authSchemes.join(', ')}`);
    if (toolkit.composio_managed_auth_schemes.length > 0) {
      lines.push(
        `${bold('Composio Managed Auth Schemes:')} ${toolkit.composio_managed_auth_schemes.join(', ')}`
      );
    }
  }

  // Auth config creation fields
  if (toolkit.auth_config_details.length > 0) {
    lines.push('');
    lines.push(bold('Fields Required for AuthConfig creation:'));
    for (const detail of toolkit.auth_config_details) {
      lines.push(`  ${detail.name} (${detail.mode}):`);
      lines.push(formatFields(detail.fields.auth_config_creation));
    }

    lines.push('');
    lines.push(bold('Fields Required for Connected Account creation:'));
    for (const detail of toolkit.auth_config_details) {
      lines.push(`  ${detail.name} (${detail.mode}):`);
      lines.push(formatFields(detail.fields.connected_account_initiation));
    }
  }

  return lines.join('\n');
}
