import { describe, expect, it } from 'vitest';
import {
  getTriggerLogRecord,
  getTriggerPayload,
  getTriggerResponse,
  parseMaybeJson,
} from 'src/commands/logs-cmd/commands/logs.triggers.cmd';

describe('logs triggers detail helpers', () => {
  it('[Given] retrieve response wrapper [Then] unwraps nested log record', () => {
    const wrapped = {
      log: {
        id: 'log_123',
        meta: { triggerId: 'trigger_123' },
      },
    } as Record<string, unknown>;

    expect(getTriggerLogRecord(wrapped)).toEqual({
      id: 'log_123',
      meta: { triggerId: 'trigger_123' },
    });
  });

  it('[Given] trigger payload in meta JSON string [Then] parses it to object', () => {
    const payload = getTriggerPayload({
      meta: {
        triggerProviderPayload: '{"foo":"bar","count":2}',
      },
    });

    expect(payload).toEqual({ foo: 'bar', count: 2 });
  });

  it('[Given] trigger response in meta JSON string [Then] parses it to object', () => {
    const response = getTriggerResponse({
      meta: {
        triggerClientResponse: '{"status":"CANCELED"}',
      },
    });

    expect(response).toEqual({ status: 'CANCELED' });
  });

  it('[Given] non-JSON string [Then] parseMaybeJson returns original value', () => {
    expect(parseMaybeJson('not-json')).toBe('not-json');
  });
});
