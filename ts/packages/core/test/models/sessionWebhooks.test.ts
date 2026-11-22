import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import ComposioClient from '@composio/client';
import { Sessions } from '../../src/models/Sessions';
import { SessionWebhooks } from '../../src/models/SessionWebhooks';
import { ValidationError } from '../../src/errors/ValidationErrors';
import {
  ComposioWebhookPayloadError,
  ComposioWebhookSignatureVerificationError,
} from '../../src/errors/TriggerErrors';

const secret = 'session-webhook-secret';
const webhookId = 'msg_3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90';

const metadata = {
  project_id: 'pr_123',
  session_id: 'trs_123',
  user_id: 'user_123',
  hook_id: 'check_outgoing_email',
};

const toolCall = {
  toolkit_slug: 'gmail',
  tool_slug: 'GMAIL_SEND_EMAIL',
  toolkit_version: '20261101_00',
  connected_account_id: 'ca_123',
  arguments: { recipient_email: 'jane@customer.com' },
};

const beforeToolCall = {
  id: webhookId,
  type: 'composio.session_hook.before_execute',
  timestamp: '2026-11-20T12:00:00.000Z',
  metadata,
  data: { type: 'tool_execute', tool_call: toolCall },
};

const afterProxyCall = {
  id: webhookId,
  type: 'composio.session_hook.after_execute',
  timestamp: '2026-11-20T12:00:00.000Z',
  metadata,
  data: {
    type: 'proxy_execute',
    http_request: {
      toolkit_slug: 'github',
      method: 'GET',
      endpoint: '/user/repos',
      parameters: [{ name: 'per_page', value: '10', type: 'query' }],
    },
    http_response: {
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: [{ name: 'composio' }],
    },
  },
};

const now = () => String(Math.floor(Date.now() / 1000));

// The signature Composio sends: v1,<base64 HMAC-SHA256(secret, `${id}.${timestamp}.${body}`)>
const sign = (timestamp: string, body: string, withSecret = secret) =>
  `v1,${createHmac('sha256', withSecret).update(`${webhookId}.${timestamp}.${body}`).digest('base64')}`;

const signedRequest = (payload: unknown, timestamp = now()) => {
  const body = JSON.stringify(payload);
  return new Request('https://example.com/composio/session-webhook', {
    method: 'POST',
    headers: {
      'webhook-id': webhookId,
      'webhook-timestamp': timestamp,
      'webhook-signature': sign(timestamp, body),
    },
    body,
  });
};

describe('SessionWebhooks.parse', () => {
  const webhooks = new SessionWebhooks();

  it('is reachable at composio.sessions.webhooks', () => {
    const sessions = new Sessions({} as unknown as ComposioClient);
    expect(sessions.webhooks).toBeInstanceOf(SessionWebhooks);
  });

  it('returns a verified before_execute tool call as Composio sent it', async () => {
    const hook = await webhooks.parse(signedRequest(beforeToolCall), { verifySecret: secret });

    expect(hook).toEqual(beforeToolCall);
  });

  it('returns a verified after_execute proxy call from an Express-style request', async () => {
    const timestamp = now();
    const body = JSON.stringify(afterProxyCall);

    const hook = await webhooks.parse(
      {
        body: new TextEncoder().encode(body),
        headers: {
          'Webhook-Id': webhookId,
          'Webhook-Timestamp': timestamp,
          'Webhook-Signature': sign(timestamp, body),
        },
      },
      { verifySecret: secret }
    );

    expect(hook).toEqual(afterProxyCall);
  });

  it('keeps fields the SDK does not know yet', async () => {
    const payload = {
      ...beforeToolCall,
      data: { ...beforeToolCall.data, tool_call: { ...toolCall, added_later: true } },
    };

    const hook = await webhooks.parse(signedRequest(payload), { verifySecret: secret });

    expect(hook).toEqual(payload);
  });

  it('accepts a request when any one of several signatures matches', async () => {
    const timestamp = now();
    const body = JSON.stringify(beforeToolCall);

    const hook = await webhooks.parse(
      {
        body,
        headers: {
          'webhook-id': webhookId,
          'webhook-timestamp': timestamp,
          'webhook-signature': `${sign(timestamp, body, 'an-older-secret')} ${sign(timestamp, body)}`,
        },
      },
      { verifySecret: secret }
    );

    expect(hook.metadata.hook_id).toBe('check_outgoing_email');
  });

  it('rejects a request signed with a different secret', async () => {
    await expect(
      webhooks.parse(signedRequest(beforeToolCall), { verifySecret: 'some-other-secret' })
    ).rejects.toThrow(ComposioWebhookSignatureVerificationError);
  });

  it('rejects a body that was changed after signing', async () => {
    const timestamp = now();
    const signature = sign(timestamp, JSON.stringify(beforeToolCall));
    const tampered = JSON.stringify({ ...beforeToolCall, metadata: { ...metadata, user_id: 'x' } });

    await expect(
      webhooks.parse(
        {
          body: tampered,
          headers: {
            'webhook-id': webhookId,
            'webhook-timestamp': timestamp,
            'webhook-signature': signature,
          },
        },
        { verifySecret: secret }
      )
    ).rejects.toThrow(ComposioWebhookSignatureVerificationError);
  });

  it('rejects an old request, unless tolerance is 0', async () => {
    const tenMinutesAgo = String(Math.floor(Date.now() / 1000) - 600);

    await expect(
      webhooks.parse(signedRequest(beforeToolCall, tenMinutesAgo), { verifySecret: secret })
    ).rejects.toThrow(ComposioWebhookSignatureVerificationError);

    const hook = await webhooks.parse(signedRequest(beforeToolCall, tenMinutesAgo), {
      verifySecret: secret,
      tolerance: 0,
    });
    expect(hook.id).toBe(webhookId);
  });

  it('refuses an empty secret instead of skipping verification', async () => {
    await expect(
      webhooks.parse(signedRequest(beforeToolCall), { verifySecret: '' })
    ).rejects.toThrow(ValidationError);
  });

  it('names the signature headers that are missing', async () => {
    await expect(
      webhooks.parse(
        { body: JSON.stringify(beforeToolCall), headers: { 'webhook-id': webhookId } },
        { verifySecret: secret }
      )
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
      .parse(signedRequest(payload), { verifySecret: secret })
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

    await expect(
      webhooks.parse(signedRequest(triggerEvent), { verifySecret: secret })
    ).rejects.toThrow(/not a session webhook event/);
  });
});
