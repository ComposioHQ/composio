import type { Logs } from '@composio/client/resources/logs/logs';
import { bold, gray, green, red } from 'src/ui/colors';
import { truncate } from 'src/ui/truncate';

type TriggerLog = Logs.TriggerListResponse.Data;
type ToolLog = Logs.ToolListResponse.Data;
type ToolLogDetailed = Logs.ToolRetrieveResponse;

const TRIGGER_LOG_TABLE = {
  createdAt: 24,
  id: 18,
  triggerId: 18,
  app: 12,
  triggerName: 28,
  triggerUserId: 16,
  connectedAccountId: 20,
} as const;

const TOOL_LOG_TABLE = {
  createdAt: 24,
  id: 18,
  status: 8,
  app: 12,
  actionKey: 28,
  executionMs: 12,
  connectedAccountId: 20,
} as const;

export const formatTriggerLogsTable = (logs: ReadonlyArray<TriggerLog>): string => {
  const header = [
    bold('Created At'.padEnd(TRIGGER_LOG_TABLE.createdAt)),
    bold('Log Id'.padEnd(TRIGGER_LOG_TABLE.id)),
    bold('Trigger Id'.padEnd(TRIGGER_LOG_TABLE.triggerId)),
    bold('Toolkit'.padEnd(TRIGGER_LOG_TABLE.app)),
    bold('Trigger'.padEnd(TRIGGER_LOG_TABLE.triggerName)),
    bold('User Id'.padEnd(TRIGGER_LOG_TABLE.triggerUserId)),
    bold('Connected Account Id'),
  ].join(' ');

  const rows = logs.map(log => {
    const createdAt = gray(
      truncate(formatCreatedAt(log.createdAt), TRIGGER_LOG_TABLE.createdAt).padEnd(
        TRIGGER_LOG_TABLE.createdAt
      )
    );
    const id = (log.id ?? '-').padEnd(TRIGGER_LOG_TABLE.id);
    const triggerId = truncate(getTriggerId(log), TRIGGER_LOG_TABLE.triggerId).padEnd(
      TRIGGER_LOG_TABLE.triggerId
    );
    const app = truncate(log.appName ?? '-', TRIGGER_LOG_TABLE.app).padEnd(TRIGGER_LOG_TABLE.app);
    const triggerName = truncate(getTriggerName(log), TRIGGER_LOG_TABLE.triggerName).padEnd(
      TRIGGER_LOG_TABLE.triggerName
    );
    const triggerUserId = truncate(log.entityId ?? '-', TRIGGER_LOG_TABLE.triggerUserId).padEnd(
      TRIGGER_LOG_TABLE.triggerUserId
    );
    const connectedAccountId = truncate(
      log.connectionId ?? '-',
      TRIGGER_LOG_TABLE.connectedAccountId
    );

    return [createdAt, id, triggerId, app, triggerName, triggerUserId, connectedAccountId].join(
      ' '
    );
  });

  return [header, ...rows].join('\n');
};

export const formatToolLogsTable = (logs: ReadonlyArray<ToolLog>): string => {
  const header = [
    bold('Created At'.padEnd(TOOL_LOG_TABLE.createdAt)),
    bold('Log Id'.padEnd(TOOL_LOG_TABLE.id)),
    bold('Status'.padEnd(TOOL_LOG_TABLE.status)),
    bold('Toolkit'.padEnd(TOOL_LOG_TABLE.app)),
    bold('Tool'.padEnd(TOOL_LOG_TABLE.actionKey)),
    bold('Exec Time'.padEnd(TOOL_LOG_TABLE.executionMs)),
    bold('Connected Account'),
  ].join(' ');

  const rows = logs.map(log => {
    const createdAt = gray(
      truncate(formatCreatedAt(log.createdAt), TOOL_LOG_TABLE.createdAt).padEnd(
        TOOL_LOG_TABLE.createdAt
      )
    );
    // Keep log ids untruncated for copy/paste workflows.
    const id = (log.id ?? '-').padEnd(TOOL_LOG_TABLE.id);
    const status = formatLogStatus(log.status, TOOL_LOG_TABLE.status);
    const app = truncate(log.app?.name ?? '-', TOOL_LOG_TABLE.app).padEnd(TOOL_LOG_TABLE.app);
    const actionKey = truncate(log.actionKey ?? '-', TOOL_LOG_TABLE.actionKey).padEnd(
      TOOL_LOG_TABLE.actionKey
    );
    const executionMs = `${log.executionTime ?? 0}ms`.padEnd(TOOL_LOG_TABLE.executionMs);
    const connectedAccountId = truncate(
      valueOrDash(log.connectedAccountId),
      TOOL_LOG_TABLE.connectedAccountId
    );

    return [createdAt, id, status, app, actionKey, executionMs, connectedAccountId].join(' ');
  });

  return [header, ...rows].join('\n');
};

