import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { Triggers } from '../../src/models/triggers';
import ComposioClient from '@composio/client';
import logger from '../../src/utils/logger';
import {
  TriggerSubscribeParams,
  TriggerData,
  IncomingTriggerPayload,
} from '../../src/types/triggers.types';
import { telemetry } from '../../src/telemetry/Telemetry';
import { ValidationError } from '../../src/errors';
import { PusherService } from '../../src/services/pusher/Pusher';
import { ComposioFailedToSubscribeToPusherChannelError } from '../../src/errors/TriggerErrors';

// Mock dependencies
vi.mock('../../src/utils/logger');
vi.mock('../../src/telemetry/Telemetry', () => ({
  telemetry: {
    instrument: vi.fn(),
  },
}));
vi.mock('../../src/services/pusher/Pusher');

// Create mock client with trigger-related methods
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
});

// Mock response data
const mockTriggerInstances = {
  items: [
    {
      id: 'trigger-1',
      connected_account_id: 'conn-123',
      disabled_at: null,
      state: { lastRun: '2024-01-01T00:00:00Z' },
      trigger_config: { webhook_url: 'https://example.com/webhook' },
      trigger_name: 'github_webhook',
      updated_at: '2024-01-01T00:00:00Z',
      trigger_data: '{"event":"push"}',
      uuid: 'uuid-123',
    },
    {
      id: 'trigger-2',
      connected_account_id: 'conn-456',
      disabled_at: '2024-01-02T00:00:00Z',
      state: { lastRun: '2024-01-02T00:00:00Z' },
      trigger_config: { channel: '#general' },
      trigger_name: 'slack_message',
      updated_at: '2024-01-02T00:00:00Z',
      trigger_data: '{"event":"message"}',
      uuid: 'uuid-456',
    },
  ],
  next_cursor: null,
  total_pages: 1,
};

const mockTriggerUpsertResponse = {
  trigger_id: 'trigger-123',
};

const mockTriggerUpdateResponse = {
  status: 'success',
};

const mockTriggerDeleteResponse = {
  trigger_id: 'trigger-123',
};

const mockTriggerTypes = {
  items: [
    {
      slug: 'github_webhook',
      name: 'GitHub Webhook',
      description: 'Triggered when a GitHub event occurs',
      config: {
        required: ['webhook_url'],
        optional: ['secret'],
      },
    },
  ],
  totalPages: 1,
  page: 1,
};

const mockTriggerType = {
  slug: 'github_webhook',
  name: 'GitHub Webhook',
  description: 'Triggered when a GitHub event occurs',
  config: {
    required: ['webhook_url'],
    optional: ['secret'],
  },
};

const mockTriggerEnum = {
  enum: ['github_webhook', 'slack_message', 'email_received'],
};

const mockSessionInfo = {
  project: {
    id: 'client-123',
    name: 'Test Project',
  },
  user: {
    id: 'user-456',
    email: 'test@example.com',
  },
};

