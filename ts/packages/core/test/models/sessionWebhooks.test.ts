import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import ComposioClient from '@composio/client';
import fixtures from '../../../../../python/tests/fixtures/webhook/session-hook-events.json';
import { Sessions } from '../../src/models/Sessions';
import { SessionWebhooks } from '../../src/models/SessionWebhooks';
import { ValidationError } from '../../src/errors/ValidationErrors';
import {
  ComposioWebhookPayloadError,
  ComposioWebhookSignatureVerificationError,
} from '../../src/errors/TriggerErrors';

const secret = 'session-webhook-secret';
const { id: webhookId, metadata } = fixtures.envelope;
const beforeToolCall = { ...fixtures.envelope, ...fixtures.events.beforeToolCall };
const { tool_call: toolCall } = beforeToolCall.data;

const now = () => String(Math.floor(Date.now() / 1000));

const sign = (timestamp: string, body: string | Uint8Array, withSecret = secret) => {
  const digest = createHmac('sha256', withSecret)
    .update(`${webhookId}.${timestamp}.`)
    .update(body)
    .digest('base64');
  return `v1,${digest}`;
};

const signedBody = (body: string | Uint8Array, timestamp = now()) => ({
  body,
  headers: {
    'webhook-id': webhookId,
    'webhook-timestamp': timestamp,
    'webhook-signature': sign(timestamp, body),
  },
});

const signed = (payload: unknown, timestamp = now()) =>
  signedBody(JSON.stringify(payload), timestamp);

describe('SessionWebhooks.parse', () => {
  const webhooks = new SessionWebhooks();

  it('is reachable at composio.sessions.webhooks', () => {
    const sessions = new Sessions({} as unknown as ComposioClient);
    expect(sessions.webhooks).toBeInstanceOf(SessionWebhooks);
  });

  it.each(Object.entries(fixtures.events))('returns the signed %s event', async (_, event) => {
    const payload = { ...fixtures.envelope, ...event };
    const { body, headers } = signedBody(new TextEncoder().encode(JSON.stringify(payload)));

    const hook = await webhooks.parse({
      body,
      headers: new Headers(headers),
      verifySecret: secret,
    });

    expect(hook).toEqual(payload);
  });

  it.each([
    { name: 'malformed JSON', body: 'invalid JSON' },
    { name: 'invalid UTF-8', body: Uint8Array.of(255) },
  ])('rejects signed $name with a sanitized payload error', async ({ body }) => {
    const parsed = webhooks.parse({ ...signedBody(body), verifySecret: secret });

    await expect(parsed).rejects.toThrow(ComposioWebhookPayloadError);
    await expect(parsed).rejects.toThrow('Failed to parse session webhook payload as JSON');
    await expect(parsed).rejects.not.toHaveProperty('cause');
  });

  it('keeps fields the SDK does not know yet', async () => {
    const payload = {
      ...beforeToolCall,
      data: { ...beforeToolCall.data, tool_call: { ...toolCall, added_later: true } },
    };

    const hook = await webhooks.parse({ ...signed(payload), verifySecret: secret });

    expect(hook).toEqual(payload);
  });

  it('accepts an event from an API version that sends no tool_call_id', async () => {
    const { tool_call_id: _toolCallId, ...olderMetadata } = metadata;
    const payload = { ...beforeToolCall, metadata: olderMetadata };

    const hook = await webhooks.parse({ ...signed(payload), verifySecret: secret });

    expect(hook).toEqual(payload);
  });

  it('accepts a request when any one of several signatures matches', async () => {
    const timestamp = now();
    const body = JSON.stringify(beforeToolCall);

    const hook = await webhooks.parse({
      body,
      headers: {
        'webhook-id': webhookId,
        'webhook-timestamp': timestamp,
        'webhook-signature': `${sign(timestamp, body, 'an-older-secret')} ${sign(timestamp, body)}`,
      },
      verifySecret: secret,
    });

    expect(hook.metadata.hook_id).toBe('check_outgoing_email');
  });

  it('rejects a request signed with a different secret', async () => {
    await expect(
      webhooks.parse({ ...signed(beforeToolCall), verifySecret: 'some-other-secret' })
    ).rejects.toThrow(ComposioWebhookSignatureVerificationError);
  });

  it('rejects a body that was changed after signing', async () => {
    const timestamp = now();
    const signature = sign(timestamp, JSON.stringify(beforeToolCall));
    const tampered = JSON.stringify({ ...beforeToolCall, metadata: { ...metadata, user_id: 'x' } });

    await expect(
      webhooks.parse({
        body: tampered,
        headers: {
          'webhook-id': webhookId,
          'webhook-timestamp': timestamp,
          'webhook-signature': signature,
        },
        verifySecret: secret,
      })
    ).rejects.toThrow(ComposioWebhookSignatureVerificationError);
  });

  it('rejects an old request, unless tolerance is 0', async () => {
    const tenMinutesAgo = String(Math.floor(Date.now() / 1000) - 600);

    await expect(
      webhooks.parse({ ...signed(beforeToolCall, tenMinutesAgo), verifySecret: secret })
    ).rejects.toThrow(ComposioWebhookSignatureVerificationError);

    const hook = await webhooks.parse({
      ...signed(beforeToolCall, tenMinutesAgo),
      verifySecret: secret,
      tolerance: 0,
    });
    expect(hook.id).toBe(webhookId);
  });

  it('refuses an empty secret instead of skipping verification', async () => {
    await expect(webhooks.parse({ ...signed(beforeToolCall), verifySecret: '' })).rejects.toThrow(
      ValidationError
    );
  });

  it('names the signature headers that are missing', async () => {
    await expect(
      webhooks.parse({
        body: JSON.stringify(beforeToolCall),
        headers: { 'webhook-id': webhookId },
        verifySecret: secret,
      })
    ).rejects.toThrow(/'webhook-timestamp', 'webhook-signature'/);
  });

  it('names an invalid field without its value', async () => {
    const payload = {
      ...beforeToolCall,
      data: {
        type: 'tool_execute',
        tool_call: { ...toolCall, arguments: 'a secret the agent typed' },
      },
    };

    const error = await webhooks
      .parse({ ...signed(payload), verifySecret: secret })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ComposioWebhookPayloadError);
    expect(String(error)).toContain('data.tool_call.arguments');
    expect(JSON.stringify(error)).not.toContain('a secret the agent typed');
  });

  it('rejects a signed payload that is not a session webhook event', async () => {
    const triggerEvent = {
      id: webhookId,
      type: 'composio.trigger.message',
      timestamp: '2026-11-20T12:00:00.000Z',
      metadata: {},
      data: {},
    };

    await expect(webhooks.parse({ ...signed(triggerEvent), verifySecret: secret })).rejects.toThrow(
      /not a session webhook event/
    );
  });
});
