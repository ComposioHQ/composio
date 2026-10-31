import type {
  LogCreateToolExecutionResponse,
  LogRetrieveToolExecutionResponse,
} from '@composio/client/resources/logs';
import { Option, Schema } from 'effect';
import type { TriggerLogRecord } from 'src/commands/logs/trigger-log-record';
import { bold, gray, green, red } from 'src/ui/colors';
import { truncate } from 'src/ui/truncate';

type ToolLog = LogCreateToolExecutionResponse['logs'][number];
type ToolLogDetailed = LogRetrieveToolExecutionResponse;

const readRecord = (value: unknown): Record<string, unknown> =>
  Option.getOrElse(
    Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.Unknown))(value),
    () => ({})
  );
const readString = (value: unknown): string | undefined =>
  Option.getOrUndefined(Schema.decodeUnknownOption(Schema.String)(value));
const readNumber = (value: unknown): number | undefined =>
  Option.getOrUndefined(Schema.decodeUnknownOption(Schema.Number)(value));

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

export const formatTriggerLogsTable = (logs: ReadonlyArray<TriggerLogRecord>): string => {
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
    const triggerId = truncate(
      valueOrDash(log.table.triggerId),
      TRIGGER_LOG_TABLE.triggerId
    ).padEnd(TRIGGER_LOG_TABLE.triggerId);
    const app = truncate(log.appName ?? '-', TRIGGER_LOG_TABLE.app).padEnd(TRIGGER_LOG_TABLE.app);
    const triggerName = truncate(
      valueOrDash(log.table.triggerName),
      TRIGGER_LOG_TABLE.triggerName
    ).padEnd(TRIGGER_LOG_TABLE.triggerName);
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
    const metadata = readRecord(log.metadata);
    const metrics = readRecord(log.metrics);
    const createdAt = gray(
      truncate(formatCreatedAt(log.timestamp), TOOL_LOG_TABLE.createdAt).padEnd(
        TOOL_LOG_TABLE.createdAt
      )
    );
    // Keep log ids untruncated for copy/paste workflows.
    const id = (log.id ?? '-').padEnd(TOOL_LOG_TABLE.id);
    const status = formatLogStatus(log.status, TOOL_LOG_TABLE.status);
    const app = truncate(
      readString(readRecord(metadata.toolkit).slug) ?? '-',
      TOOL_LOG_TABLE.app
    ).padEnd(TOOL_LOG_TABLE.app);
    const actionKey = truncate(
      readString(readRecord(metadata.tool).slug) ?? '-',
      TOOL_LOG_TABLE.actionKey
    ).padEnd(TOOL_LOG_TABLE.actionKey);
    const executionMs = formatDuration(metrics.duration_ms).padEnd(TOOL_LOG_TABLE.executionMs);
    const connectedAccountId = truncate(
      valueOrDash(readString(metadata.connected_account_id)),
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

const formatDuration = (value: unknown): string => {
  const durationMs = readNumber(value);
  return durationMs === undefined ? '-' : `${durationMs}ms`;
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
  const metadata = readRecord(toolLog.metadata);
  const tool = readRecord(metadata.tool);
  const data = readRecord(toolLog.data);
  return [
    `${bold('logId:')} ${toolLog.id}`,
    `${bold('toolSlug:')} ${valueOrDash(readString(tool.slug))}`,
    `${bold('Status:')} ${valueOrDash(toolLog.status)}`,
    `${bold('toolkit:')} ${valueOrDash(readString(readRecord(metadata.toolkit).slug))}`,
    `${bold('Connection ID:')} ${valueOrDash(readString(metadata.connected_account_id))}`,
    `${bold('Entity:')} ${valueOrDash(readString(metadata.user_id))}`,
    `${bold('Start Time:')} ${formatCreatedAt(toolLog.timings?.start_time ?? toolLog.timestamp)}`,
    `${bold('End Time:')} ${formatCreatedAt(toolLog.timings?.end_time)}`,
    `${bold('Total Duration:')} ${formatDuration(readRecord(toolLog.metrics).duration_ms)}`,
    `${bold('Version:')} ${valueOrDash(readString(tool.version))}`,
    `\nPayload:\n${JSON.stringify(readRecord(data.request).payload ?? {}, null, 2)}`,
    `\nResponse:\n${JSON.stringify(readRecord(data.response).body ?? {}, null, 2)}`,
  ].join('\n');
};

export const formatTriggerLogInfo = (triggerLog: TriggerLogRecord): string => {
  const { detail } = triggerLog;
  const lines: string[] = [];

  lines.push(`${bold('logId:')} ${valueOrDash(detail.logId)}`);
  lines.push(`${bold('triggerId:')} ${valueOrDash(detail.triggerId)}`);
  lines.push(`${bold('triggerNanoId:')} ${valueOrDash(detail.triggerNanoId)}`);
  lines.push(`${bold('trigger:')} ${valueOrDash(detail.triggerName)}`);
  lines.push(`${bold('Status:')} ${valueOrDash(detail.status)}`);
  lines.push(`${bold('toolkit:')} ${valueOrDash(detail.toolkit)}`);
  lines.push(`${bold('Connection ID:')} ${valueOrDash(detail.connectionId)}`);
  lines.push(`${bold('Entity:')} ${valueOrDash(detail.entityId)}`);
  lines.push(`${bold('Created At:')} ${formatCreatedAt(detail.createdAt)}`);

  return lines.join('\n');
};
