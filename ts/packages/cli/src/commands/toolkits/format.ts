import type { Toolkit, ToolkitDetailed } from 'src/models/toolkits';
import type { SessionToolkitsResponse } from '@composio/client/resources/tool-router';
import { bold, gray, green, dim } from 'src/ui/colors';
import { truncate } from 'src/ui/truncate';

type SessionToolkitItem = SessionToolkitsResponse.Item;

const formatAuthConfigField = (field: {
  name: string;
  displayName: string;
  description: string;
  type: string;
  required: boolean;
  default: string | null;
}): string =>
  [
    `    - ${field.name} (${field.type})`,
    `      display: ${field.displayName}`,
    `      required: ${field.required ? 'yes' : 'no'}`,
    `      default: ${field.default ?? '-'}`,
    `      description: ${field.description || '-'}`,
  ].join('\n');

// ---------- Tool Router format functions ----------

/**
 * Derive connection status text and color from a session toolkit item.
 * Returns plain text + color function so callers can pad before coloring.
 */
function connectionStatusParts(item: SessionToolkitItem): {
  text: string;
  color: (s: string) => string;
} {
  if (item.is_no_auth) return { text: 'no auth', color: dim };
  if (item.connected_account?.status === 'ACTIVE') return { text: 'active', color: green };
  return { text: 'not connected', color: dim };
}

/**
 * Format a list of session toolkits as a human-readable table.
 */
export function formatToolkitsTable(toolkits: ReadonlyArray<SessionToolkitItem>): string {
  const header = `${bold('Name'.padEnd(20))} ${bold('Slug'.padEnd(20))} ${bold('Connected'.padEnd(16))} ${bold('Auth Scheme'.padEnd(14))} ${bold('Description')}`;

  const rows = toolkits.map(t => {
    const name = t.name.padEnd(20);
    const slug = t.slug.padEnd(20);
    // Pad plain text first, then apply color — ANSI escapes break padEnd.
    const { text: statusText, color: statusColor } = connectionStatusParts(t);
    const status = statusColor(statusText.padEnd(16));
    const authScheme = (t.connected_account?.auth_config?.auth_scheme ?? '-').padEnd(14);
    const desc = gray(truncate(t.meta.description, 50));
    return `${name} ${slug} ${status} ${authScheme} ${desc}`;
  });

  return [header, ...rows].join('\n');
}

/**
 * Format session toolkits as JSON for piped output.
 */
export function formatToolkitsJson(toolkits: ReadonlyArray<SessionToolkitItem>): string {
  return JSON.stringify(
    toolkits.map(t => ({
      name: t.name,
      slug: t.slug,
      description: t.meta.description,
      is_no_auth: t.is_no_auth,
      enabled: t.enabled,
      connected: t.connected_account
        ? {
            status: t.connected_account.status,
            id: t.connected_account.id,
            auth_scheme: t.connected_account.auth_config?.auth_scheme ?? null,
            is_composio_managed: t.connected_account.auth_config?.is_composio_managed ?? null,
          }
        : null,
      composio_managed_auth_schemes: t.composio_managed_auth_schemes,
    })),
    null,
    2
  );
}

/**
 * Format a single session toolkit for detailed interactive display.
 */
