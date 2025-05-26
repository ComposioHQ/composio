import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Triggers } from '../../src/models/triggers';
import ComposioClient from '@composio/client';
import { Session } from '../../src/models/Session';
import { PusherUtils, TriggerData } from '../../src/utils/pusher';
import logger from '../../src/utils/logger';
import { TriggerStatusEnum, TriggerSubscribeParams } from '../../src/types/triggers.types';
import { telemetry } from '../../src/telemetry/Telemetry';

// Mock dependencies
vi.mock('../../src/models/Session');
vi.mock('../../src/utils/pusher');
vi.mock('../../src/utils/logger');
vi.mock('../../src/telemetry/Telemetry', () => ({
  telemetry: {
    instrument: vi.fn(),
  },
}));

// Create mock client with trigger-related methods
const createMockClient = () => ({
  baseURL: 'https://api.composio.dev',
  apiKey: 'test-api-key',
  triggerInstances: {
    listActive: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    updateStatus: vi.fn(),
  },
  triggersTypes: {
    list: vi.fn(),
    retrieve: vi.fn(),
    retrieveEnum: vi.fn(),
  },
  auth: {
    session: {
      retrieve: vi.fn(),
    },
  },
});

// Mock response data
const mockTriggerInstances = {
  items: [
    {
      id: 'trigger-1',
      slug: 'github_webhook',
      status: 'active',
      connectedAccountId: 'conn-123',
      config: { webhook_url: 'https://example.com/webhook' },
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'trigger-2',
      slug: 'slack_message',
      status: 'inactive',
      connectedAccountId: 'conn-456',
      config: { channel: '#general' },
      createdAt: '2024-01-02T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
    },
  ],
  totalPages: 1,
  page: 1,
  pageSize: 10,
};

