import * as crypto from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Triggers } from '../../src/models/Triggers';
import ComposioClient from '@composio/client';
import {
  WebhookPayloadV1,
  WebhookPayloadV2,
  WebhookPayloadV3,
  WebhookVersions,
} from '../../src/types/triggers.types';
import { ValidationError } from '../../src/errors';
import {
  ComposioWebhookSignatureVerificationError,
  ComposioWebhookPayloadError,
} from '../../src/errors/TriggerErrors';

// Mock dependencies
vi.mock('../../src/utils/logger');
vi.mock('../../src/telemetry/Telemetry', () => ({
  telemetry: {
    instrument: vi.fn(),
  },
}));
vi.mock('../../src/services/pusher/Pusher');

// Create mock client
const createMockClient = () => ({
  baseURL: 'https://api.composio.dev',
  apiKey: 'test-api-key',
  triggerInstances: {
    listActive: vi.fn(),
    upsert: vi.fn(),
    manage: {
      delete: vi.fn(),
      update: vi.fn(),
    },
  },
  triggersTypes: {
    list: vi.fn(),
    retrieve: vi.fn(),
    retrieveEnum: vi.fn(),
  },
  connectedAccounts: {
    list: vi.fn(),
  },
});

/**
 * Helper to create a valid webhook signature in the format used by Composio.
 * Format: v1,base64(HMAC-SHA256(msgId.timestamp.payload, secret))
 */
const createSignature = (
  webhookId: string,
  webhookTimestamp: string,
  payload: string,
  secret: string
): string => {
  const toSign = `${webhookId}.${webhookTimestamp}.${payload}`;
  const signature = crypto.createHmac('sha256', secret).update(toSign, 'utf8').digest('base64');
  return `v1,${signature}`;
};

// Mock V1 webhook payload
const createMockV1Payload = (overrides: Partial<WebhookPayloadV1> = {}): WebhookPayloadV1 => ({
  trigger_name: 'GITHUB_PUSH_EVENT',
  connection_id: 'conn-123',
  trigger_id: 'trigger-123',
  payload: { action: 'push', repository: 'test-repo' },
  log_id: 'log-123',
  ...overrides,
});

// Mock V2 webhook payload
const createMockV2Payload = (overrides: Partial<WebhookPayloadV2> = {}): WebhookPayloadV2 => ({
  type: 'github_push_event',
  timestamp: new Date().toISOString(),
  log_id: 'log-123',
  data: {
    connection_id: 'conn-123',
    connection_nano_id: 'conn-nano-123',
    trigger_nano_id: 'trigger-nano-123',
    trigger_id: 'trigger-123',
    user_id: 'user-456',
    action: 'push',
    repository: 'test-repo',
  },
  ...overrides,
});

// Mock V3 webhook payload
const createMockV3Payload = (overrides: Partial<WebhookPayloadV3> = {}): WebhookPayloadV3 => ({
  id: 'msg_abc123',
  timestamp: new Date().toISOString(),
  type: 'composio.trigger.message',
  metadata: {
    log_id: 'log-123',
    trigger_slug: 'GITHUB_PUSH_EVENT',
    trigger_id: 'trigger-nano-123',
    connected_account_id: 'conn-nano-123',
    auth_config_id: 'auth-nano-123',
    user_id: 'user-456',
  },
  data: { action: 'push', repository: 'test-repo' },
  ...overrides,
});

