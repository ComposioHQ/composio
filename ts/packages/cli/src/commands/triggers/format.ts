import type { TriggerType } from 'src/models/trigger-types';
import type { TriggerListenEvent } from './types';
import type { TriggerInstanceItem } from 'src/models/triggers';
import { bold, gray } from 'src/ui/colors';
import { escapeTerminalText } from 'src/ui/escape-terminal-text';
import { truncate } from 'src/ui/truncate';
import { extractSchemaProperties } from 'src/ui/extract-schema-properties';

/** One line per field; event values are escaped so each stays on its own line. */
export const formatTriggerListenSummary = (event: TriggerListenEvent): string => {
  const userId = event.userId || '-';
  const connectedAccountId = event.metadata.connectedAccount.id || '-';
  return [
    `Trigger: ${escapeTerminalText(event.triggerSlug)}`,
    `Toolkit: ${escapeTerminalText(event.toolkitSlug)}`,
    `Trigger Id: ${escapeTerminalText(event.id)}`,
    `Connected Account: ${escapeTerminalText(connectedAccountId)}`,
    `User Id: ${escapeTerminalText(userId)}`,
  ].join('\n');
};

const TRIGGER_TABLE = {
  timestamp: 24,
  triggerId: 20,
  triggerSlug: 22,
  toolkit: 8,
  userId: 16,
  connectedAccountId: 20,
} as const;

export const formatTriggerListenTableHeader = (): string =>
  [
    bold('Timestamp'.padEnd(TRIGGER_TABLE.timestamp)),
    bold('Trigger Id'.padEnd(TRIGGER_TABLE.triggerId)),
    bold('Trigger Slug'.padEnd(TRIGGER_TABLE.triggerSlug)),
    bold('Toolkit'.padEnd(TRIGGER_TABLE.toolkit)),
    bold('User Id'.padEnd(TRIGGER_TABLE.userId)),
    bold('Connected Account Id'),
  ].join(' ');

/**
 * One table row. Each cell is escaped before it is truncated, padded and styled, so the row
 * stays one line and its widths count what is shown.
 */
export const formatTriggerListenTableRow = ({
  timestamp,
  event,
}: {
  timestamp: string;
  event: TriggerListenEvent;
}): string => {
  const connectedAccountId = escapeTerminalText(event.metadata.connectedAccount.id || '-');
  const userId = escapeTerminalText(event.userId || '-');
  const timestampCell = truncate(escapeTerminalText(timestamp), TRIGGER_TABLE.timestamp).padEnd(
    TRIGGER_TABLE.timestamp
  );
  const triggerIdCell = truncate(escapeTerminalText(event.id), TRIGGER_TABLE.triggerId).padEnd(
    TRIGGER_TABLE.triggerId
  );

  return [
    gray(timestampCell),
    triggerIdCell,
    truncate(escapeTerminalText(event.triggerSlug), TRIGGER_TABLE.triggerSlug).padEnd(
      TRIGGER_TABLE.triggerSlug
    ),
    truncate(escapeTerminalText(event.toolkitSlug), TRIGGER_TABLE.toolkit).padEnd(
      TRIGGER_TABLE.toolkit
    ),
    truncate(userId, TRIGGER_TABLE.userId).padEnd(TRIGGER_TABLE.userId),
    truncate(connectedAccountId, TRIGGER_TABLE.connectedAccountId),
  ].join(' ');
};

const TRIGGER_TYPES_TABLE = {
  slug: 35,
  name: 26,
  type: 8,
} as const;

export const formatTriggerTypesTable = (triggerTypes: ReadonlyArray<TriggerType>): string => {
  const header = [
    bold('Slug'.padEnd(TRIGGER_TYPES_TABLE.slug)),
    bold('Name'.padEnd(TRIGGER_TYPES_TABLE.name)),
    bold('Type'.padEnd(TRIGGER_TYPES_TABLE.type)),
    bold('Description'),
  ].join(' ');

  const rows = triggerTypes.map(triggerType => {
    const slug = truncate(triggerType.slug, TRIGGER_TYPES_TABLE.slug).padEnd(
      TRIGGER_TYPES_TABLE.slug
    );
    const name = truncate(triggerType.name, TRIGGER_TYPES_TABLE.name).padEnd(
      TRIGGER_TYPES_TABLE.name
    );
    const type = truncate(triggerType.type, TRIGGER_TYPES_TABLE.type).padEnd(
      TRIGGER_TYPES_TABLE.type
    );
    const description = gray(truncate(triggerType.description, 50));
    return `${slug} ${name} ${type} ${description}`;
  });

  return [header, ...rows].join('\n');
};

export const formatTriggerTypesJson = (triggerTypes: ReadonlyArray<TriggerType>): string =>
  JSON.stringify(
    triggerTypes.map(triggerType => ({
      slug: triggerType.slug,
      name: triggerType.name,
      type: triggerType.type,
      description: triggerType.description,
    })),
    null,
    2
  );

