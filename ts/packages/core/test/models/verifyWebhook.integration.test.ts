import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Triggers } from '../../src/models/Triggers';
import ComposioClient from '@composio/client';
import { WebhookVersions } from '../../src/types/triggers.types';

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
 * Fixture type definition
 */
interface WebhookFixture {
  description: string;
  capturedAt: string;
  headers: {
    'webhook-id': string;
    'webhook-timestamp': string;
    'webhook-signature': string;
  };
  payload: string;
  testSecret: string;
  expectedResult: {
    version: string;
    triggerSlug: string;
    userId?: string;
    connectedAccountId?: string;
    triggerId?: string;
  };
}

/**
 * Golden signature test case
 */
interface GoldenSignatureTestCase {
  name: string;
  id: string;
  timestamp: string;
  payload: string;
  secret: string;
  expectedSignature: string;
}

interface GoldenSignatures {
  description: string;
  algorithm: string;
  format: string;
  testCases: GoldenSignatureTestCase[];
}

/**
 * Load all webhook fixtures from the fixtures directory
 */
function loadFixtures(): WebhookFixture[] {
  const fixturesDir = path.join(__dirname, '../fixtures/webhook');
  const fixtureFiles = fs
    .readdirSync(fixturesDir)
    .filter(f => f.startsWith('v') && f.endsWith('.json') && !f.includes('golden'));

  return fixtureFiles.map(file => {
    const content = fs.readFileSync(path.join(fixturesDir, file), 'utf-8');
    return JSON.parse(content) as WebhookFixture;
  });
}

/**
 * Load golden signatures for contract testing
 */
function loadGoldenSignatures(): GoldenSignatures {
  const fixturesDir = path.join(__dirname, '../fixtures/webhook');
  const content = fs.readFileSync(path.join(fixturesDir, 'golden-signatures.json'), 'utf-8');
  return JSON.parse(content) as GoldenSignatures;
}

/**
 * Compute signature using the documented algorithm
 */
function computeSignature(id: string, timestamp: string, payload: string, secret: string): string {
  const toSign = `${id}.${timestamp}.${payload}`;
  const signature = crypto.createHmac('sha256', secret).update(toSign, 'utf8').digest('base64');
  return `v1,${signature}`;
}