const mockTriggerInstance = {
  id: 'trigger-123',
  slug: 'test_trigger',
  status: 'active',
  connectedAccountId: 'conn-123',
  config: { param1: 'value1' },
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
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
    {
      slug: 'slack_message',
      name: 'Slack Message',
      description: 'Triggered when a Slack message is received',
      config: {
        required: ['channel'],
        optional: ['pattern'],
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
  toolkit: {
    slug: 'github',
    name: 'GitHub',
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
    connectionId: 'conn-123',
    triggerName: 'github_webhook',
    triggerData: '{"action":"push"}',
    triggerConfig: { webhook_url: 'https://example.com/webhook' },
    connection: {
      id: 'conn-123',
      integrationId: 'github',
      clientUniqueUserId: 'user-456',
      status: 'active',
    },
  },
};

describe('Triggers', () => {
  let triggers: Triggers;
  let mockClient: ReturnType<typeof createMockClient>;
  let mockSession: Session;

  beforeEach(() => {
    vi.clearAllMocks();

    mockClient = createMockClient();
    triggers = new Triggers(mockClient as unknown as ComposioClient);

    // Mock Session
    mockSession = {
      getInfo: vi.fn().mockResolvedValue(mockSessionInfo),
    } as unknown as Session;
    (Session as any).mockImplementation(() => mockSession);

    // Mock PusherUtils
    vi.mocked(PusherUtils.getPusherClient).mockResolvedValue({} as any);
    vi.mocked(PusherUtils.triggerSubscribe).mockImplementation(() => {});
    vi.mocked(PusherUtils.triggerUnsubscribe).mockImplementation(() => {});
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

      const result = await triggers.list();

      expect(mockClient.triggerInstances.listActive).toHaveBeenCalledWith(undefined, undefined);
      expect(result).toEqual(mockTriggerInstances);
    });

    it('should list active trigger instances with query parameters', async () => {
      const query = { limit: 5, page: 2 };
      const options = { timeout: 5000 };
      mockClient.triggerInstances.listActive.mockResolvedValue(mockTriggerInstances);

      const result = await triggers.list(query, options);

      expect(mockClient.triggerInstances.listActive).toHaveBeenCalledWith(query, options);
      expect(result).toEqual(mockTriggerInstances);
    });
  });

  describe('create', () => {
    it('should create a new trigger instance', async () => {
      const slug = 'github_webhook';
      const body = {
        connectedAccountId: 'conn-123',
        config: { webhook_url: 'https://example.com/webhook' },
      } as any;
      mockClient.triggerInstances.upsert.mockResolvedValue(mockTriggerInstance);

      const result = await triggers.create(slug, body);

      expect(mockClient.triggerInstances.upsert).toHaveBeenCalledWith(slug, body, undefined);
      expect(result).toEqual(mockTriggerInstance);
    });

    it('should create a new trigger instance with options', async () => {
      const slug = 'github_webhook';
      const body = {
        connectedAccountId: 'conn-123',
        config: { webhook_url: 'https://example.com/webhook' },
      } as any;
      const options = { timeout: 5000 };
      mockClient.triggerInstances.upsert.mockResolvedValue(mockTriggerInstance);

      const result = await triggers.create(slug, body, options);

      expect(mockClient.triggerInstances.upsert).toHaveBeenCalledWith(slug, body, options);
      expect(result).toEqual(mockTriggerInstance);
    });
  });

  describe('update', () => {
    it('should update an existing trigger instance', async () => {
      const slug = 'github_webhook';
      const body = {
        connectedAccountId: 'conn-123',
        config: { webhook_url: 'https://updated.example.com/webhook' },
      } as any;
      mockClient.triggerInstances.upsert.mockResolvedValue(mockTriggerInstance);

      const result = await triggers.update(slug, body);

      expect(mockClient.triggerInstances.upsert).toHaveBeenCalledWith(slug, body);
      expect(result).toEqual(mockTriggerInstance);
    });
  });

  describe('delete', () => {
    it('should delete a trigger instance', async () => {
      const triggerId = 'trigger-123';
      const deleteResponse = { success: true, message: 'Trigger deleted successfully' };
      mockClient.triggerInstances.delete.mockResolvedValue(deleteResponse);

      const result = await triggers.delete(triggerId);

      expect(mockClient.triggerInstances.delete).toHaveBeenCalledWith(triggerId);
      expect(result).toEqual(deleteResponse);
    });
  });

  describe('updateStatus', () => {
    it('should update the status of a trigger', async () => {
      const status: TriggerStatusEnum = 'enable';
      const params = { triggerId: 'trigger-123' };
      const options = { timeout: 5000 };
      mockClient.triggerInstances.updateStatus.mockResolvedValue(mockTriggerInstance);

      const result = await triggers.updateStatus(status, params, options);

      expect(mockClient.triggerInstances.updateStatus).toHaveBeenCalledWith(
        status,
        params,
        options
      );
      expect(result).toEqual(mockTriggerInstance);
    });

    it('should update the status without options', async () => {
      const status: TriggerStatusEnum = 'disable';
      const params = { triggerId: 'trigger-123' };
      mockClient.triggerInstances.updateStatus.mockResolvedValue(mockTriggerInstance);

      const result = await triggers.updateStatus(status, params);

      expect(mockClient.triggerInstances.updateStatus).toHaveBeenCalledWith(
        status,
        params,
        undefined
      );
      expect(result).toEqual(mockTriggerInstance);
    });
  });

  describe('disable', () => {
    it('should disable a trigger instance', async () => {
      const triggerId = 'trigger-123';
      mockClient.triggerInstances.updateStatus.mockResolvedValue(mockTriggerInstance);

      const result = await triggers.disable(triggerId);

      expect(mockClient.triggerInstances.updateStatus).toHaveBeenCalledWith(
        'disable',
        { triggerId },
        undefined
      );
      expect(result).toEqual(mockTriggerInstance);
    });

    it('should disable a trigger instance with options', async () => {
      const triggerId = 'trigger-123';
      const options = { timeout: 5000 };
      mockClient.triggerInstances.updateStatus.mockResolvedValue(mockTriggerInstance);

      const result = await triggers.disable(triggerId, options);

      expect(mockClient.triggerInstances.updateStatus).toHaveBeenCalledWith(
        'disable',
        { triggerId },
        options
      );
      expect(result).toEqual(mockTriggerInstance);
    });
  });

  describe('enable', () => {
    it('should enable a trigger instance', async () => {
      const triggerId = 'trigger-123';
      mockClient.triggerInstances.updateStatus.mockResolvedValue(mockTriggerInstance);

      const result = await triggers.enable(triggerId);

      expect(mockClient.triggerInstances.updateStatus).toHaveBeenCalledWith(
        'enable',
        { triggerId },
        undefined
      );
      expect(result).toEqual(mockTriggerInstance);
    });

    it('should enable a trigger instance with options', async () => {
      const triggerId = 'trigger-123';
      const options = { timeout: 5000 };
      mockClient.triggerInstances.updateStatus.mockResolvedValue(mockTriggerInstance);

      const result = await triggers.enable(triggerId, options);

      expect(mockClient.triggerInstances.updateStatus).toHaveBeenCalledWith(
        'enable',
        { triggerId },
        options
      );
      expect(result).toEqual(mockTriggerInstance);
    });
  });

  describe('listTypes', () => {
    it('should list all trigger types', async () => {
      mockClient.triggersTypes.list.mockResolvedValue(mockTriggerTypes);

      const result = await triggers.listTypes();

      expect(mockClient.triggersTypes.list).toHaveBeenCalledWith(undefined, undefined);
      expect(result).toEqual(mockTriggerTypes);
    });

    it('should list trigger types with query parameters', async () => {
      const query = { limit: 10, toolkit: 'github' };
      const options = { timeout: 5000 };
      mockClient.triggersTypes.list.mockResolvedValue(mockTriggerTypes);

      const result = await triggers.listTypes(query, options);

      expect(mockClient.triggersTypes.list).toHaveBeenCalledWith(query, options);
      expect(result).toEqual(mockTriggerTypes);
    });
  });

  describe('getType', () => {
    it('should retrieve a trigger type by slug', async () => {
      const slug = 'github_webhook';
      mockClient.triggersTypes.retrieve.mockResolvedValue(mockTriggerType);

      const result = await triggers.getType(slug);

      expect(mockClient.triggersTypes.retrieve).toHaveBeenCalledWith(slug, undefined);
      expect(result).toEqual(mockTriggerType);
    });

    it('should retrieve a trigger type with options', async () => {
      const slug = 'github_webhook';
      const options = { timeout: 5000 };
      mockClient.triggersTypes.retrieve.mockResolvedValue(mockTriggerType);

      const result = await triggers.getType(slug, options);

      expect(mockClient.triggersTypes.retrieve).toHaveBeenCalledWith(slug, options);
      expect(result).toEqual(mockTriggerType);
    });
  });

  describe('listEnum', () => {
    it('should fetch the list of all available trigger enums', async () => {
      mockClient.triggersTypes.retrieveEnum.mockResolvedValue(mockTriggerEnum);

      const result = await triggers.listEnum();

      expect(mockClient.triggersTypes.retrieveEnum).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(mockTriggerEnum);
    });

    it('should fetch trigger enums with options', async () => {
      const options = { timeout: 5000 };
      mockClient.triggersTypes.retrieveEnum.mockResolvedValue(mockTriggerEnum);

      const result = await triggers.listEnum(options);

      expect(mockClient.triggersTypes.retrieveEnum).toHaveBeenCalledWith(options);
      expect(result).toEqual(mockTriggerEnum);
    });
  });

  describe('subscribe', () => {
    const mockCallback = vi.fn();

    beforeEach(() => {
      mockCallback.mockClear();
    });

    it('should throw error if function is not provided', async () => {
      await expect(triggers.subscribe(null as any)).rejects.toThrow(
        'Function is required for trigger subscription'
      );
    });

    it('should throw error if client ID is not found', async () => {
      mockSession.getInfo = vi.fn().mockResolvedValue({ project: null });

      await expect(triggers.subscribe(mockCallback)).rejects.toThrow('Client ID not found');
    });

    it('should throw error if API key is not found', async () => {
      mockClient.apiKey = undefined as any;

      await expect(triggers.subscribe(mockCallback)).rejects.toThrow('API key not found');
    });

    it('should subscribe to triggers without filters', async () => {
      await triggers.subscribe(mockCallback);

      expect(mockSession.getInfo).toHaveBeenCalled();
      expect(PusherUtils.getPusherClient).toHaveBeenCalledWith(
        mockClient.baseURL,
        mockClient.apiKey
      );
      expect(PusherUtils.triggerSubscribe).toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('Subscribing to triggers', {});
    });

    it('should subscribe to triggers with filters', async () => {
      const filters: TriggerSubscribeParams = {
        appName: 'github',
        triggerId: 'trigger-123',
        connectionId: 'conn-123',
      };

      await triggers.subscribe(mockCallback, filters);

      expect(mockSession.getInfo).toHaveBeenCalled();
      expect(PusherUtils.getPusherClient).toHaveBeenCalledWith(
        mockClient.baseURL,
        mockClient.apiKey
      );
      expect(PusherUtils.triggerSubscribe).toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('Subscribing to triggers', filters);
    });

    it('should filter triggers based on appName', async () => {
      const filters: TriggerSubscribeParams = { appName: 'github' };
      await triggers.subscribe(mockCallback, filters);

      // Get the filter function that was passed to PusherUtils.triggerSubscribe
      const triggerSubscribeCall = vi.mocked(PusherUtils.triggerSubscribe).mock.calls[0];
      const filterCallback = triggerSubscribeCall[1];

      // Test data that should match the filter
      const matchingData = { ...mockTriggerData, appName: 'github' };
      const nonMatchingData = { ...mockTriggerData, appName: 'slack' };

      filterCallback(matchingData);
      filterCallback(nonMatchingData);

      expect(mockCallback).toHaveBeenCalledWith(matchingData);
      expect(mockCallback).toHaveBeenCalledTimes(1);
    });

    it('should filter triggers based on triggerId', async () => {
      const filters: TriggerSubscribeParams = { triggerId: 'trigger-123' };
      await triggers.subscribe(mockCallback, filters);

      const triggerSubscribeCall = vi.mocked(PusherUtils.triggerSubscribe).mock.calls[0];
      const filterCallback = triggerSubscribeCall[1];

      const matchingData = { ...mockTriggerData };
      const nonMatchingData = {
        ...mockTriggerData,
        metadata: { ...mockTriggerData.metadata, id: 'trigger-456' },
      };

      filterCallback(matchingData);
      filterCallback(nonMatchingData);

      expect(mockCallback).toHaveBeenCalledWith(matchingData);
      expect(mockCallback).toHaveBeenCalledTimes(1);
    });

    it('should filter triggers based on connectionId', async () => {
      const filters: TriggerSubscribeParams = { connectionId: 'conn-123' };
      await triggers.subscribe(mockCallback, filters);

      const triggerSubscribeCall = vi.mocked(PusherUtils.triggerSubscribe).mock.calls[0];
      const filterCallback = triggerSubscribeCall[1];

      const matchingData = { ...mockTriggerData };
      const nonMatchingData = {
        ...mockTriggerData,
        metadata: { ...mockTriggerData.metadata, connectionId: 'conn-456' },
      };

      filterCallback(matchingData);
      filterCallback(nonMatchingData);

      expect(mockCallback).toHaveBeenCalledWith(matchingData);
      expect(mockCallback).toHaveBeenCalledTimes(1);
    });

    it('should filter triggers based on triggerName', async () => {
      const filters: TriggerSubscribeParams = { triggerName: 'github_webhook' };
      await triggers.subscribe(mockCallback, filters);

      const triggerSubscribeCall = vi.mocked(PusherUtils.triggerSubscribe).mock.calls[0];
      const filterCallback = triggerSubscribeCall[1];

      const matchingData = { ...mockTriggerData };
      const nonMatchingData = {
        ...mockTriggerData,
        metadata: { ...mockTriggerData.metadata, triggerName: 'slack_message' },
      };

      filterCallback(matchingData);
      filterCallback(nonMatchingData);

      expect(mockCallback).toHaveBeenCalledWith(matchingData);
      expect(mockCallback).toHaveBeenCalledTimes(1);
    });

    it('should filter triggers based on entityId', async () => {
      const filters: TriggerSubscribeParams = { entityId: 'user-456' };
      await triggers.subscribe(mockCallback, filters);

      const triggerSubscribeCall = vi.mocked(PusherUtils.triggerSubscribe).mock.calls[0];
      const filterCallback = triggerSubscribeCall[1];

      const matchingData = { ...mockTriggerData };
      const nonMatchingData = {
        ...mockTriggerData,
        metadata: {
          ...mockTriggerData.metadata,
          connection: {
            ...mockTriggerData.metadata.connection,
            clientUniqueUserId: 'user-789',
          },
        },
      };

      filterCallback(matchingData);
      filterCallback(nonMatchingData);

      expect(mockCallback).toHaveBeenCalledWith(matchingData);
      expect(mockCallback).toHaveBeenCalledTimes(1);
    });

    it('should filter triggers based on integrationId', async () => {
      const filters: TriggerSubscribeParams = { integrationId: 'github' };
      await triggers.subscribe(mockCallback, filters);

      const triggerSubscribeCall = vi.mocked(PusherUtils.triggerSubscribe).mock.calls[0];
      const filterCallback = triggerSubscribeCall[1];

      const matchingData = { ...mockTriggerData };
      const nonMatchingData = {
        ...mockTriggerData,
        metadata: {
          ...mockTriggerData.metadata,
          connection: {
            ...mockTriggerData.metadata.connection,
            integrationId: 'slack',
          },
        },
      };

      filterCallback(matchingData);
      filterCallback(nonMatchingData);

      expect(mockCallback).toHaveBeenCalledWith(matchingData);
      expect(mockCallback).toHaveBeenCalledTimes(1);
    });

    it('should apply multiple filters correctly', async () => {
      const filters: TriggerSubscribeParams = {
        appName: 'github',
        triggerId: 'trigger-123',
        connectionId: 'conn-123',
      };
      await triggers.subscribe(mockCallback, filters);

      const triggerSubscribeCall = vi.mocked(PusherUtils.triggerSubscribe).mock.calls[0];
      const filterCallback = triggerSubscribeCall[1];

      const matchingData = { ...mockTriggerData, appName: 'github' };
      const nonMatchingDataApp = { ...mockTriggerData, appName: 'slack' };
      const nonMatchingDataTrigger = {
        ...mockTriggerData,
        appName: 'github',
        metadata: { ...mockTriggerData.metadata, id: 'trigger-456' },
      };

      filterCallback(matchingData);
      filterCallback(nonMatchingDataApp);
      filterCallback(nonMatchingDataTrigger);

      expect(mockCallback).toHaveBeenCalledWith(matchingData);
      expect(mockCallback).toHaveBeenCalledTimes(1);
    });

    it('should pass all triggers when no filters are provided', async () => {
      await triggers.subscribe(mockCallback);

      const triggerSubscribeCall = vi.mocked(PusherUtils.triggerSubscribe).mock.calls[0];
      const filterCallback = triggerSubscribeCall[1];

      const testData1 = { ...mockTriggerData, appName: 'github' };
      const testData2 = { ...mockTriggerData, appName: 'slack' };

      filterCallback(testData1);
      filterCallback(testData2);

      expect(mockCallback).toHaveBeenCalledWith(testData1);
      expect(mockCallback).toHaveBeenCalledWith(testData2);
      expect(mockCallback).toHaveBeenCalledTimes(2);
    });

    it('should be case insensitive for filters', async () => {
      const filters: TriggerSubscribeParams = { appName: 'GITHUB' };
      await triggers.subscribe(mockCallback, filters);

      const triggerSubscribeCall = vi.mocked(PusherUtils.triggerSubscribe).mock.calls[0];
      const filterCallback = triggerSubscribeCall[1];

      const matchingData = { ...mockTriggerData, appName: 'github' };

      filterCallback(matchingData);

      expect(mockCallback).toHaveBeenCalledWith(matchingData);
      expect(mockCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe from triggers', async () => {
      await triggers.unsubscribe();

      expect(mockSession.getInfo).toHaveBeenCalled();
      expect(PusherUtils.triggerUnsubscribe).toHaveBeenCalledWith('client-123');
    });

    it('should throw error if client ID is not found during unsubscribe', async () => {
      mockSession.getInfo = vi.fn().mockResolvedValue({ project: null });

      await expect(triggers.unsubscribe()).rejects.toThrow('Client ID not found');
    });
  });

  describe('error handling', () => {
    it('should handle API errors gracefully', async () => {
      const apiError = new Error('API request failed');
      mockClient.triggerInstances.listActive.mockRejectedValue(apiError);

      await expect(triggers.list()).rejects.toThrow('API request failed');
    });

    it('should handle session retrieval errors', async () => {
      const sessionError = new Error('Session retrieval failed');
      mockSession.getInfo = vi.fn().mockRejectedValue(sessionError);

      await expect(triggers.subscribe(vi.fn())).rejects.toThrow('Session retrieval failed');
    });

    it('should handle pusher client errors gracefully', async () => {
      const pusherError = new Error('Pusher connection failed');
      vi.mocked(PusherUtils.getPusherClient).mockRejectedValue(pusherError);

      await expect(triggers.subscribe(vi.fn())).rejects.toThrow('Pusher connection failed');
    });
  });

  describe('telemetry integration', () => {
    it('should instrument the class for telemetry', () => {
      expect(telemetry.instrument).toHaveBeenCalledWith(triggers);
    });
  });
});
