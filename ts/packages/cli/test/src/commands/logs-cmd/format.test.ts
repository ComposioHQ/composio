import type { Logs } from '@composio/client/resources/logs/logs';
import { describe, expect, it } from 'vitest';
import {
  formatToolLogInfo,
  formatToolLogsTable,
  formatTriggerLogsTable,
} from 'src/commands/logs-cmd/format';
import { green, red } from 'src/ui/colors';

type TriggerLog = Logs.TriggerListResponse.Data;
type ToolLog = Logs.ToolListResponse.Data;
type ToolLogDetailed = Logs.ToolRetrieveResponse;

const makeTriggerLog = (createdAt: TriggerLog['createdAt'] | number): TriggerLog =>
  ({
    id: 'trigger_log_1',
    clientId: 'client_1',
    type: 'trigger',
    createdAt: createdAt as TriggerLog['createdAt'],
    status: 'success',
    appName: 'gmail',
    meta: {
      triggerId: 'trigger_123',
      triggerNanoId: 'ti_123',
      triggerName: 'NEW_GMAIL_MESSAGE',
    },
    entityId: 'entity_123',
    connectionId: 'conn_123',
  }) as unknown as TriggerLog;

const makeToolLog = (
  createdAt: ToolLog['createdAt'] | null,
  overrides: {
    status?: string;
    connectedAccountId?: string | null;
  } = {}
): ToolLog =>
  ({
    id: 'tool_log_1',
    createdAt,
    status: overrides.status ?? 'success',
    app: { name: 'gmail' },
    actionKey: 'GMAIL_SEND_EMAIL',
    executionTime: 20,
    connectedAccountId:
      overrides.connectedAccountId === undefined ? 'conn_123' : overrides.connectedAccountId,
  }) as ToolLog;

const makeToolLogDetailed = (
  overrides: Partial<{ startTime: number | null; endTime: number | null }> = {}
): ToolLogDetailed =>
  ({
    actionLogId: 'tool_log_1',
    actionId: 'GMAIL_SEND_EMAIL',
    status: 'success',
    app: null,
    connection: null,
    startTime: overrides.startTime === undefined ? 0 : overrides.startTime,
    endTime: overrides.endTime === undefined ? 0 : overrides.endTime,
    totalDuration: '20ms',
    version: '20260101_00',
    steps: null,
  }) as unknown as ToolLogDetailed;

describe('formatTriggerLogsTable', () => {
  it('[Given] createdAt is epoch number [Then] it formats without crashing', () => {
    const output = formatTriggerLogsTable([makeTriggerLog(0)]);
    expect(output).toContain('1970-01-01T00:00:00.000Z');
    expect(output).toContain('ti_123');
    expect(output).toContain('NEW_GMAIL_MESSAGE');
  });

  it('[Given] createdAt is string [Then] it preserves previous behavior', () => {
    const output = formatTriggerLogsTable([makeTriggerLog('2026-02-24T12:34:56.000Z')]);
    expect(output).toContain('2026-02-24T12:34:56.000Z');
  });

  it('[Given] rendering table [Then] it uses Trigger Id and Toolkit headers', () => {
    const output = stripAnsi(formatTriggerLogsTable([makeTriggerLog(0)]));
    const [headerLine] = output.split('\n');

    expect(headerLine).toContain('Log Id');
    expect(headerLine).toContain('Trigger Id');
    expect(headerLine).toContain('Toolkit');
    expect(headerLine).toContain('Trigger');
    expect(headerLine).toContain('User Id');
    expect(headerLine).toContain('Connected Account Id');
    expect(headerLine).not.toContain('Status');
    expect(headerLine).not.toContain('App');
  });
});

describe('formatToolLogsTable', () => {
  it('[Given] createdAt is null [Then] it renders dash instead of epoch zero', () => {
    const output = formatToolLogsTable([makeToolLog(null)]);
    expect(output).toContain('tool_log_1');
    expect(output).not.toContain('1970-01-01T00:00:00.000Z');
  });

  it('[Given] rendering table [Then] it shows Created At before Log Id', () => {
    const output = stripAnsi(formatToolLogsTable([makeToolLog(0)]));
    const [headerLine] = output.split('\n');

    expect(headerLine.indexOf('Created At')).toBeLessThan(headerLine.indexOf('Log Id'));
  });

  it('[Given] rendering table [Then] it uses Toolkit and Tool headers', () => {
    const output = stripAnsi(formatToolLogsTable([makeToolLog(0)]));
    const [headerLine] = output.split('\n');

    expect(headerLine).toContain('Toolkit');
    expect(headerLine).toContain('Tool');
    expect(headerLine).not.toContain('App');
    expect(headerLine).not.toContain('Action');
  });

  it('[Given] success and failure statuses [Then] it colors them green and red', () => {
    const output = formatToolLogsTable([
      makeToolLog(0, { status: 'success' }),
      makeToolLog(0, { status: 'failed' }),
    ]);

    expect(output).toContain(green('success '.padEnd(8)));
    expect(output).toContain(red('failed  '.padEnd(8)));
  });

  it('[Given] null connected account [Then] it renders dash', () => {
    const output = stripAnsi(formatToolLogsTable([makeToolLog(0, { connectedAccountId: null })]));
    const [, rowLine] = output.split('\n');

    expect(rowLine).toMatch(/\s-\s*$/);
  });
});

const stripAnsi = (value: string): string => value.replace(/\u001B\[[0-9;]*m/g, '');

describe('formatToolLogInfo', () => {
  it('[Given] nullable app/connection/steps [Then] it renders fallback values', () => {
    const output = formatToolLogInfo(makeToolLogDetailed());
    const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('toolkit: -');
    expect(plain).toContain('Connection ID: -');
    expect(plain).toContain('Entity: -');
    expect(plain).toContain('Steps: 0');
  });

  it('[Given] null start/end time [Then] it renders dashes for timestamps', () => {
    const output = formatToolLogInfo(makeToolLogDetailed({ startTime: null, endTime: null }));
    expect(output).toContain('Start Time: -');
    expect(output).toContain('End Time: -');
    expect(output).not.toContain('1970-01-01T00:00:00.000Z');
  });
});
