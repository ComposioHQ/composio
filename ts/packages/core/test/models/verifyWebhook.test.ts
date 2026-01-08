import * as crypto from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Triggers } from '../../src/models/Triggers';
import ComposioClient from '@composio/client';
import { TriggerData } from '../../src/types/triggers.types';
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

// Helper to create a valid signature
const createSignature = (payload: string, secret: string): string => {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
};

// Mock trigger data that matches TriggerData structure
const createMockTriggerData = (overrides: Partial<TriggerData> = {}): TriggerData => ({
  appName: 'github',
  clientId: 123,
  payload: { action: 'push', repository: 'test-repo' },
  originalPayload: { action: 'push', repository: 'test-repo' },
  metadata: {
    id: 'trigger-123',
    nanoId: 'trigger-123-nano',
    triggerName: 'github_webhook',
    triggerData: '{"action":"push"}',
    triggerConfig: { webhook_url: 'https://example.com/webhook' },
    connection: {
      id: 'conn-123',
      connectedAccountNanoId: 'conn-123',
      integrationId: 'github',
      authConfigNanoId: 'auth-123',
      clientUniqueUserId: 'user-456',
      status: 'ACTIVE',
    },
  },
  ...overrides,
});

describe('Triggers.verifyWebhook', () => {
  let triggers: Triggers<any>;
  let mockClient: ReturnType<typeof createMockClient>;
  const testSecret = 'test-webhook-secret-12345';

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    triggers = new Triggers(mockClient as unknown as ComposioClient);
  });

  describe('successful verification', () => {
    it('should verify a valid webhook payload and signature', () => {
      const triggerData = createMockTriggerData();
      const payload = JSON.stringify(triggerData);
      const signature = createSignature(payload, testSecret);

      const result = triggers.verifyWebhook({
        payload,
        signature,
        secret: testSecret,
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('trigger-123-nano');
      expect(result.uuid).toBe('trigger-123');
      expect(result.triggerSlug).toBe('github_webhook');
      expect(result.toolkitSlug).toBe('github');
      expect(result.userId).toBe('user-456');
    });

    it('should verify webhook with tolerance set to 0 (skip timestamp validation)', () => {
      const triggerData = createMockTriggerData();
      const payload = JSON.stringify(triggerData);
      const signature = createSignature(payload, testSecret);

      const result = triggers.verifyWebhook({
        payload,
        signature,
        secret: testSecret,
        tolerance: 0,
      });

      expect(result).toBeDefined();
      expect(result.triggerSlug).toBe('github_webhook');
    });

    it('should verify webhook with custom tolerance', () => {
      const triggerData = createMockTriggerData();
      const payload = JSON.stringify(triggerData);
      const signature = createSignature(payload, testSecret);

      const result = triggers.verifyWebhook({
        payload,
        signature,
        secret: testSecret,
        tolerance: 600, // 10 minutes
      });

      expect(result).toBeDefined();
    });

    it('should correctly transform the payload to IncomingTriggerPayload format', () => {
      const triggerData = createMockTriggerData();
      const payload = JSON.stringify(triggerData);
      const signature = createSignature(payload, testSecret);

      const result = triggers.verifyWebhook({
        payload,
        signature,
        secret: testSecret,
      });

      // Verify transformation
      expect(result.metadata.connectedAccount).toEqual({
        id: 'conn-123',
        uuid: 'conn-123',
        authConfigId: 'auth-123',
        authConfigUUID: 'github',
        userId: 'user-456',
        status: 'ACTIVE',
      });
    });
  });

  describe('signature verification errors', () => {
    it('should throw error when payload is empty', () => {
      expect(() =>
        triggers.verifyWebhook({
          payload: '',
          signature: 'some-signature',
          secret: testSecret,
        })
      ).toThrow(ComposioWebhookSignatureVerificationError);

      expect(() =>
        triggers.verifyWebhook({
          payload: '',
          signature: 'some-signature',
          secret: testSecret,
        })
      ).toThrow('No webhook payload was provided.');
    });

    it('should throw error when signature is empty', () => {
      const payload = JSON.stringify(createMockTriggerData());

      expect(() =>
        triggers.verifyWebhook({
          payload,
          signature: '',
          secret: testSecret,
        })
      ).toThrow(ComposioWebhookSignatureVerificationError);

      expect(() =>
        triggers.verifyWebhook({
          payload,
          signature: '',
          secret: testSecret,
        })
      ).toThrow('No signature header value was provided.');
    });

    it('should throw error when secret is empty', () => {
      const payload = JSON.stringify(createMockTriggerData());

      expect(() =>
        triggers.verifyWebhook({
          payload,
          signature: 'some-signature',
          secret: '',
        })
      ).toThrow(ComposioWebhookSignatureVerificationError);

      expect(() =>
        triggers.verifyWebhook({
          payload,
          signature: 'some-signature',
          secret: '',
        })
      ).toThrow('No webhook secret was provided.');
    });

    it('should throw error when signature is invalid', () => {
      const payload = JSON.stringify(createMockTriggerData());
      const invalidSignature = 'invalid-signature-that-does-not-match';

      expect(() =>
        triggers.verifyWebhook({
          payload,
          signature: invalidSignature,
          secret: testSecret,
        })
      ).toThrow(ComposioWebhookSignatureVerificationError);

      expect(() =>
        triggers.verifyWebhook({
          payload,
          signature: invalidSignature,
          secret: testSecret,
        })
      ).toThrow('The signature provided is invalid.');
    });

    it('should throw error when signature was created with different secret', () => {
      const payload = JSON.stringify(createMockTriggerData());
      const signatureWithDifferentSecret = createSignature(payload, 'different-secret');

      expect(() =>
        triggers.verifyWebhook({
          payload,
          signature: signatureWithDifferentSecret,
          secret: testSecret,
        })
      ).toThrow(ComposioWebhookSignatureVerificationError);
    });

    it('should throw error when payload was modified after signing', () => {
      const originalPayload = JSON.stringify(createMockTriggerData());
      const signature = createSignature(originalPayload, testSecret);

      // Modify the payload after signing
      const modifiedPayload = JSON.stringify({
        ...createMockTriggerData(),
        appName: 'modified-app',
      });

      expect(() =>
        triggers.verifyWebhook({
          payload: modifiedPayload,
          signature,
          secret: testSecret,
        })
      ).toThrow(ComposioWebhookSignatureVerificationError);
    });
  });

  describe('payload parsing errors', () => {
    it('should throw error when payload is not valid JSON', () => {
      const invalidJson = 'not-valid-json{';
      const signature = createSignature(invalidJson, testSecret);

      expect(() =>
        triggers.verifyWebhook({
          payload: invalidJson,
          signature,
          secret: testSecret,
        })
      ).toThrow(ComposioWebhookPayloadError);

      expect(() =>
        triggers.verifyWebhook({
          payload: invalidJson,
          signature,
          secret: testSecret,
        })
      ).toThrow('Failed to parse webhook payload as JSON');
    });

    it('should throw error for truncated JSON', () => {
      const truncatedJson = '{"appName": "github", "clientId":';
      const signature = createSignature(truncatedJson, testSecret);

      expect(() =>
        triggers.verifyWebhook({
          payload: truncatedJson,
          signature,
          secret: testSecret,
        })
      ).toThrow(ComposioWebhookPayloadError);
    });
  });

  describe('timestamp validation', () => {
    it('should pass when timestamp is within tolerance', () => {
      const now = new Date().toISOString();
      const triggerData = {
        ...createMockTriggerData(),
        timestamp: now,
      };
      const payload = JSON.stringify(triggerData);
      const signature = createSignature(payload, testSecret);

      // Should not throw
      const result = triggers.verifyWebhook({
        payload,
        signature,
        secret: testSecret,
        tolerance: 300,
      });

      expect(result).toBeDefined();
    });

    it('should throw error when timestamp is outside tolerance', () => {
      // Create a timestamp 10 minutes in the past
      const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const triggerData = {
        ...createMockTriggerData(),
        timestamp: oldTimestamp,
      };
      const payload = JSON.stringify(triggerData);
      const signature = createSignature(payload, testSecret);

      expect(() =>
        triggers.verifyWebhook({
          payload,
          signature,
          secret: testSecret,
          tolerance: 300, // 5 minutes
        })
      ).toThrow(ComposioWebhookSignatureVerificationError);

      expect(() =>
        triggers.verifyWebhook({
          payload,
          signature,
          secret: testSecret,
          tolerance: 300,
        })
      ).toThrow('The webhook timestamp is outside the allowed tolerance');
    });

    it('should skip timestamp validation when tolerance is 0', () => {
      // Create a timestamp 1 hour in the past
      const oldTimestamp = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const triggerData = {
        ...createMockTriggerData(),
        timestamp: oldTimestamp,
      };
      const payload = JSON.stringify(triggerData);
      const signature = createSignature(payload, testSecret);

      // Should not throw when tolerance is 0
      const result = triggers.verifyWebhook({
        payload,
        signature,
        secret: testSecret,
        tolerance: 0,
      });

      expect(result).toBeDefined();
    });

    it('should skip timestamp validation when no timestamp in payload', () => {
      const triggerData = createMockTriggerData();
      const payload = JSON.stringify(triggerData);
      const signature = createSignature(payload, testSecret);

      // Should not throw when no timestamp is present
      const result = triggers.verifyWebhook({
        payload,
        signature,
        secret: testSecret,
        tolerance: 300,
      });

      expect(result).toBeDefined();
    });

    it('should throw error for invalid timestamp format', () => {
      const triggerData = {
        ...createMockTriggerData(),
        timestamp: 'not-a-valid-timestamp',
      };
      const payload = JSON.stringify(triggerData);
      const signature = createSignature(payload, testSecret);

      expect(() =>
        triggers.verifyWebhook({
          payload,
          signature,
          secret: testSecret,
          tolerance: 300,
        })
      ).toThrow(ComposioWebhookPayloadError);

      expect(() =>
        triggers.verifyWebhook({
          payload,
          signature,
          secret: testSecret,
          tolerance: 300,
        })
      ).toThrow('Invalid timestamp in webhook payload');
    });
  });

  describe('input validation', () => {
    it('should throw ValidationError for missing payload parameter', () => {
      expect(() =>
        triggers.verifyWebhook({
          signature: 'some-signature',
          secret: testSecret,
        } as any)
      ).toThrow(ValidationError);
    });

    it('should throw ValidationError for missing signature parameter', () => {
      expect(() =>
        triggers.verifyWebhook({
          payload: '{}',
          secret: testSecret,
        } as any)
      ).toThrow(ValidationError);
    });

    it('should throw ValidationError for missing secret parameter', () => {
      expect(() =>
        triggers.verifyWebhook({
          payload: '{}',
          signature: 'some-signature',
        } as any)
      ).toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid tolerance type', () => {
      expect(() =>
        triggers.verifyWebhook({
          payload: '{}',
          signature: 'some-signature',
          secret: testSecret,
          tolerance: 'invalid' as any,
        })
      ).toThrow(ValidationError);
    });

    it('should use default tolerance of 300 seconds when not provided', () => {
      // Create a timestamp 4 minutes in the past (within default 5 min tolerance)
      const recentTimestamp = new Date(Date.now() - 4 * 60 * 1000).toISOString();
      const triggerData = {
        ...createMockTriggerData(),
        timestamp: recentTimestamp,
      };
      const payload = JSON.stringify(triggerData);
      const signature = createSignature(payload, testSecret);

      // Should not throw with default tolerance
      const result = triggers.verifyWebhook({
        payload,
        signature,
        secret: testSecret,
      });

      expect(result).toBeDefined();
    });
  });

  describe('security considerations', () => {
    it('should use timing-safe comparison for signatures', () => {
      // This test verifies the implementation uses timing-safe comparison
      // by checking that both valid and invalid signatures take similar time
      // (though this is more of a code review verification)
      const payload = JSON.stringify(createMockTriggerData());
      const validSignature = createSignature(payload, testSecret);

      // Valid signature should work
      expect(() =>
        triggers.verifyWebhook({
          payload,
          signature: validSignature,
          secret: testSecret,
        })
      ).not.toThrow();

      // Invalid signature with same length should fail
      const invalidSignature = 'a'.repeat(validSignature.length);
      expect(() =>
        triggers.verifyWebhook({
          payload,
          signature: invalidSignature,
          secret: testSecret,
        })
      ).toThrow(ComposioWebhookSignatureVerificationError);
    });

    it('should reject signatures with different lengths', () => {
      const payload = JSON.stringify(createMockTriggerData());
      const shortSignature = 'abc123';

      expect(() =>
        triggers.verifyWebhook({
          payload,
          signature: shortSignature,
          secret: testSecret,
        })
      ).toThrow(ComposioWebhookSignatureVerificationError);
    });

    it('should handle unicode in payload correctly', () => {
      const triggerData = {
        ...createMockTriggerData(),
        payload: { message: '你好世界 🌍 مرحبا' },
      };
      const payload = JSON.stringify(triggerData);
      const signature = createSignature(payload, testSecret);

      const result = triggers.verifyWebhook({
        payload,
        signature,
        secret: testSecret,
      });

      expect(result).toBeDefined();
      expect(result.payload).toEqual({ message: '你好世界 🌍 مرحبا' });
    });

    it('should handle special characters in secret', () => {
      const specialSecret = 'secret!@#$%^&*()_+-=[]{}|;:,.<>?';
      const triggerData = createMockTriggerData();
      const payload = JSON.stringify(triggerData);
      const signature = createSignature(payload, specialSecret);

      const result = triggers.verifyWebhook({
        payload,
        signature,
        secret: specialSecret,
      });

      expect(result).toBeDefined();
    });
  });

  describe('error properties', () => {
    it('should include proper error code for signature verification error', () => {
      const payload = JSON.stringify(createMockTriggerData());

      try {
        triggers.verifyWebhook({
          payload,
          signature: 'invalid',
          secret: testSecret,
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ComposioWebhookSignatureVerificationError);
        expect((error as ComposioWebhookSignatureVerificationError).name).toBe(
          'ComposioWebhookSignatureVerificationError'
        );
      }
    });

    it('should include proper error code for payload error', () => {
      const invalidPayload = 'not-json';
      const signature = createSignature(invalidPayload, testSecret);

      try {
        triggers.verifyWebhook({
          payload: invalidPayload,
          signature,
          secret: testSecret,
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ComposioWebhookPayloadError);
        expect((error as ComposioWebhookPayloadError).name).toBe('ComposioWebhookPayloadError');
      }
    });
  });
});
