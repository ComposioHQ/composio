import type { Logs } from '@composio/client/resources/logs/logs';
import { describe, expect, it } from 'vitest';
import { formatTriggerLogsTable } from 'src/commands/logs-cmd/format';

type TriggerLog = Logs.TriggerListResponse.Data;

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
