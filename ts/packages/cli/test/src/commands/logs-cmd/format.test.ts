import type { Logs } from '@composio/client/resources/logs/logs';
import { describe, expect, it } from 'vitest';
import {
  formatToolLogInfo,
  formatToolLogsTable,
  formatTriggerLogsTable,
} from 'src/commands/logs-cmd/format';

type TriggerLog = Logs.TriggerListResponse.Data;
type ToolLog = Logs.ToolListResponse.Data;
type ToolLogDetailed = Logs.ToolRetrieveResponse;

const makeTriggerLog = (createdAt: TriggerLog['createdAt'] | number): TriggerLog =>
  ({
    createdAt: createdAt as TriggerLog['createdAt'],
    status: 'success',
    appName: 'gmail',
    meta: {
      triggerName: 'NEW_GMAIL_MESSAGE',
    },
    entityId: 'entity_123',
    connectionId: 'conn_123',
  }) as TriggerLog;

const makeToolLog = (createdAt: ToolLog['createdAt'] | null): ToolLog =>
  ({
    id: 'tool_log_1',
    createdAt,
    status: 'success',
    app: { name: 'gmail' },
    actionKey: 'GMAIL_SEND_EMAIL',
    executionTime: 20,
    connectedAccountId: 'conn_123',
  }) as ToolLog;

const makeToolLogDetailed = (): ToolLogDetailed =>
  ({
    actionLogId: 'tool_log_1',
    actionId: 'GMAIL_SEND_EMAIL',
    status: 'success',
    app: null,
    connection: null,
    startTime: 0,
    endTime: 0,
    totalDuration: '20ms',
    version: '20260101_00',
    steps: null,
  }) as unknown as ToolLogDetailed;

describe('formatTriggerLogsTable', () => {
  it('[Given] createdAt is epoch number [Then] it formats without crashing', () => {
    const output = formatTriggerLogsTable([makeTriggerLog(0)]);
    expect(output).toContain('1970-01-01T00:00:00.000Z');
    expect(output).toContain('NEW_GMAIL_MESSAGE');
  });

  it('[Given] createdAt is string [Then] it preserves previous behavior', () => {
    const output = formatTriggerLogsTable([makeTriggerLog('2026-02-24T12:34:56.000Z')]);
    expect(output).toContain('2026-02-24T12:34:56.000Z');
  });
});

describe('formatToolLogsTable', () => {
  it('[Given] createdAt is null [Then] it renders dash instead of epoch zero', () => {
    const output = formatToolLogsTable([makeToolLog(null)]);
    expect(output).toContain('tool_log_1');
    expect(output).not.toContain('1970-01-01T00:00:00.000Z');
  });
});

describe('formatToolLogInfo', () => {
  it('[Given] nullable app/connection/steps [Then] it renders fallback values', () => {
    const output = formatToolLogInfo(makeToolLogDetailed());
    const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('toolkit: -');
    expect(plain).toContain('Connection ID: -');
    expect(plain).toContain('Entity: -');
    expect(plain).toContain('Steps: 0');
  });
});
