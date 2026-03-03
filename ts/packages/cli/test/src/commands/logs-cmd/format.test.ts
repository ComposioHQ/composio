import type { Logs } from '@composio/client/resources/logs/logs';
import { describe, expect, it } from 'vitest';
import {
  formatTriggerLogInfo,
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
    const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('Start Time: -');
    expect(plain).toContain('End Time: -');
    expect(plain).not.toContain('1970-01-01T00:00:00.000Z');
  });
});

describe('formatTriggerLogInfo', () => {
  it('[Given] trigger detailed log [Then] it renders key fields', () => {
    const output = formatTriggerLogInfo({
      id: 'trigger_log_1',
      createdAt: 0,
      status: 'success',
      appName: 'gmail',
      meta: {
        triggerId: 'trigger_123',
        triggerNanoId: 'ti_123',
        triggerName: 'NEW_GMAIL_MESSAGE',
      },
      entityId: 'user_123',
      connectionId: 'conn_123',
    });

    expect(output).toContain('logId:');
    expect(output).toContain('trigger_log_1');
    expect(output).toContain('triggerId:');
    expect(output).toContain('trigger_123');
    expect(output).toContain('triggerNanoId:');
    expect(output).toContain('ti_123');
    expect(output).toContain('trigger:');
    expect(output).toContain('NEW_GMAIL_MESSAGE');
    expect(output).toContain('toolkit:');
    expect(output).toContain('gmail');
  });

  it('[Given] missing fields [Then] it renders fallback dashes', () => {
    const output = formatTriggerLogInfo({});
    const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('logId: -');
    expect(plain).toContain('triggerId: -');
    expect(plain).toContain('triggerNanoId: -');
    expect(plain).toContain('trigger: -');
    expect(plain).toContain('Created At: -');
  });

  it('[Given] retrieve response wrapped under log [Then] it unwraps and renders values', () => {
    const output = formatTriggerLogInfo({
      log: {
        id: 'log_QNzKGStH-ruD',
        status: 'info',
        appName: 'gmail',
        createdAt: '2026-02-25T22:01:22.865Z',
        entityId: 'pg-test-37ee710c-d5be-4775-91f2-a8e06b937d9b',
        connectionId: 'ca_zkX9njO68E8A',
        meta: {
          triggerId: '77ac1dbf-6db0-4039-8dbe-e903b3f2057e',
          triggerNanoId: 'ti_-nGUzD9N6JNf',
          triggerName: 'GMAIL_NEW_GMAIL_MESSAGE',
        },
      },
    });

    expect(output).toContain('log_QNzKGStH-ruD');
    expect(output).toContain('77ac1dbf-6db0-4039-8dbe-e903b3f2057e');
    expect(output).toContain('ti_-nGUzD9N6JNf');
    expect(output).toContain('GMAIL_NEW_GMAIL_MESSAGE');
    expect(output).toContain('gmail');
  });
});