describe('Triggers.verifyWebhook - Integration Tests', () => {
  let triggers: Triggers<any>;
  let mockClient: ReturnType<typeof createMockClient>;
  const fixtures = loadFixtures();
  const goldenSignatures = loadGoldenSignatures();

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    triggers = new Triggers(mockClient as unknown as ComposioClient);
  });

  describe('fixture-based verification', () => {
    it.each(fixtures)('verifies $description', async fixture => {
      const result = await triggers.verifyWebhook({
        payload: fixture.payload,
        signature: fixture.headers['webhook-signature'],
        id: fixture.headers['webhook-id'],
        timestamp: fixture.headers['webhook-timestamp'],
        secret: fixture.testSecret,
        tolerance: 0, // Disable timestamp validation for fixtures
      });

      expect(result.version).toBe(fixture.expectedResult.version);
      expect(result.payload.triggerSlug).toBe(fixture.expectedResult.triggerSlug);

      if (fixture.expectedResult.userId) {
        expect(result.payload.userId).toBe(fixture.expectedResult.userId);
      }

      if (fixture.expectedResult.connectedAccountId) {
        expect(result.payload.metadata.connectedAccount.id).toBe(
          fixture.expectedResult.connectedAccountId
        );
      }

      if (fixture.expectedResult.triggerId) {
        expect(result.payload.id).toBe(fixture.expectedResult.triggerId);
      }
    });

    it('detects correct version for V3 payload', async () => {
      const v3Fixture = fixtures.find(f => f.expectedResult.version === 'V3');
      if (!v3Fixture) {
        throw new Error('V3 fixture not found');
      }

      const result = await triggers.verifyWebhook({
        payload: v3Fixture.payload,
        signature: v3Fixture.headers['webhook-signature'],
        id: v3Fixture.headers['webhook-id'],
        timestamp: v3Fixture.headers['webhook-timestamp'],
        secret: v3Fixture.testSecret,
        tolerance: 0,
      });

      expect(result.version).toBe(WebhookVersions.V3);
      expect(result.rawPayload).toHaveProperty('type', 'composio.trigger.message');
      expect(result.rawPayload).toHaveProperty('metadata');
    });

    it('detects correct version for V2 payload', async () => {
      const v2Fixture = fixtures.find(f => f.expectedResult.version === 'V2');
      if (!v2Fixture) {
        throw new Error('V2 fixture not found');
      }

      const result = await triggers.verifyWebhook({
        payload: v2Fixture.payload,
        signature: v2Fixture.headers['webhook-signature'],
        id: v2Fixture.headers['webhook-id'],
        timestamp: v2Fixture.headers['webhook-timestamp'],
        secret: v2Fixture.testSecret,
        tolerance: 0,
      });

      expect(result.version).toBe(WebhookVersions.V2);
      expect(result.rawPayload).toHaveProperty('type');
      expect(result.rawPayload).toHaveProperty('data');
    });

    it('detects correct version for V1 payload', async () => {
      const v1Fixture = fixtures.find(f => f.expectedResult.version === 'V1');
      if (!v1Fixture) {
        throw new Error('V1 fixture not found');
      }

      const result = await triggers.verifyWebhook({
        payload: v1Fixture.payload,
        signature: v1Fixture.headers['webhook-signature'],
        id: v1Fixture.headers['webhook-id'],
        timestamp: v1Fixture.headers['webhook-timestamp'],
        secret: v1Fixture.testSecret,
        tolerance: 0,
      });

      expect(result.version).toBe(WebhookVersions.V1);
      expect(result.rawPayload).toHaveProperty('trigger_name');
      expect(result.rawPayload).toHaveProperty('connection_id');
    });
  });

  describe('golden signature contract tests', () => {
    it.each(goldenSignatures.testCases)(
      'produces identical signature for: $name',
      async testCase => {
        const computed = computeSignature(
          testCase.id,
          testCase.timestamp,
          testCase.payload,
          testCase.secret
        );
        expect(computed).toBe(testCase.expectedSignature);
      }
    );

    it('algorithm matches documented format', () => {
      expect(goldenSignatures.algorithm).toBe('HMAC-SHA256');
      expect(goldenSignatures.format).toBe('v1,base64(HMAC-SHA256(id.timestamp.payload, secret))');
    });
  });

  describe('signature algorithm validation', () => {
    it('computes signature using id.timestamp.payload format', async () => {
      const fixture = fixtures[0];
      const expectedSignature = computeSignature(
        fixture.headers['webhook-id'],
        fixture.headers['webhook-timestamp'],
        fixture.payload,
        fixture.testSecret
      );

      expect(expectedSignature).toBe(fixture.headers['webhook-signature']);
    });

    it('rejects signature computed with wrong format (payload only)', async () => {
      const fixture = fixtures[0];
      // Wrong format: just payload
      const wrongSignature =
        'v1,' +
        crypto
          .createHmac('sha256', fixture.testSecret)
          .update(fixture.payload, 'utf8')
          .digest('base64');

      await expect(
        triggers.verifyWebhook({
          payload: fixture.payload,
          signature: wrongSignature,
          id: fixture.headers['webhook-id'],
          timestamp: fixture.headers['webhook-timestamp'],
          secret: fixture.testSecret,
          tolerance: 0,
        })
      ).rejects.toThrow('The signature provided is invalid');
    });

    it('rejects signature computed with wrong format (timestamp.payload)', async () => {
      const fixture = fixtures[0];
      // Wrong format: timestamp.payload (missing id)
      const toSign = `${fixture.headers['webhook-timestamp']}.${fixture.payload}`;
      const wrongSignature =
        'v1,' +
        crypto.createHmac('sha256', fixture.testSecret).update(toSign, 'utf8').digest('base64');

      await expect(
        triggers.verifyWebhook({
          payload: fixture.payload,
          signature: wrongSignature,
          id: fixture.headers['webhook-id'],
          timestamp: fixture.headers['webhook-timestamp'],
          secret: fixture.testSecret,
          tolerance: 0,
        })
      ).rejects.toThrow('The signature provided is invalid');
    });
  });

  describe('payload structure validation', () => {
    it('preserves exact JSON structure from fixture', async () => {
      const v3Fixture = fixtures.find(f => f.expectedResult.version === 'V3');
      if (!v3Fixture) throw new Error('V3 fixture not found');

      const result = await triggers.verifyWebhook({
        payload: v3Fixture.payload,
        signature: v3Fixture.headers['webhook-signature'],
        id: v3Fixture.headers['webhook-id'],
        timestamp: v3Fixture.headers['webhook-timestamp'],
        secret: v3Fixture.testSecret,
        tolerance: 0,
      });

      const parsedPayload = JSON.parse(v3Fixture.payload);
      expect(result.rawPayload).toEqual(parsedPayload);
    });

    it('normalizes V3 payload to IncomingTriggerPayload format', async () => {
      const v3Fixture = fixtures.find(f => f.expectedResult.version === 'V3');
      if (!v3Fixture) throw new Error('V3 fixture not found');

      const result = await triggers.verifyWebhook({
        payload: v3Fixture.payload,
        signature: v3Fixture.headers['webhook-signature'],
        id: v3Fixture.headers['webhook-id'],
        timestamp: v3Fixture.headers['webhook-timestamp'],
        secret: v3Fixture.testSecret,
        tolerance: 0,
      });

      // Verify normalized payload has expected structure
      expect(result.payload).toHaveProperty('id');
      expect(result.payload).toHaveProperty('uuid');
      expect(result.payload).toHaveProperty('triggerSlug');
      expect(result.payload).toHaveProperty('toolkitSlug');
      expect(result.payload).toHaveProperty('userId');
      expect(result.payload).toHaveProperty('payload');
      expect(result.payload).toHaveProperty('metadata');
      expect(result.payload.metadata).toHaveProperty('connectedAccount');
    });
  });

  describe('whitespace sensitivity', () => {
    it('fails verification if whitespace in payload changes', async () => {
      const fixture = fixtures[0];
      // Add extra whitespace to payload
      const modifiedPayload = fixture.payload.replace('{', '{ ');

      await expect(
        triggers.verifyWebhook({
          payload: modifiedPayload,
          signature: fixture.headers['webhook-signature'],
          id: fixture.headers['webhook-id'],
          timestamp: fixture.headers['webhook-timestamp'],
          secret: fixture.testSecret,
          tolerance: 0,
        })
      ).rejects.toThrow();
    });

    it('fails verification if payload is re-serialized', async () => {
      const fixture = fixtures[0];
      // Parse and re-serialize - may change whitespace/key order
      const reserialized = JSON.stringify(JSON.parse(fixture.payload));

      // Only test if re-serialization actually changed the payload
      if (reserialized !== fixture.payload) {
        await expect(
          triggers.verifyWebhook({
            payload: reserialized,
            signature: fixture.headers['webhook-signature'],
            id: fixture.headers['webhook-id'],
            timestamp: fixture.headers['webhook-timestamp'],
            secret: fixture.testSecret,
            tolerance: 0,
          })
        ).rejects.toThrow();
      }
    });
  });

  describe('cross-fixture consistency', () => {
    it('all fixtures use the same test secret', () => {
      const secrets = new Set(fixtures.map(f => f.testSecret));
      expect(secrets.size).toBe(1);
      expect(secrets.has('test-webhook-secret-for-fixtures')).toBe(true);
    });

    it('all fixtures have unique webhook IDs', () => {
      const ids = fixtures.map(f => f.headers['webhook-id']);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(fixtures.length);
    });

    it('fixtures cover all supported versions', () => {
      const versions = new Set(fixtures.map(f => f.expectedResult.version));
      expect(versions.has('V1')).toBe(true);
      expect(versions.has('V2')).toBe(true);
      expect(versions.has('V3')).toBe(true);
    });
  });
});