const mockTriggerData: TriggerData = {
  appName: 'github',
  clientId: 123,
  payload: { action: 'push', repository: 'test-repo' },
  originalPayload: { action: 'push', repository: 'test-repo' },
  metadata: {
    id: 'trigger-123',
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
};

const mockIncomingTriggerPayload: IncomingTriggerPayload = {
  id: 'trigger-123',
  triggerSlug: 'github_webhook',
  toolkitSlug: 'github',
  userId: 'user-456',
  payload: { action: 'push', repository: 'test-repo' },
  originalPayload: { action: 'push', repository: 'test-repo' },
  metadata: {
    id: 'trigger-123',
    toolkitSlug: 'github',
    triggerSlug: 'github_webhook',
    triggerData: '{"action":"push"}',
    triggerConfig: { webhook_url: 'https://example.com/webhook' },
    connectedAccount: {
      id: 'conn-123',
      uuid: 'conn-123',
      authConfigId: 'auth-123',
      authConfigUUID: 'github',
      userId: 'user-456',
      status: 'ACTIVE',
    },
  },
};

describe('Triggers', () => {
  let triggers: Triggers;
  let mockClient: ReturnType<typeof createMockClient>;
  let mockPusherService: {
    subscribe: Mock;
    unsubscribe: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockClient = createMockClient();
    mockPusherService = {
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    } as unknown as { subscribe: Mock; unsubscribe: Mock };

    // Mock PusherService constructor
    (PusherService as unknown as Mock).mockImplementation(() => mockPusherService);

    triggers = new Triggers(mockClient as unknown as ComposioClient);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    it('should create an instance successfully', () => {
      expect(triggers).toBeInstanceOf(Triggers);
      expect(telemetry.instrument).toHaveBeenCalledWith(triggers);
    });

    it('should store the client reference', () => {
      expect(triggers['client']).toBe(mockClient);
    });
  });

  describe('list', () => {
    it('should list active trigger instances', async () => {
      mockClient.triggerInstances.listActive.mockResolvedValue(mockTriggerInstances);

      const result = await triggers.listActive();

      expect(mockClient.triggerInstances.listActive).toHaveBeenCalledWith(undefined);
      expect(result).toEqual({
        items: mockTriggerInstances.items.map(item => ({
          id: item.id,
          connectedAccountId: item.connected_account_id,
          disabledAt: item.disabled_at,
          state: item.state,
          triggerConfig: item.trigger_config,
          triggerName: item.trigger_name,
          updatedAt: item.updated_at,
          triggerData: item.trigger_data,
          uuid: item.uuid,
        })),
        nextCursor: null,
        totalPages: 1,
      });
    });

    it('should throw validation error for invalid response', async () => {
      mockClient.triggerInstances.listActive.mockResolvedValue({
        items: [{ invalid: 'data' }],
      });

      await expect(triggers.listActive()).rejects.toThrow(ValidationError);
    });

    it('should list active trigger instances with query parameters', async () => {
      const query = {
        authConfigIds: ['auth-1'],
        connectedAccountIds: ['conn-1'],
        limit: 5,
        page: 2,
        showDisabled: true,
        triggerIds: ['trigger-1'],
        triggerNames: ['github_webhook'],
      };

      mockClient.triggerInstances.listActive.mockResolvedValue(mockTriggerInstances);

      await triggers.listActive(query);

      expect(mockClient.triggerInstances.listActive).toHaveBeenCalledWith({
        auth_config_ids: query.authConfigIds,
        connected_account_ids: query.connectedAccountIds,
        limit: query.limit,
        page: query.page,
        show_disabled: query.showDisabled,
        trigger_ids: query.triggerIds,
        trigger_names: query.triggerNames,
      });
    });
  });

  describe('create', () => {
    it('should create a new trigger instance', async () => {
      const slug = 'github_webhook';
      const body = {
        connectedAccountId: 'conn-123',
        triggerConfig: { webhook_url: 'https://example.com/webhook' },
      };
      mockClient.triggerInstances.upsert.mockResolvedValue(mockTriggerUpsertResponse);

      const result = await triggers.create(slug, body);

      expect(mockClient.triggerInstances.upsert).toHaveBeenCalledWith(slug, {
        connected_account_id: body.connectedAccountId,
        trigger_config: body.triggerConfig,
      });
      expect(result).toEqual({ triggerId: mockTriggerUpsertResponse.trigger_id });
    });
  });

  describe('update', () => {
    it('should update a trigger instance status', async () => {
      const triggerId = 'trigger-123';
      const body = { status: 'enable' as const };
      mockClient.triggerInstances.manage.update.mockResolvedValue(mockTriggerUpdateResponse);

      const result = await triggers.update(triggerId, body);

      expect(mockClient.triggerInstances.manage.update).toHaveBeenCalledWith(triggerId, body);
      expect(result).toEqual(mockTriggerUpdateResponse);
    });
  });

  describe('delete', () => {
    it('should delete a trigger instance', async () => {
      const triggerId = 'trigger-123';
      mockClient.triggerInstances.manage.delete.mockResolvedValue(mockTriggerDeleteResponse);

      const result = await triggers.delete(triggerId);

      expect(mockClient.triggerInstances.manage.delete).toHaveBeenCalledWith(triggerId);
      expect(result).toEqual({ triggerId: mockTriggerDeleteResponse.trigger_id });
    });

    it('should throw validation error for invalid response', async () => {
      const triggerId = 'trigger-123';
      mockClient.triggerInstances.manage.delete.mockResolvedValue({ invalid: 'response' });

      await expect(triggers.delete(triggerId)).rejects.toThrow(ValidationError);
    });
  });

  describe('disable', () => {
    it('should disable a trigger instance', async () => {
      const triggerId = 'trigger-123';
      mockClient.triggerInstances.manage.update.mockResolvedValue(mockTriggerUpdateResponse);

      const result = await triggers.disable(triggerId);

      expect(mockClient.triggerInstances.manage.update).toHaveBeenCalledWith(triggerId, {
        status: 'disable',
      });
      expect(result).toEqual(mockTriggerUpdateResponse);
    });
  });

  describe('enable', () => {
    it('should enable a trigger instance', async () => {
      const triggerId = 'trigger-123';
      mockClient.triggerInstances.manage.update.mockResolvedValue(mockTriggerUpdateResponse);

      const result = await triggers.enable(triggerId);

      expect(mockClient.triggerInstances.manage.update).toHaveBeenCalledWith(triggerId, {
        status: 'enable',
      });
      expect(result).toEqual(mockTriggerUpdateResponse);
    });
  });

  describe('listTypes', () => {
    it('should list all trigger types', async () => {
      mockClient.triggersTypes.list.mockResolvedValue(mockTriggerTypes);

      const result = await triggers.listTypes();

      expect(mockClient.triggersTypes.list).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(mockTriggerTypes);
    });

    it('should list trigger types with query parameters', async () => {
      const query = { limit: 10, toolkit: 'github' };
      mockClient.triggersTypes.list.mockResolvedValue(mockTriggerTypes);

      const result = await triggers.listTypes(query);

      expect(mockClient.triggersTypes.list).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockTriggerTypes);
    });
  });

  describe('getType', () => {
    it('should retrieve a trigger type by slug', async () => {
      const slug = 'github_webhook';
      mockClient.triggersTypes.retrieve.mockResolvedValue(mockTriggerType);

      const result = await triggers.getType(slug);

      expect(mockClient.triggersTypes.retrieve).toHaveBeenCalledWith(slug);
      expect(result).toEqual(mockTriggerType);
    });
  });

  describe('listEnum', () => {
    it('should fetch the list of all available trigger enums', async () => {
      mockClient.triggersTypes.retrieveEnum.mockResolvedValue(mockTriggerEnum);

      const result = await triggers.listEnum();

      expect(mockClient.triggersTypes.retrieveEnum).toHaveBeenCalled();
      expect(result).toEqual(mockTriggerEnum);
    });
  });

  describe('subscribe', () => {
    const mockCallback = vi.fn();

    beforeEach(() => {
      mockCallback.mockClear();
      vi.mocked(logger.debug).mockClear();
    });

    it('should throw error if function is not provided', async () => {
      await expect(triggers.subscribe(null as any)).rejects.toThrow(
        'Function is required for trigger subscription'
      );
    });

    it('should subscribe to triggers without filters', async () => {
      await triggers.subscribe(mockCallback);

      expect(mockPusherService.subscribe).toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('🔄 Subscribing to triggers with filters: ', '{}');
    });

    it('should subscribe to triggers with filters', async () => {
      const filters: TriggerSubscribeParams = {
        toolkits: ['github'],
        triggerId: 'trigger-123',
        connectedAccountId: 'conn-123',
        triggerSlug: ['github_webhook'],
        triggerData: '{"action":"push"}',
        userId: 'user-456',
      };

      await triggers.subscribe(mockCallback, filters);

      expect(mockPusherService.subscribe).toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        '🔄 Subscribing to triggers with filters: ',
        JSON.stringify(filters, null, 2)
      );
    });

    it('should filter triggers based on toolkits case-insensitively', async () => {
      const filters: TriggerSubscribeParams = { toolkits: ['GITHUB'] };
      await triggers.subscribe(mockCallback, filters);

      const subscribeCall = vi.mocked(mockPusherService.subscribe).mock.calls[0];
      const filterCallback = subscribeCall[0];

      filterCallback(mockTriggerData);

      expect(mockCallback).toHaveBeenCalledWith(mockIncomingTriggerPayload);
      expect(mockCallback).toHaveBeenCalledTimes(1);
    });

    it('should log debug message when toolkit filter does not match', async () => {
      const filters: TriggerSubscribeParams = { toolkits: ['slack'] };
      await triggers.subscribe(mockCallback, filters);

      const subscribeCall = vi.mocked(mockPusherService.subscribe).mock.calls[0];
      const filterCallback = subscribeCall[0];

      filterCallback(mockTriggerData);

      expect(mockCallback).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        'Trigger does not match toolkits filter',
        expect.any(String)
      );
    });

    it('should log debug message when triggerId filter does not match', async () => {
      const filters: TriggerSubscribeParams = { triggerId: 'trigger-456' };
      await triggers.subscribe(mockCallback, filters);

      const subscribeCall = vi.mocked(mockPusherService.subscribe).mock.calls[0];
      const filterCallback = subscribeCall[0];

      filterCallback(mockTriggerData);

      expect(mockCallback).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        'Trigger does not match triggerId filter',
        expect.any(String)
      );
    });

    it('should log debug message when connectedAccountId filter does not match', async () => {
      const filters: TriggerSubscribeParams = { connectedAccountId: 'conn-456' };
      await triggers.subscribe(mockCallback, filters);

      const subscribeCall = vi.mocked(mockPusherService.subscribe).mock.calls[0];
      const filterCallback = subscribeCall[0];

      filterCallback(mockTriggerData);

      expect(mockCallback).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        'Trigger does not match connectedAccountId filter',
        expect.any(String)
      );
    });

    it('should log debug message when triggerSlug filter does not match', async () => {
      const filters: TriggerSubscribeParams = { triggerSlug: ['slack_message'] };
      await triggers.subscribe(mockCallback, filters);

      const subscribeCall = vi.mocked(mockPusherService.subscribe).mock.calls[0];
      const filterCallback = subscribeCall[0];

      filterCallback(mockTriggerData);

      expect(mockCallback).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        'Trigger does not match triggerSlug filter',
        expect.any(String)
      );
    });

    it('should log debug message when triggerData filter does not match', async () => {
      const filters: TriggerSubscribeParams = { triggerData: '{"action":"comment"}' };
      await triggers.subscribe(mockCallback, filters);

      const subscribeCall = vi.mocked(mockPusherService.subscribe).mock.calls[0];
      const filterCallback = subscribeCall[0];

      filterCallback(mockTriggerData);

      expect(mockCallback).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        'Trigger does not match triggerData filter',
        expect.any(String)
      );
    });

    it('should log debug message when userId filter does not match', async () => {
      const filters: TriggerSubscribeParams = { userId: 'user-789' };
      await triggers.subscribe(mockCallback, filters);

      const subscribeCall = vi.mocked(mockPusherService.subscribe).mock.calls[0];
      const filterCallback = subscribeCall[0];

      filterCallback(mockTriggerData);

      expect(mockCallback).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        'Trigger does not match userId filter',
        expect.any(String)
      );
    });

    it('should log debug message when trigger matches all filters', async () => {
      const filters: TriggerSubscribeParams = {
        toolkits: ['github'],
        triggerId: 'trigger-123',
        connectedAccountId: 'conn-123',
        triggerSlug: ['github_webhook'],
        triggerData: '{"action":"push"}',
        userId: 'user-456',
        authConfigId: 'auth-123',
      };
      await triggers.subscribe(mockCallback, filters);

      const subscribeCall = vi.mocked(mockPusherService.subscribe).mock.calls[0];
      const filterCallback = subscribeCall[0];

      filterCallback(mockTriggerData);

      expect(mockCallback).toHaveBeenCalledWith(mockIncomingTriggerPayload);
      expect(mockCallback).toHaveBeenCalledTimes(1);
      expect(logger.debug).toHaveBeenCalledWith('Trigger matches all filters', expect.any(String));
    });

    it('should log debug message when trigger does not match any filters', async () => {
      const filters: TriggerSubscribeParams = {
        toolkits: ['slack'],
        triggerId: 'trigger-456',
        triggerSlug: ['slack_message'],
      };
      await triggers.subscribe(mockCallback, filters);

      const subscribeCall = vi.mocked(mockPusherService.subscribe).mock.calls[0];
      const filterCallback = subscribeCall[0];

      filterCallback(mockTriggerData);

      expect(mockCallback).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        'Trigger does not match filters',
        expect.any(String)
      );
    });

    it('should handle invalid trigger data format', async () => {
      const invalidTriggerData = {
        appName: 'github',
        clientId: 123,
        payload: { action: 'push' },
        originalPayload: { action: 'push' },
        metadata: {
          triggerName: 'github_webhook',
        },
      };

      await triggers.subscribe(mockCallback);

      const subscribeCall = vi.mocked(mockPusherService.subscribe).mock.calls[0];
      const filterCallback = subscribeCall[0];

      expect(() => filterCallback(invalidTriggerData)).toThrow(ValidationError);
      expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should handle partial trigger data with missing optional fields', async () => {
      const partialTriggerData = {
        appName: 'github',
        clientId: 123,
        payload: { action: 'push', repository: 'test-repo' },
        originalPayload: { action: 'push', repository: 'test-repo' },
        metadata: {
          id: 'trigger-123',
          triggerName: 'github_webhook',
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
      };

      await triggers.subscribe(mockCallback);

      const subscribeCall = vi.mocked(mockPusherService.subscribe).mock.calls[0];
      const filterCallback = subscribeCall[0];

      // Should not throw for missing optional fields
      expect(() => filterCallback(partialTriggerData)).not.toThrow();
      expect(mockCallback).toHaveBeenCalledTimes(1);
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'trigger-123',
          triggerSlug: 'github_webhook',
          toolkitSlug: 'github',
          payload: { action: 'push', repository: 'test-repo' },
          metadata: expect.objectContaining({
            id: 'trigger-123',
            triggerSlug: 'github_webhook',
            toolkitSlug: 'github',
            connectedAccount: expect.objectContaining({
              id: 'conn-123',
              uuid: 'conn-123',
              authConfigId: 'auth-123',
              status: 'ACTIVE',
            }),
          }),
        })
      );
    });

    it('should handle multiple callbacks with different filters', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      // Subscribe with different filters
      await triggers.subscribe(callback1, { toolkits: ['github'] });
      await triggers.subscribe(callback2, { toolkits: ['slack'] });

      const subscribeCall1 = vi.mocked(mockPusherService.subscribe).mock.calls[0];
      const subscribeCall2 = vi.mocked(mockPusherService.subscribe).mock.calls[1];

      // Trigger github event
      subscribeCall1[0](mockTriggerData);
      // Trigger should only call callback1
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).not.toHaveBeenCalled();

      // Reset mocks
      callback1.mockClear();
      callback2.mockClear();

      // Trigger slack event
      const slackTriggerData = {
        ...mockTriggerData,
        appName: 'slack',
        metadata: {
          ...mockTriggerData.metadata,
          triggerName: 'slack_message',
        },
      };

      subscribeCall2[0](slackTriggerData);
      // Trigger should only call callback2
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('should pass the parsed trigger data to callback when filters match', async () => {
      await triggers.subscribe(mockCallback);

      const subscribeCall = vi.mocked(mockPusherService.subscribe).mock.calls[0];
      const filterCallback = subscribeCall[0];

      filterCallback(mockTriggerData);

      expect(mockCallback).toHaveBeenCalledTimes(1);
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'trigger-123',
          triggerSlug: 'github_webhook',
          toolkitSlug: 'github',
          userId: 'user-456',
          payload: { action: 'push', repository: 'test-repo' },
          metadata: expect.objectContaining({
            id: 'trigger-123',
            triggerSlug: 'github_webhook',
            toolkitSlug: 'github',
            triggerConfig: { webhook_url: 'https://example.com/webhook' },
            connectedAccount: expect.objectContaining({
              id: 'conn-123',
              uuid: 'conn-123',
              authConfigId: 'auth-123',
              authConfigUUID: 'github',
              userId: 'user-456',
              status: 'ACTIVE',
            }),
          }),
        })
      );
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe from triggers', async () => {
      await triggers.unsubscribe();
      expect(mockPusherService.unsubscribe).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle API errors gracefully', async () => {
      const apiError = new Error('API request failed');
      mockClient.triggerInstances.listActive.mockRejectedValue(apiError);

      await expect(triggers.listActive()).rejects.toThrow('API request failed');
    });

    it('should handle pusher service errors gracefully', async () => {
      const pusherError = new ComposioFailedToSubscribeToPusherChannelError(
        'Failed to subscribe to Pusher channel'
      );
      mockPusherService.subscribe.mockRejectedValue(pusherError);

      await expect(triggers.subscribe(vi.fn())).rejects.toThrow(
        ComposioFailedToSubscribeToPusherChannelError
      );
    });
  });

  describe('telemetry integration', () => {
    it('should instrument the class for telemetry', () => {
      expect(telemetry.instrument).toHaveBeenCalledWith(triggers);
    });
  });

  describe('subscribe callback handling', () => {
    const mockCallback = vi.fn();

    beforeEach(() => {
      mockCallback.mockClear();
      vi.mocked(logger.debug).mockClear();
    });

    it('should pass the parsed trigger data to callback when filters match', async () => {
      await triggers.subscribe(mockCallback);

      const subscribeCall = vi.mocked(mockPusherService.subscribe).mock.calls[0];
      const filterCallback = subscribeCall[0];

      filterCallback(mockTriggerData);

      expect(mockCallback).toHaveBeenCalledTimes(1);
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'trigger-123',
          triggerSlug: 'github_webhook',
          toolkitSlug: 'github',
          userId: 'user-456',
          payload: { action: 'push', repository: 'test-repo' },
          metadata: expect.objectContaining({
            id: 'trigger-123',
            triggerSlug: 'github_webhook',
            toolkitSlug: 'github',
            triggerConfig: { webhook_url: 'https://example.com/webhook' },
            connectedAccount: expect.objectContaining({
              id: 'conn-123',
              uuid: 'conn-123',
              authConfigId: 'auth-123',
              authConfigUUID: 'github',
              userId: 'user-456',
              status: 'ACTIVE',
            }),
          }),
        })
      );
    });

    it('should not call callback when trigger data does not match filters', async () => {
      const filters: TriggerSubscribeParams = {
        toolkits: ['slack'], // Different toolkit than the mock data
      };

      await triggers.subscribe(mockCallback, filters);

      const subscribeCall = vi.mocked(mockPusherService.subscribe).mock.calls[0];
      const filterCallback = subscribeCall[0];

      filterCallback(mockTriggerData);

      expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should handle errors in user callback without breaking the subscription', async () => {
      const errorCallback = vi.fn().mockImplementation(() => {
        throw new Error('Error in user callback');
      });

      await triggers.subscribe(errorCallback);

      const subscribeCall = vi.mocked(mockPusherService.subscribe).mock.calls[0];
      const filterCallback = subscribeCall[0];

      // This should not throw even though the callback throws
      expect(() => filterCallback(mockTriggerData)).not.toThrow();

      expect(errorCallback).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        '❌ Error in trigger callback:',
        Error('Error in user callback')
      );
    });

    it('should handle invalid trigger data format', async () => {
      const invalidTriggerData = {
        appName: 'github',
        clientId: 123,
        payload: { action: 'push' },
        originalPayload: { action: 'push' },
        metadata: {
          triggerName: 'github_webhook',
        },
      };

      await triggers.subscribe(mockCallback);

      const subscribeCall = vi.mocked(mockPusherService.subscribe).mock.calls[0];
      const filterCallback = subscribeCall[0];

      expect(() => filterCallback(invalidTriggerData)).toThrow(ValidationError);
      expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should handle multiple callbacks with different filters', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      // Subscribe with different filters
      await triggers.subscribe(callback1, { toolkits: ['github'] });
      await triggers.subscribe(callback2, { toolkits: ['slack'] });

      const subscribeCall1 = vi.mocked(mockPusherService.subscribe).mock.calls[0];
      const subscribeCall2 = vi.mocked(mockPusherService.subscribe).mock.calls[1];

      // Trigger github event
      subscribeCall1[0](mockTriggerData);
      // Trigger should only call callback1
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).not.toHaveBeenCalled();

      // Reset mocks
      callback1.mockClear();
      callback2.mockClear();

      // Trigger slack event
      const slackTriggerData = {
        ...mockTriggerData,
        appName: 'slack',
        metadata: {
          ...mockTriggerData.metadata,
          triggerName: 'slack_message',
        },
      };

      subscribeCall2[0](slackTriggerData);
      // Trigger should only call callback2
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledTimes(1);
    });
  });
});