const formatLogStatus = (status: string | null | undefined, width: number): string => {
  const label = truncate(valueOrDash(status), width).padEnd(width);
  const normalizedStatus = status?.trim().toLowerCase();

  if (normalizedStatus === 'success') return green(label);
  if (normalizedStatus === 'failure' || normalizedStatus === 'failed') return red(label);
  return label;
};

const valueOrDash = (value: string | null | undefined): string => {
  if (value == null) return '-';
  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : '-';
};

const getTriggerId = (log: TriggerLog): string => {
  const dynamicLog = log as unknown as Record<string, unknown>;
  const dynamicMeta = (dynamicLog.meta ?? {}) as Record<string, unknown>;
  const triggerId =
    typeof dynamicMeta.triggerNanoId === 'string'
      ? dynamicMeta.triggerNanoId
      : typeof dynamicMeta.trigger_nano_id === 'string'
        ? dynamicMeta.trigger_nano_id
        : typeof dynamicMeta.triggerId === 'string'
          ? dynamicMeta.triggerId
          : typeof dynamicMeta.trigger_id === 'string'
            ? dynamicMeta.trigger_id
            : typeof dynamicLog.triggerNanoId === 'string'
              ? dynamicLog.triggerNanoId
              : typeof dynamicLog.trigger_nano_id === 'string'
                ? dynamicLog.trigger_nano_id
                : typeof dynamicLog.triggerId === 'string'
                  ? dynamicLog.triggerId
                  : typeof dynamicLog.trigger_id === 'string'
                    ? dynamicLog.trigger_id
                    : null;
  return valueOrDash(triggerId);
};

const getTriggerName = (log: TriggerLog): string => {
  const dynamicLog = log as unknown as Record<string, unknown>;
  const dynamicMeta = (dynamicLog.meta ?? {}) as Record<string, unknown>;
  const triggerName =
    typeof dynamicMeta.triggerName === 'string'
      ? dynamicMeta.triggerName
      : typeof dynamicMeta.trigger_name === 'string'
        ? dynamicMeta.trigger_name
        : typeof dynamicLog.triggerName === 'string'
          ? dynamicLog.triggerName
          : typeof dynamicLog.trigger_name === 'string'
            ? dynamicLog.trigger_name
            : null;
  return valueOrDash(triggerName);
};

const formatEpoch = (value: number): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toISOString();
};

const formatCreatedAt = (value: number | string | null | undefined): string => {
  if (typeof value === 'number') return formatEpoch(value);
  if (typeof value === 'string') return value;
  return '-';
};

export const formatToolLogInfo = (toolLog: ToolLogDetailed): string => {
  const lines: string[] = [];
  lines.push(`${bold('logId:')} ${toolLog.actionLogId}`);
  lines.push(`${bold('toolSlug:')} ${toolLog.actionId}`);
  lines.push(`${bold('Status:')} ${toolLog.status}`);
  lines.push(`${bold('toolkit:')} ${toolLog.app?.name ?? '-'}`);
  lines.push(`${bold('Connection ID:')} ${toolLog.connection?.id ?? '-'}`);
  lines.push(`${bold('Entity:')} ${toolLog.connection?.entity ?? '-'}`);
  lines.push(`${bold('Start Time:')} ${formatCreatedAt(toolLog.startTime)}`);
  lines.push(`${bold('End Time:')} ${formatCreatedAt(toolLog.endTime)}`);
  lines.push(`${bold('Total Duration:')} ${toolLog.totalDuration}`);
  lines.push(`${bold('Version:')} ${toolLog.version}`);
  lines.push(`${bold('Steps:')} ${toolLog.steps?.length ?? 0}`);
  return lines.join('\n');
};
