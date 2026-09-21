import { describe, it, expect, vi, beforeEach } from 'vitest';
import ComposioClient from '@composio/client';
import { Webhooks, WebhookSubscriptions, WebhookEndpoints } from '../../src/models/Webhooks';
import { telemetry } from '../../src/telemetry/Telemetry';
import { ValidationError } from '../../src/errors/ValidationErrors';

vi.mock('../../src/telemetry/Telemetry', () => ({
  telemetry: {
    instrument: vi.fn(),
  },
}));

const createMockClient = () => ({
  baseURL: 'https://api.composio.dev',
  apiKey: 'test-api-key',
  webhookSubscriptions: {
    list: vi.fn(),
    retrieve: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    rotateSecret: vi.fn(),
    listEventTypes: vi.fn(),
  },
  webhookEndpoints: {
    list: vi.fn(),
    retrieve: vi.fn(),
    create: vi.fn(),
    replace: vi.fn(),
    update: vi.fn(),
  },
});

const webhookUrl = 'https://example.com/webhooks/composio';
const rawSubscription = {
  id: 'sub_123',
  webhook_url: webhookUrl,
  version: 'V3',
  enabled_events: ['composio.trigger.message'],
  secret: 'whsec_123',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};
const transformedSubscription = {
  id: 'sub_123',
  webhookUrl,
  version: 'V3',
  enabledEvents: ['composio.trigger.message'],
  secret: 'whsec_123',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const rawEndpoint = {
  id: 'we_abc123',
  toolkit_slug: 'slack',
  client_id: 'client_1',
  webhook_url: 'https://backend.composio.dev/webhook/slack/we_abc123',
  data: { signing_secret: '***' },
  created_at: '2026-01-01T00:00:00Z',
};
const transformedEndpoint = {
  id: 'we_abc123',
  toolkitSlug: 'slack',
  clientId: 'client_1',
  webhookUrl: 'https://backend.composio.dev/webhook/slack/we_abc123',
  data: { signing_secret: '***' },
  createdAt: '2026-01-01T00:00:00Z',
};

describe('Webhooks', () => {
  let webhooks: Webhooks;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    webhooks = new Webhooks(mockClient as unknown as ComposioClient);
  });

  describe('constructor', () => {
    it('mounts the subscriptions and endpoints sub-namespaces', () => {
      expect(webhooks.subscriptions).toBeInstanceOf(WebhookSubscriptions);
      expect(webhooks.endpoints).toBeInstanceOf(WebhookEndpoints);
    });

    it('instruments every class with telemetry', () => {
      expect(telemetry.instrument).toHaveBeenCalledWith(webhooks, 'Webhooks');
      expect(telemetry.instrument).toHaveBeenCalledWith(
        webhooks.subscriptions,
        'WebhookSubscriptions'
      );
      expect(telemetry.instrument).toHaveBeenCalledWith(webhooks.endpoints, 'WebhookEndpoints');
    });
  });

  describe('subscriptions', () => {
    describe('list', () => {
      it('lists subscriptions and transforms the response', async () => {
        mockClient.webhookSubscriptions.list.mockResolvedValue({
          items: [rawSubscription],
          next_cursor: null,
          total_pages: 1,
          current_page: 1,
          total_items: 1,
        });

        const result = await webhooks.subscriptions.list();

        expect(mockClient.webhookSubscriptions.list).toHaveBeenCalledWith(
          { limit: undefined, cursor: undefined },
          undefined
        );
        expect(result).toEqual({
          items: [transformedSubscription],
          nextCursor: null,
          totalPages: 1,
          currentPage: 1,
          totalItems: 1,
        });
      });

      it('forwards pagination params and request options', async () => {
        mockClient.webhookSubscriptions.list.mockResolvedValue({
          items: [],
          next_cursor: 'next',
          total_pages: 2,
          current_page: 1,
          total_items: 3,
        });
        const signal = new AbortController().signal;

        const result = await webhooks.subscriptions.list({ limit: 2, cursor: 'abc' }, { signal });

        expect(mockClient.webhookSubscriptions.list).toHaveBeenCalledWith(
          { limit: 2, cursor: 'abc' },
          { signal }
        );
        expect(result.nextCursor).toBe('next');
      });

      it('throws a ValidationError for invalid params', async () => {
        await expect(
          webhooks.subscriptions.list({ limit: 'ten' } as unknown as { limit: number })
        ).rejects.toThrow(ValidationError);
        expect(mockClient.webhookSubscriptions.list).not.toHaveBeenCalled();
      });
    });

    describe('get', () => {
      it('retrieves a subscription by id', async () => {
        mockClient.webhookSubscriptions.retrieve.mockResolvedValue(rawSubscription);

        const result = await webhooks.subscriptions.get('sub_123');

        expect(mockClient.webhookSubscriptions.retrieve).toHaveBeenCalledWith('sub_123', undefined);
        expect(result).toEqual(transformedSubscription);
      });
    });

    describe('set', () => {
      it('creates a subscription when none exists', async () => {
        mockClient.webhookSubscriptions.list.mockResolvedValue({ items: [] });
        mockClient.webhookSubscriptions.create.mockResolvedValue(rawSubscription);

        const result = await webhooks.subscriptions.set({ webhookUrl });

        expect(mockClient.webhookSubscriptions.list).toHaveBeenCalledWith({ limit: 1 }, undefined);
        expect(mockClient.webhookSubscriptions.create).toHaveBeenCalledWith(
          {
            webhook_url: webhookUrl,
            enabled_events: ['composio.trigger.message'],
            version: 'V3',
          },
          undefined
        );
        expect(mockClient.webhookSubscriptions.update).not.toHaveBeenCalled();
        expect(result).toEqual(transformedSubscription);
      });

      it('updates the existing subscription when one exists', async () => {
        mockClient.webhookSubscriptions.list.mockResolvedValue({ items: [{ id: 'sub_123' }] });
        mockClient.webhookSubscriptions.update.mockResolvedValue(rawSubscription);

        await webhooks.subscriptions.set({
          webhookUrl,
          enabledEvents: ['composio.trigger.message', 'composio.connected_account.expired'],
          version: 'V2',
        });

        expect(mockClient.webhookSubscriptions.update).toHaveBeenCalledWith(
          'sub_123',
          {
            webhook_url: webhookUrl,
            enabled_events: ['composio.trigger.message', 'composio.connected_account.expired'],
            version: 'V2',
          },
          undefined
        );
        expect(mockClient.webhookSubscriptions.create).not.toHaveBeenCalled();
      });

      it('forwards request options to both calls', async () => {
        mockClient.webhookSubscriptions.list.mockResolvedValue({ items: [] });
        mockClient.webhookSubscriptions.create.mockResolvedValue(rawSubscription);
        const signal = new AbortController().signal;

        await webhooks.subscriptions.set({ webhookUrl }, { signal });

        expect(mockClient.webhookSubscriptions.list).toHaveBeenCalledWith({ limit: 1 }, { signal });
        expect(mockClient.webhookSubscriptions.create).toHaveBeenCalledWith(expect.any(Object), {
          signal,
        });
      });

      it('throws a ValidationError for invalid params before any request', async () => {
        await expect(webhooks.subscriptions.set({ webhookUrl, enabledEvents: [] })).rejects.toThrow(
          ValidationError
        );
        expect(mockClient.webhookSubscriptions.list).not.toHaveBeenCalled();
      });

      it('throws a ValidationError when the list probe is malformed', async () => {
        mockClient.webhookSubscriptions.list.mockResolvedValue({ items: [{ id: 42 }] });

        await expect(webhooks.subscriptions.set({ webhookUrl })).rejects.toThrow(ValidationError);
        expect(mockClient.webhookSubscriptions.create).not.toHaveBeenCalled();
        expect(mockClient.webhookSubscriptions.update).not.toHaveBeenCalled();
      });
    });

    describe('update', () => {
      it('updates only the provided fields', async () => {
        mockClient.webhookSubscriptions.update.mockResolvedValue(rawSubscription);

        const result = await webhooks.subscriptions.update('sub_123', {
          enabledEvents: ['composio.trigger.message'],
        });

        expect(mockClient.webhookSubscriptions.update).toHaveBeenCalledWith(
          'sub_123',
          {
            webhook_url: undefined,
            enabled_events: ['composio.trigger.message'],
            version: undefined,
          },
          undefined
        );
        expect(result).toEqual(transformedSubscription);
      });

      it('throws a ValidationError for invalid params', async () => {
        await expect(
          webhooks.subscriptions.update('sub_123', { version: 'V9' as 'V3' })
        ).rejects.toThrow(ValidationError);
        expect(mockClient.webhookSubscriptions.update).not.toHaveBeenCalled();
      });
    });

    describe('delete', () => {
      it('deletes a subscription', async () => {
        mockClient.webhookSubscriptions.delete.mockResolvedValue({ success: true });

        const result = await webhooks.subscriptions.delete('sub_123');

        expect(mockClient.webhookSubscriptions.delete).toHaveBeenCalledWith('sub_123', undefined);
        expect(result).toEqual({ success: true });
      });
    });

    describe('rotateSecret', () => {
      it('rotates the signing secret', async () => {
        mockClient.webhookSubscriptions.rotateSecret.mockResolvedValue({
          id: 'sub_123',
          secret: 'whsec_new',
        });

        const result = await webhooks.subscriptions.rotateSecret('sub_123');

        expect(mockClient.webhookSubscriptions.rotateSecret).toHaveBeenCalledWith(
          'sub_123',
          undefined
        );
        expect(result).toEqual({ id: 'sub_123', secret: 'whsec_new' });
      });
    });

    describe('listEventTypes', () => {
      it('lists event types in camelCase', async () => {
        mockClient.webhookSubscriptions.listEventTypes.mockResolvedValue({
          items: [
            {
              event_type: 'composio.trigger.message',
              description: 'Trigger fired',
              supported_versions: ['V2', 'V3'],
            },
          ],
        });

        const result = await webhooks.subscriptions.listEventTypes();

        expect(mockClient.webhookSubscriptions.listEventTypes).toHaveBeenCalledWith(undefined);
        expect(result).toEqual({
          items: [
            {
              eventType: 'composio.trigger.message',
              description: 'Trigger fired',
              supportedVersions: ['V2', 'V3'],
            },
          ],
        });
      });
    });
  });

  describe('endpoints', () => {
    describe('list', () => {
      it('lists endpoints without a filter', async () => {
        mockClient.webhookEndpoints.list.mockResolvedValue({
          items: [{ id: 'we_abc123', toolkit_slug: 'slack', client_id: null }],
        });

        const result = await webhooks.endpoints.list();

        expect(mockClient.webhookEndpoints.list).toHaveBeenCalledWith(
          { toolkit_slug: undefined },
          undefined
        );
        expect(result).toEqual({
          items: [{ id: 'we_abc123', toolkitSlug: 'slack', clientId: null }],
        });
      });

      it('maps the toolkitSlug filter to toolkit_slug', async () => {
        mockClient.webhookEndpoints.list.mockResolvedValue({ items: [] });

        await webhooks.endpoints.list({ toolkitSlug: 'slack' });

        expect(mockClient.webhookEndpoints.list).toHaveBeenCalledWith(
          { toolkit_slug: 'slack' },
          undefined
        );
      });
    });

    describe('get', () => {
      it('retrieves an endpoint by nano id', async () => {
        mockClient.webhookEndpoints.retrieve.mockResolvedValue(rawEndpoint);

        const result = await webhooks.endpoints.get('we_abc123');

        expect(mockClient.webhookEndpoints.retrieve).toHaveBeenCalledWith('we_abc123', undefined);
        expect(result).toEqual(transformedEndpoint);
      });
    });

    describe('create', () => {
      it('creates an endpoint for a toolkit and OAuth app', async () => {
        mockClient.webhookEndpoints.create.mockResolvedValue(rawEndpoint);

        const result = await webhooks.endpoints.create({
          toolkitSlug: 'slack',
          clientId: 'client_1',
        });

        expect(mockClient.webhookEndpoints.create).toHaveBeenCalledWith(
          { toolkit_slug: 'slack', client_id: 'client_1' },
          undefined
        );
        expect(result).toEqual(transformedEndpoint);
      });

      it('throws a ValidationError when required fields are missing', async () => {
        await expect(
          webhooks.endpoints.create({ toolkitSlug: 'slack' } as {
            toolkitSlug: string;
            clientId: string;
          })
        ).rejects.toThrow(ValidationError);
        expect(mockClient.webhookEndpoints.create).not.toHaveBeenCalled();
      });
    });

    describe('replace', () => {
      it('replaces the setup fields', async () => {
        mockClient.webhookEndpoints.replace.mockResolvedValue(rawEndpoint);

        const result = await webhooks.endpoints.replace('we_abc123', {
          data: { signing_secret: 'secret' },
        });

        expect(mockClient.webhookEndpoints.replace).toHaveBeenCalledWith(
          'we_abc123',
          { data: { signing_secret: 'secret' } },
          undefined
        );
        expect(result).toEqual(transformedEndpoint);
      });

      it('throws a ValidationError for non-string values', async () => {
        await expect(
          webhooks.endpoints.replace('we_abc123', {
            data: { enabled: true } as unknown as Record<string, string>,
          })
        ).rejects.toThrow(ValidationError);
        expect(mockClient.webhookEndpoints.replace).not.toHaveBeenCalled();
      });
    });

    describe('update', () => {
      it('merges the setup fields', async () => {
        mockClient.webhookEndpoints.update.mockResolvedValue(rawEndpoint);

        const result = await webhooks.endpoints.update('we_abc123', {
          data: { signing_secret: 'rotated' },
        });

        expect(mockClient.webhookEndpoints.update).toHaveBeenCalledWith(
          'we_abc123',
          { data: { signing_secret: 'rotated' } },
          undefined
        );
        expect(result).toEqual(transformedEndpoint);
      });
    });
  });
});