export function formatToolkitInfo(
  toolkit: SessionToolkitItem,
  detailed?: ToolkitDetailed,
  showAllDetails = false
): string {
  const lines: string[] = [];
  const detailedMeta = detailed?.meta;
  const availableVersions = detailedMeta?.available_versions ?? [];
  const latestVersion = availableVersions.at(-1);
  const authModes = detailed?.auth_config_details.map(detail => detail.mode) ?? [];

  lines.push(`${bold('Name:')} ${toolkit.name}`);
  lines.push(`${bold('Slug:')} ${toolkit.slug}`);
  lines.push(
    `${bold('Description:')} ${detailedMeta?.description || toolkit.meta.description || '(none)'}`
  );
  lines.push(`${bold('Latest Version:')} ${latestVersion ?? '-'}`);
  lines.push(`${bold('Tools Count:')} ${detailedMeta?.tools_count ?? '-'}`);
  lines.push(`${bold('Triggers Count:')} ${detailedMeta?.triggers_count ?? '-'}`);
  if (authModes.length > 0) {
    lines.push(`${bold('Auth Modes:')} ${authModes.join(', ')}`);
  }
  if (showAllDetails && detailed) {
    lines.push(`${bold('No Auth:')} ${detailed.no_auth ? 'Yes' : 'No'}`);
    lines.push(`${bold('Is Local Toolkit:')} ${detailed.is_local_toolkit ? 'Yes' : 'No'}`);
    lines.push(`${bold('Created At:')} ${String(detailed.meta.created_at)}`);
    lines.push(`${bold('Updated At:')} ${String(detailed.meta.updated_at)}`);
    lines.push(
      `${bold('Composio Managed Auth Schemes:')} ${
        detailed.composio_managed_auth_schemes.length > 0
          ? detailed.composio_managed_auth_schemes.join(', ')
          : '-'
      }`
    );
    lines.push('');
    lines.push(bold('Auth Config Details:'));
    if (detailed.auth_config_details.length === 0) {
      lines.push('  - none');
    } else {
      for (const detail of detailed.auth_config_details) {
        lines.push(`  - ${detail.mode} (${detail.name})`);
        const creationRequired = detail.fields.auth_config_creation.required;
        const creationOptional = detail.fields.auth_config_creation.optional;
        const initiationRequired = detail.fields.connected_account_initiation.required;
        const initiationOptional = detail.fields.connected_account_initiation.optional;

        lines.push('    auth_config_creation.required:');
        lines.push(
          creationRequired.length > 0
            ? creationRequired.map(formatAuthConfigField).join('\n')
            : '    - none'
        );
        lines.push('    auth_config_creation.optional:');
        lines.push(
          creationOptional.length > 0
            ? creationOptional.map(formatAuthConfigField).join('\n')
            : '    - none'
        );
        lines.push('    connected_account_initiation.required:');
        lines.push(
          initiationRequired.length > 0
            ? initiationRequired.map(formatAuthConfigField).join('\n')
            : '    - none'
        );
        lines.push('    connected_account_initiation.optional:');
        lines.push(
          initiationOptional.length > 0
            ? initiationOptional.map(formatAuthConfigField).join('\n')
            : '    - none'
        );
      }
    }
  }

  if (toolkit.is_no_auth) {
    lines.push(`${bold('Auth:')} No authentication required`);
  } else if (toolkit.composio_managed_auth_schemes.length > 0) {
    lines.push(
      `${bold('Composio Managed Auth Schemes:')} ${toolkit.composio_managed_auth_schemes.join(', ')}`
    );
  }

  // Connection status — render the actual status, not a hardcoded label
  lines.push('');
  if (toolkit.connected_account) {
    const ca = toolkit.connected_account;
    const statusDisplay = ca.status === 'ACTIVE' ? green(ca.status) : dim(ca.status);
    lines.push(`${bold('Connection Status:')} ${statusDisplay}`);
    lines.push(`${bold('Connected Account ID:')} ${ca.id}`);
    lines.push(`${bold('Auth Scheme:')} ${ca.auth_config?.auth_scheme ?? '-'}`);
    lines.push(
      `${bold('Composio Managed:')} ${ca.auth_config?.is_composio_managed ? 'Yes' : 'No'}`
    );
  } else if (!toolkit.is_no_auth) {
    lines.push(`${bold('Connection Status:')} ${dim('Not connected')}`);
    lines.push(
      `${bold('Tip:')} Link this toolkit:\n> composio connected-accounts link "${toolkit.slug}"`
    );
  }

  return lines.join('\n');
}

/**
 * Format a single session toolkit as JSON for piped output.
 * Produces a stable, curated schema — does not leak the raw API response.
 */
export function formatToolkitInfoJson(
  toolkit: SessionToolkitItem,
  detailed?: ToolkitDetailed,
  showAllDetails = false
): string {
  const availableVersions = detailed?.meta.available_versions ?? [];
  const latestVersion = availableVersions.at(-1) ?? null;
  return JSON.stringify(
    {
      name: toolkit.name,
      slug: toolkit.slug,
      meta: {
        description: detailed?.meta.description ?? toolkit.meta.description,
        logo: toolkit.meta.logo,
        latest_version: latestVersion,
        tools_count: detailed?.meta.tools_count ?? null,
        triggers_count: detailed?.meta.triggers_count ?? null,
      },
      is_no_auth: toolkit.is_no_auth,
      enabled: toolkit.enabled,
      connected_account: toolkit.connected_account
        ? {
            status: toolkit.connected_account.status,
            id: toolkit.connected_account.id,
            auth_scheme: toolkit.connected_account.auth_config?.auth_scheme ?? null,
            is_composio_managed: toolkit.connected_account.auth_config?.is_composio_managed ?? null,
          }
        : null,
      composio_managed_auth_schemes: toolkit.composio_managed_auth_schemes,
      auth_modes: detailed?.auth_config_details.map(detail => detail.mode) ?? [],
      ...(showAllDetails && detailed
        ? {
            detailed: {
              is_local_toolkit: detailed.is_local_toolkit,
              no_auth: detailed.no_auth,
              created_at: String(detailed.meta.created_at),
              updated_at: String(detailed.meta.updated_at),
              auth_config_details: detailed.auth_config_details,
            },
          }
        : {}),
    },
    null,
    2
  );
}

// ---------- Legacy format functions (used by non-migrated commands) ----------

/**
 * Format a list of toolkits as a human-readable table (legacy format).
 */
export function formatLegacyToolkitsTable(toolkits: ReadonlyArray<Toolkit>): string {
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
 * Format toolkits as JSON for piped output (legacy format).
 */
export function formatLegacyToolkitsJson(toolkits: ReadonlyArray<Toolkit>): string {
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