describe('Triggers.verifyWebhook', () => {
  let triggers: Triggers<any>;
  let mockClient: ReturnType<typeof createMockClient>;
  const testSecret = 'test-webhook-secret-12345';
  const testWebhookId = 'msg_test123';
  const testTimestamp = Math.floor(Date.now() / 1000).toString();

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    triggers = new Triggers(mockClient as unknown as ComposioClient);
  });

  describe('successful verification with V3 payload', () => {
    it('should verify a valid V3 webhook payload and signature', async () => {
      const v3Payload = createMockV3Payload();
      const payloadStr = JSON.stringify(v3Payload);
      const signature = createSignature(testWebhookId, testTimestamp, payloadStr, testSecret);

      const result = await triggers.verifyWebhook({
        payload: payloadStr,
        signature,
        secret: testSecret,
        id: testWebhookId,
        timestamp: testTimestamp,
      });

      expect(result).toBeDefined();
      expect(result.version).toBe(WebhookVersions.V3);
      expect(result.payload.triggerSlug).toBe('GITHUB_PUSH_EVENT');
      expect(result.payload.userId).toBe('user-456');
      expect(result.rawPayload).toEqual(v3Payload);
    });

    it('should correctly normalize V3 payload to IncomingTriggerPayload format', async () => {
      const v3Payload = createMockV3Payload();
      const payloadStr = JSON.stringify(v3Payload);
      const signature = createSignature(testWebhookId, testTimestamp, payloadStr, testSecret);

      const result = await triggers.verifyWebhook({
        payload: payloadStr,
        signature,
        secret: testSecret,
        id: testWebhookId,
        timestamp: testTimestamp,
      });

      expect(result.payload.metadata.connectedAccount).toEqual({
        id: 'conn-nano-123',
        uuid: 'conn-nano-123',
        authConfigId: 'auth-nano-123',
        authConfigUUID: 'auth-nano-123',
        userId: 'user-456',
        status: 'ACTIVE',
      });
    });

    it('should detect V3 payload with non-trigger event type (e.g., connected_account.expired)', async () => {
      // This test uses realistic connection metadata (project_id, org_id)
      // instead of fabricated trigger metadata, verifying that V3 detection
      // works for events with different metadata shapes.
      const payload = {
        id: 'msg_abc123',
        timestamp: new Date().toISOString(),
        type: 'composio.connected_account.expired',
        metadata: {
          project_id: 'pr_koucdrMIwRsf',
          org_id: '4a4ded8f-d3ae-4dea-a229-c30234298b05',
        },
        data: {
          toolkit: { slug: 'gmail' },
          id: 'ca__IvSeEzEBjVt',
          user_id: 'test-user',
          status: 'EXPIRED',
        },
      };
      const payloadStr = JSON.stringify(payload);
      const signature = createSignature(testWebhookId, testTimestamp, payloadStr, testSecret);

      const result = await triggers.verifyWebhook({
        payload: payloadStr,
        signature,
        secret: testSecret,
        id: testWebhookId,
        timestamp: testTimestamp,
      });

      expect(result.version).toBe(WebhookVersions.V3);
      expect(result.rawPayload).toEqual(payload);
    });
  });

  describe('successful verification with V2 payload', () => {
    it('should verify a valid V2 webhook payload and signature', async () => {
      const v2Payload = createMockV2Payload();
      const payloadStr = JSON.stringify(v2Payload);
      const signature = createSignature(testWebhookId, testTimestamp, payloadStr, testSecret);

      const result = await triggers.verifyWebhook({
        payload: payloadStr,
        signature,
        secret: testSecret,
        id: testWebhookId,
        timestamp: testTimestamp,
      });

      expect(result).toBeDefined();
      expect(result.version).toBe(WebhookVersions.V2);
      expect(result.payload.triggerSlug).toBe('GITHUB_PUSH_EVENT');
      expect(result.payload.userId).toBe('user-456');
    });
  });

  describe('successful verification with V1 payload', () => {
    it('should verify a valid V1 webhook payload and signature', async () => {
      const v1Payload = createMockV1Payload();
      const payloadStr = JSON.stringify(v1Payload);
      const signature = createSignature(testWebhookId, testTimestamp, payloadStr, testSecret);

      const result = await triggers.verifyWebhook({
        payload: payloadStr,
        signature,
        secret: testSecret,
        id: testWebhookId,
        timestamp: testTimestamp,
      });

      expect(result).toBeDefined();
      expect(result.version).toBe(WebhookVersions.V1);
      expect(result.payload.triggerSlug).toBe('GITHUB_PUSH_EVENT');
      expect(result.payload.id).toBe('trigger-123');
    });
  });

  describe('tolerance settings', () => {
    it('should verify webhook with tolerance set to 0 (skip timestamp validation)', async () => {
      const v3Payload = createMockV3Payload();
      const payloadStr = JSON.stringify(v3Payload);
      // Use an old timestamp
      const oldTimestamp = Math.floor((Date.now() - 60 * 60 * 1000) / 1000).toString();
      const signature = createSignature(testWebhookId, oldTimestamp, payloadStr, testSecret);

      const result = await triggers.verifyWebhook({
        payload: payloadStr,
        signature,
        secret: testSecret,
        id: testWebhookId,
        timestamp: oldTimestamp,
        tolerance: 0,
      });

      expect(result).toBeDefined();
      expect(result.version).toBe(WebhookVersions.V3);
    });

    it('should verify webhook with custom tolerance', async () => {
      const v3Payload = createMockV3Payload();
      const payloadStr = JSON.stringify(v3Payload);
      const signature = createSignature(testWebhookId, testTimestamp, payloadStr, testSecret);

      const result = await triggers.verifyWebhook({
        payload: payloadStr,
        signature,
        secret: testSecret,
        id: testWebhookId,
        timestamp: testTimestamp,
        tolerance: 600, // 10 minutes
      });

      expect(result).toBeDefined();
    });
  });

  describe('signature verification errors', () => {
    it('should throw error when payload is empty', async () => {
      await expect(() =>
        triggers.verifyWebhook({
          payload: '',
          signature: 'v1,somesignature',
          secret: testSecret,
          id: testWebhookId,
          timestamp: testTimestamp,
        })
      ).rejects.toThrow(ComposioWebhookSignatureVerificationError);

      await expect(() =>
        triggers.verifyWebhook({
          payload: '',
          signature: 'v1,somesignature',
          secret: testSecret,
          id: testWebhookId,
          timestamp: testTimestamp,
        })
      ).rejects.toThrow('No webhook payload was provided.');
    });

    it('should throw error when signature is empty', async () => {
      const payloadStr = JSON.stringify(createMockV3Payload());

      await expect(() =>
        triggers.verifyWebhook({
          payload: payloadStr,
          signature: '',
          secret: testSecret,
          id: testWebhookId,
          timestamp: testTimestamp,
        })
      ).rejects.toThrow(ComposioWebhookSignatureVerificationError);

      await expect(() =>
        triggers.verifyWebhook({
          payload: payloadStr,
          signature: '',
          secret: testSecret,
          id: testWebhookId,
          timestamp: testTimestamp,
        })
      ).rejects.toThrow('No signature header value was provided.');
    });

    it('should throw error when secret is empty', async () => {
      const payloadStr = JSON.stringify(createMockV3Payload());

      await expect(() =>
        triggers.verifyWebhook({
          payload: payloadStr,
          signature: 'v1,somesignature',
          secret: '',
          id: testWebhookId,
          timestamp: testTimestamp,
        })
      ).rejects.toThrow(ComposioWebhookSignatureVerificationError);

      await expect(() =>
        triggers.verifyWebhook({
          payload: payloadStr,
          signature: 'v1,somesignature',
          secret: '',
          id: testWebhookId,
          timestamp: testTimestamp,
        })
      ).rejects.toThrow('No webhook secret was provided.');
    });

    it('should throw error when webhookId is empty', async () => {
      const payloadStr = JSON.stringify(createMockV3Payload());

      await expect(() =>
        triggers.verifyWebhook({
          payload: payloadStr,
          signature: 'v1,somesignature',
          secret: testSecret,
          id: '',
          timestamp: testTimestamp,
        })
      ).rejects.toThrow(ComposioWebhookSignatureVerificationError);

      await expect(() =>
        triggers.verifyWebhook({
          payload: payloadStr,
          signature: 'v1,somesignature',
          secret: testSecret,
          id: '',
          timestamp: testTimestamp,
        })
      ).rejects.toThrow('No webhook ID was provided.');
    });

    it('should throw error when webhookTimestamp is empty', async () => {
      const payloadStr = JSON.stringify(createMockV3Payload());

      // Empty timestamp is treated as invalid timestamp format (parseInt('') = NaN)
      await expect(() =>
        triggers.verifyWebhook({
          payload: payloadStr,
          signature: 'v1,somesignature',
          secret: testSecret,
          id: testWebhookId,
          timestamp: '',
        })
      ).rejects.toThrow(ComposioWebhookPayloadError);

      await expect(() =>
        triggers.verifyWebhook({
          payload: payloadStr,
          signature: 'v1,somesignature',
          secret: testSecret,
          id: testWebhookId,
          timestamp: '',
        })
      ).rejects.toThrow('Invalid webhook timestamp');
    });

    it('should throw error when signature format is invalid (no v1 prefix)', async () => {
      const payloadStr = JSON.stringify(createMockV3Payload());

      await expect(() =>
        triggers.verifyWebhook({
          payload: payloadStr,
          signature: 'invalid-signature-no-prefix',
          secret: testSecret,
          id: testWebhookId,
          timestamp: testTimestamp,
        })
      ).rejects.toThrow(ComposioWebhookSignatureVerificationError);

      await expect(() =>
        triggers.verifyWebhook({
          payload: payloadStr,
          signature: 'invalid-signature-no-prefix',
          secret: testSecret,
          id: testWebhookId,
          timestamp: testTimestamp,
        })
      ).rejects.toThrow('No valid v1 signature found');
    });

    it('should throw error when signature is invalid', async () => {
      const payloadStr = JSON.stringify(createMockV3Payload());

      await expect(() =>
        triggers.verifyWebhook({
          payload: payloadStr,
          signature: 'v1,invalidbase64signature==',
          secret: testSecret,
          id: testWebhookId,
          timestamp: testTimestamp,
        })
      ).rejects.toThrow(ComposioWebhookSignatureVerificationError);

      await expect(() =>
        triggers.verifyWebhook({
          payload: payloadStr,
          signature: 'v1,invalidbase64signature==',
          secret: testSecret,
          id: testWebhookId,
          timestamp: testTimestamp,
        })
      ).rejects.toThrow('The signature provided is invalid.');
    });

    it('should throw error when signature was created with different secret', async () => {
      const payloadStr = JSON.stringify(createMockV3Payload());
      const signatureWithDifferentSecret = createSignature(
        testWebhookId,
        testTimestamp,
        payloadStr,
        'different-secret'
      );

      await expect(() =>
        triggers.verifyWebhook({
          payload: payloadStr,
          signature: signatureWithDifferentSecret,
          secret: testSecret,
          id: testWebhookId,
          timestamp: testTimestamp,
        })
      ).rejects.toThrow(ComposioWebhookSignatureVerificationError);
    });

    it('should throw error when payload was modified after signing', async () => {
      const originalPayload = createMockV3Payload();
      const payloadStr = JSON.stringify(originalPayload);
      const signature = createSignature(testWebhookId, testTimestamp, payloadStr, testSecret);

      const modifiedPayload = JSON.stringify({
        ...originalPayload,
        data: { modified: true },
      });

      await expect(() =>
        triggers.verifyWebhook({
          payload: modifiedPayload,
          signature,
          secret: testSecret,
          id: testWebhookId,
          timestamp: testTimestamp,
        })
      ).rejects.toThrow(ComposioWebhookSignatureVerificationError);
    });
  });

  describe('payload parsing errors', () => {
    it('should throw error when payload is not valid JSON', async () => {
      const invalidJson = 'not-valid-json{';
      const signature = createSignature(testWebhookId, testTimestamp, invalidJson, testSecret);

      await expect(() =>
        triggers.verifyWebhook({
          payload: invalidJson,
          signature,
          secret: testSecret,
          id: testWebhookId,
          timestamp: testTimestamp,
        })
      ).rejects.toThrow(ComposioWebhookPayloadError);

      await expect(() =>
        triggers.verifyWebhook({
          payload: invalidJson,
          signature,
          secret: testSecret,
          id: testWebhookId,
          timestamp: testTimestamp,
        })
      ).rejects.toThrow('Failed to parse webhook payload as JSON');
    });

    it('should throw error for unrecognized payload format', async () => {
      const unknownPayload = JSON.stringify({ unknown: 'format' });
      const signature = createSignature(testWebhookId, testTimestamp, unknownPayload, testSecret);

      await expect(() =>
        triggers.verifyWebhook({
          payload: unknownPayload,
          signature,
          secret: testSecret,
          id: testWebhookId,
          timestamp: testTimestamp,
        })
      ).rejects.toThrow(ComposioWebhookPayloadError);

      await expect(() =>
        triggers.verifyWebhook({
          payload: unknownPayload,
          signature,
          secret: testSecret,
          id: testWebhookId,
          timestamp: testTimestamp,
        })
      ).rejects.toThrow('does not match any known version');
    });

    it('should include detailed schema errors when payload does not match any version', async () => {
      const invalidPayload = JSON.stringify({ invalid: 'data' });
      const signature = createSignature(testWebhookId, testTimestamp, invalidPayload, testSecret);

      try {
        await triggers.verifyWebhook({
          payload: invalidPayload,
          signature,
          secret: testSecret,
          id: testWebhookId,
          timestamp: testTimestamp,
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ComposioWebhookPayloadError);
        const webhookError = error as ComposioWebhookPayloadError;
        expect(webhookError.cause).toBeDefined();
        // The cause should contain v1Error, v2Error, and v3Error with schema validation messages
        expect((webhookError.cause as any).v1Error).toBeDefined();
        expect((webhookError.cause as any).v2Error).toBeDefined();
        expect((webhookError.cause as any).v3Error).toBeDefined();
      }
    });
  });

  describe('timestamp validation', () => {
    it('should pass when webhook timestamp is within tolerance', async () => {
      const v3Payload = createMockV3Payload();
      const payloadStr = JSON.stringify(v3Payload);
      const recentTimestamp = Math.floor(Date.now() / 1000).toString();
      const signature = createSignature(testWebhookId, recentTimestamp, payloadStr, testSecret);

      const result = await triggers.verifyWebhook({
        payload: payloadStr,
        signature,
        secret: testSecret,
        id: testWebhookId,
        timestamp: recentTimestamp,
        tolerance: 300,
      });

      expect(result).toBeDefined();
    });

    it('should throw error when webhook timestamp is outside tolerance', async () => {
      const v3Payload = createMockV3Payload();
      const payloadStr = JSON.stringify(v3Payload);
      // 10 minutes ago
      const oldTimestamp = Math.floor((Date.now() - 10 * 60 * 1000) / 1000).toString();
      const signature = createSignature(testWebhookId, oldTimestamp, payloadStr, testSecret);

      await expect(() =>
        triggers.verifyWebhook({
          payload: payloadStr,
          signature,
          secret: testSecret,
          id: testWebhookId,
          timestamp: oldTimestamp,
          tolerance: 300, // 5 minutes
        })
      ).rejects.toThrow(ComposioWebhookSignatureVerificationError);

      await expect(() =>
        triggers.verifyWebhook({
          payload: payloadStr,
          signature,
          secret: testSecret,
          id: testWebhookId,
          timestamp: oldTimestamp,
          tolerance: 300,
        })
      ).rejects.toThrow('The webhook timestamp is outside the allowed tolerance');
    });

    it('should throw error for invalid timestamp format', async () => {
      const v3Payload = createMockV3Payload();
      const payloadStr = JSON.stringify(v3Payload);
      const invalidTimestamp = 'not-a-timestamp';
      const signature = createSignature(testWebhookId, invalidTimestamp, payloadStr, testSecret);

      await expect(() =>
        triggers.verifyWebhook({
          payload: payloadStr,
          signature,
          secret: testSecret,
          id: testWebhookId,
          timestamp: invalidTimestamp,
          tolerance: 300,
        })
      ).rejects.toThrow(ComposioWebhookPayloadError);

      await expect(() =>
        triggers.verifyWebhook({
          payload: payloadStr,
          signature,
          secret: testSecret,
          id: testWebhookId,
          timestamp: invalidTimestamp,
          tolerance: 300,
        })
      ).rejects.toThrow('Invalid webhook timestamp');
    });
  });

  describe('input validation', () => {
    it('should throw ValidationError for missing payload parameter', async () => {
      await expect(() =>
        triggers.verifyWebhook({
          signature: 'v1,sig',
          secret: testSecret,
          webhookId: testWebhookId,
          webhookTimestamp: testTimestamp,
        } as any)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for missing signature parameter', async () => {
      await expect(() =>
        triggers.verifyWebhook({
          payload: '{}',
          secret: testSecret,
          webhookId: testWebhookId,
          webhookTimestamp: testTimestamp,
        } as any)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for missing secret parameter', async () => {
      await expect(() =>
        triggers.verifyWebhook({
          payload: '{}',
          signature: 'v1,sig',
          webhookId: testWebhookId,
          webhookTimestamp: testTimestamp,
        } as any)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for missing webhookId parameter', async () => {
      await expect(() =>
        triggers.verifyWebhook({
          payload: '{}',
          signature: 'v1,sig',
          secret: testSecret,
          webhookTimestamp: testTimestamp,
        } as any)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for missing webhookTimestamp parameter', async () => {
      await expect(() =>
        triggers.verifyWebhook({
          payload: '{}',
          signature: 'v1,sig',
          secret: testSecret,
          webhookId: testWebhookId,
        } as any)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid tolerance type', async () => {
      await expect(() =>
        triggers.verifyWebhook({
          payload: '{}',
          signature: 'v1,sig',
          secret: testSecret,
          id: testWebhookId,
          timestamp: testTimestamp,
          tolerance: 'invalid' as any,
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('security considerations', () => {
    it('should use timing-safe comparison for signatures', async () => {
      const v3Payload = createMockV3Payload();
      const payloadStr = JSON.stringify(v3Payload);
      const validSignature = createSignature(testWebhookId, testTimestamp, payloadStr, testSecret);

      // Valid signature should work
      await expect(
        triggers.verifyWebhook({
          payload: payloadStr,
          signature: validSignature,
          secret: testSecret,
          id: testWebhookId,
          timestamp: testTimestamp,
        })
      ).resolves.toBeDefined();

      // Invalid signature with same format should fail
      const invalidSignature = 'v1,' + 'a'.repeat(44); // base64 SHA256 is 44 chars
      await expect(() =>
        triggers.verifyWebhook({
          payload: payloadStr,
          signature: invalidSignature,
          secret: testSecret,
          id: testWebhookId,
          timestamp: testTimestamp,
        })
      ).rejects.toThrow(ComposioWebhookSignatureVerificationError);
    });

    it('should handle unicode in payload correctly', async () => {
      const v3Payload = createMockV3Payload({ data: { message: '你好世界 🌍 مرحبا' } });
      const payloadStr = JSON.stringify(v3Payload);
      const signature = createSignature(testWebhookId, testTimestamp, payloadStr, testSecret);

      const result = await triggers.verifyWebhook({
        payload: payloadStr,
        signature,
        secret: testSecret,
        id: testWebhookId,
        timestamp: testTimestamp,
      });

      expect(result).toBeDefined();
      expect(result.payload.payload).toEqual({ message: '你好世界 🌍 مرحبا' });
    });

    it('should handle special characters in secret', async () => {
      const specialSecret = 'secret!@#$%^&*()_+-=[]{}|;:,.<>?';
      const v3Payload = createMockV3Payload();
      const payloadStr = JSON.stringify(v3Payload);
      const signature = createSignature(testWebhookId, testTimestamp, payloadStr, specialSecret);

      const result = await triggers.verifyWebhook({
        payload: payloadStr,
        signature,
        secret: specialSecret,
        id: testWebhookId,
        timestamp: testTimestamp,
      });

      expect(result).toBeDefined();
    });

    it('should support multiple signatures in header', async () => {
      const v3Payload = createMockV3Payload();
      const payloadStr = JSON.stringify(v3Payload);
      const validSignature = createSignature(testWebhookId, testTimestamp, payloadStr, testSecret);
      // Multiple signatures space-separated
      const multipleSignatures = `v1,invalidsig== ${validSignature}`;

      const result = await triggers.verifyWebhook({
        payload: payloadStr,
        signature: multipleSignatures,
        secret: testSecret,
        id: testWebhookId,
        timestamp: testTimestamp,
      });

      expect(result).toBeDefined();
    });
  });

  describe('error properties', () => {
    it('should include proper error class for signature verification error', async () => {
      const payloadStr = JSON.stringify(createMockV3Payload());

      try {
        await triggers.verifyWebhook({
          payload: payloadStr,
          signature: 'v1,invalid',
          secret: testSecret,
          id: testWebhookId,
          timestamp: testTimestamp,
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ComposioWebhookSignatureVerificationError);
        expect((error as ComposioWebhookSignatureVerificationError).name).toBe(
          'ComposioWebhookSignatureVerificationError'
        );
      }
    });

    it('should include proper error class for payload error', async () => {
      const invalidPayload = 'not-json';
      const signature = createSignature(testWebhookId, testTimestamp, invalidPayload, testSecret);

      try {
        await triggers.verifyWebhook({
          payload: invalidPayload,
          signature,
          secret: testSecret,
          id: testWebhookId,
          timestamp: testTimestamp,
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ComposioWebhookPayloadError);
        expect((error as ComposioWebhookPayloadError).name).toBe('ComposioWebhookPayloadError');
      }
    });
  });
});
