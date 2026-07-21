import { describe, expect, it } from 'vitest';
import {
  decodeTriggerLogRecord,
  emptyTriggerLogRecord,
  parseMaybeJson,
} from 'src/commands/logs-cmd/trigger-log-record';

describe('decodeTriggerLogRecord', () => {
  it('[Given] camelCase-only payload [Then] resolves detail and table fields', () => {
    const record = decodeTriggerLogRecord({
      id: 'log_1',
      appName: 'gmail',
      status: 'success',
      createdAt: '2026-02-25T22:01:22.865Z',
      entityId: 'user_1',
      connectionId: 'conn_1',
      triggerId: 'trigger_1',
      triggerNanoId: 'ti_1',
      triggerName: 'NEW_GMAIL_MESSAGE',
    });

    expect(record.id).toBe('log_1');
    expect(record.appName).toBe('gmail');
    expect(record.detail.logId).toBe('log_1');
    expect(record.detail.triggerId).toBe('trigger_1');
    expect(record.detail.triggerNanoId).toBe('ti_1');
    expect(record.detail.triggerName).toBe('NEW_GMAIL_MESSAGE');
    expect(record.detail.status).toBe('success');
    expect(record.detail.toolkit).toBe('gmail');
    expect(record.detail.connectionId).toBe('conn_1');
    expect(record.detail.entityId).toBe('user_1');
    expect(record.detail.createdAt).toBe('2026-02-25T22:01:22.865Z');
    expect(record.table.triggerId).toBe('ti_1');
    expect(record.table.triggerName).toBe('NEW_GMAIL_MESSAGE');
  });

  it('[Given] snake_case-only payload [Then] resolves the same fields', () => {
    const record = decodeTriggerLogRecord({
      log_id: 'log_2',
      trigger_id: 'trigger_2',
      trigger_nano_id: 'ti_2',
      trigger_name: 'SLACK_NEW_MESSAGE',
      toolkit_key: 'slack',
      connection_id: 'conn_2',
      entity_id: 'user_2',
      created_at: 1750000000000,
    });

    expect(record.detail.logId).toBe('log_2');
    expect(record.detail.triggerId).toBe('trigger_2');
    expect(record.detail.triggerNanoId).toBe('ti_2');
    expect(record.detail.triggerName).toBe('SLACK_NEW_MESSAGE');
    expect(record.detail.toolkit).toBe('slack');
    expect(record.detail.connectionId).toBe('conn_2');
    expect(record.detail.entityId).toBe('user_2');
    expect(record.detail.createdAt).toBe(1750000000000);
    expect(record.table.triggerId).toBe('ti_2');
    expect(record.table.triggerName).toBe('SLACK_NEW_MESSAGE');
  });

  it('[Given] aliases at meta and top level [Then] detail prefers top level while table prefers meta', () => {
    const record = decodeTriggerLogRecord({
      triggerId: 'top_trigger',
      triggerName: 'TOP_NAME',
      meta: {
        triggerId: 'meta_trigger',
        triggerNanoId: 'ti_meta',
        triggerName: 'META_NAME',
      },
    });

    expect(record.detail.triggerId).toBe('top_trigger');
    expect(record.detail.triggerName).toBe('TOP_NAME');
    // Nano id under meta beats every plain trigger id in the table column.
    expect(record.table.triggerId).toBe('ti_meta');
    expect(record.table.triggerName).toBe('META_NAME');
  });

  it('[Given] meta-only aliases [Then] detail falls back to meta values', () => {
    const record = decodeTriggerLogRecord({
      meta: {
        id: 'meta_id',
        triggerId: 'meta_trigger',
        trigger_name: 'META_NAME',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });

    expect(record.detail.logId).toBe('meta_id');
    expect(record.detail.triggerId).toBe('meta_trigger');
    expect(record.detail.triggerName).toBe('META_NAME');
    expect(record.detail.createdAt).toBe('2026-01-01T00:00:00.000Z');
    // Top-level table columns stay untouched by meta values.
    expect(record.id).toBeUndefined();
  });

  it('[Given] retrieve response wrapped under log [Then] unwraps the nested record', () => {
    const record = decodeTriggerLogRecord({
      log: {
        id: 'log_QNzKGStH-ruD',
        appName: 'gmail',
        meta: { triggerNanoId: 'ti_-nGUzD9N6JNf' },
      },
    });

    expect(record.detail.logId).toBe('log_QNzKGStH-ruD');
    expect(record.detail.toolkit).toBe('gmail');
    expect(record.table.triggerId).toBe('ti_-nGUzD9N6JNf');
  });

  it('[Given] payload JSON strings in meta [Then] parses provider payload first', () => {
    const record = decodeTriggerLogRecord({
      meta: {
        triggerProviderPayload: '{"foo":"bar","count":2}',
        triggerClientPayload: '{"ignored":true}',
      },
    });

    expect(record.payload).toEqual({ foo: 'bar', count: 2 });
  });

  it('[Given] response JSON string in meta [Then] parses client response first', () => {
    const record = decodeTriggerLogRecord({
      meta: {
        triggerClientResponse: '{"status":"CANCELED"}',
        triggerProviderResponse: '{"ignored":true}',
      },
    });

    expect(record.response).toEqual({ status: 'CANCELED' });
  });

  it('[Given] top-level payloadReceived [Then] uses it when meta has no payload', () => {
    const record = decodeTriggerLogRecord({
      payloadReceived: '{"a":1}',
      payload: '{"b":2}',
    });

    expect(record.payload).toEqual({ a: 1 });
  });

  it('[Given] non-JSON payload string [Then] keeps the original string', () => {
    const record = decodeTriggerLogRecord({
      meta: { triggerProviderPayload: 'not-json' },
    });

    expect(record.payload).toBe('not-json');
  });

  it('[Given] wrongly-typed fields [Then] treats them as absent instead of failing', () => {
    const record = decodeTriggerLogRecord({
      id: 42,
      triggerName: ['nope'],
      meta: { triggerName: 'META_NAME' },
    });

    expect(record.id).toBeUndefined();
    expect(record.detail.triggerName).toBe('META_NAME');
  });

  it('[Given] garbage payload [Then] falls back to the empty record', () => {
    expect(decodeTriggerLogRecord(null)).toEqual(emptyTriggerLogRecord);
    expect(decodeTriggerLogRecord('garbage')).toEqual(emptyTriggerLogRecord);
    expect(emptyTriggerLogRecord.detail.logId).toBeUndefined();
    expect(emptyTriggerLogRecord.payload).toBeNull();
    expect(emptyTriggerLogRecord.response).toBeNull();
  });
});

describe('parseMaybeJson', () => {
  it('[Given] non-JSON string [Then] returns the original value', () => {
    expect(parseMaybeJson('not-json')).toBe('not-json');
  });

  it('[Given] JSON object string [Then] parses it', () => {
    expect(parseMaybeJson('{"foo":"bar"}')).toEqual({ foo: 'bar' });
  });

  it('[Given] malformed JSON-looking string [Then] returns the original value', () => {
    expect(parseMaybeJson('{oops}')).toBe('{oops}');
  });
});