function formatSchemaProperties(schema: Record<string, unknown>): string {
  const entries = extractSchemaProperties(schema);
  if (entries.length === 0) {
    return '  (none)';
  }

  const typeWidth = Math.max(...entries.map(e => e.type.length));
  const labelWidth = Math.max(...entries.map(e => e.label.length));
  const metadataLabels = ['description:', 'type:', 'required:', 'default:'] as const;
  const metadataLabelWidth = Math.max(...metadataLabels.map(label => label.length));

  return entries
    .map(e => {
      const lines: string[] = [];
      lines.push(`  ${bold(e.name)}`);
      lines.push(
        `    ${'description:'.padEnd(metadataLabelWidth)} ${e.description ? gray(truncate(e.description, 70)) : '-'}`
      );
      lines.push(`    ${'type:'.padEnd(metadataLabelWidth)} ${e.type.padEnd(typeWidth)}`);
      lines.push(`    ${'required:'.padEnd(metadataLabelWidth)} ${e.label.padEnd(labelWidth)}`);
      if (e.hasDefault) {
        lines.push(
          `    ${'default:'.padEnd(metadataLabelWidth)} ${gray(truncate(JSON.stringify(e.defaultValue), 40))}`
        );
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

export const formatTriggerTypeInfo = (triggerType: TriggerType): string => {
  const lines: string[] = [];

  lines.push(`${bold('Name:')} ${triggerType.name}`);
  lines.push(`${bold('Slug:')} ${triggerType.slug}`);
  lines.push(`${bold('Type:')} ${triggerType.type}`);
  lines.push(`${bold('Description:')} ${triggerType.description}`);
  lines.push(`${bold('Instructions:')} ${triggerType.instructions}`);

  lines.push('');
  lines.push(gray('------------------------------'));
  lines.push(bold('Config Fields:'));
  lines.push(formatSchemaProperties(triggerType.config));

  lines.push('');
  lines.push(gray('------------------------------'));
  lines.push(bold('Payload Fields:'));
  lines.push(formatSchemaProperties(triggerType.payload));

  return lines.join('\n');
};

const TRIGGER_STATUS_TABLE = {
  id: 20,
  triggerName: 26,
  toolkit: 10,
  userId: 16,
  connectedAccountId: 22,
  status: 10,
} as const;

const toStatus = (item: TriggerInstanceItem): string =>
  item.disabled_at === null ? 'ACTIVE' : 'DISABLED';

export const toolkitSlugFromTriggerName = (triggerName: string): string => {
  const prefix = triggerName.split('_')[0];
  return prefix ? prefix.toLowerCase() : '-';
};

export const formatTriggersStatusTable = (items: ReadonlyArray<TriggerInstanceItem>): string => {
  const header = [
    bold('Trigger Id'.padEnd(TRIGGER_STATUS_TABLE.id)),
    bold('Trigger Name'.padEnd(TRIGGER_STATUS_TABLE.triggerName)),
    bold('Toolkit'.padEnd(TRIGGER_STATUS_TABLE.toolkit)),
    bold('User Id'.padEnd(TRIGGER_STATUS_TABLE.userId)),
    bold('Connected Account'.padEnd(TRIGGER_STATUS_TABLE.connectedAccountId)),
    bold('Status'),
  ].join(' ');

  const rows = items.map(item => {
    const status = toStatus(item);
    return [
      truncate(item.id, TRIGGER_STATUS_TABLE.id).padEnd(TRIGGER_STATUS_TABLE.id),
      truncate(item.trigger_name, TRIGGER_STATUS_TABLE.triggerName).padEnd(
        TRIGGER_STATUS_TABLE.triggerName
      ),
      truncate(toolkitSlugFromTriggerName(item.trigger_name), TRIGGER_STATUS_TABLE.toolkit).padEnd(
        TRIGGER_STATUS_TABLE.toolkit
      ),
      truncate(item.user_id || '-', TRIGGER_STATUS_TABLE.userId).padEnd(
        TRIGGER_STATUS_TABLE.userId
      ),
      truncate(item.connected_account_id || '-', TRIGGER_STATUS_TABLE.connectedAccountId).padEnd(
        TRIGGER_STATUS_TABLE.connectedAccountId
      ),
      status === 'ACTIVE' ? status : gray(status),
    ].join(' ');
  });

  return [header, ...rows].join('\n');
};

export const formatTriggersStatusJson = (items: ReadonlyArray<TriggerInstanceItem>): string =>
  JSON.stringify(
    items.map(item => ({
      id: item.id,
      uuid: item.uuid || undefined,
      trigger_name: item.trigger_name,
      toolkit_slug: toolkitSlugFromTriggerName(item.trigger_name),
      user_id: item.user_id || undefined,
      connected_account_id: item.connected_account_id || undefined,
      status: toStatus(item),
      disabled_at: item.disabled_at,
      updated_at: item.updated_at || undefined,
      trigger_data: item.trigger_data || undefined,
    })),
    null,
    2
  );
