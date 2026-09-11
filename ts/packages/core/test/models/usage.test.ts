import { describe, it, expect, vi, beforeEach } from 'vitest';
import ComposioClient from '@composio/client';
import { Experimental } from '../../src/models/Experimental';
import { Usage } from '../../src/models/Usage';
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
  connectedAccounts: {
    patch: vi.fn(),
  },
  project: {
    usage: {
      retrieveSummary: vi.fn(),
      retrieve: vi.fn(),
    },
  },
});

describe('Experimental.usage', () => {
  let experimental: Experimental;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    experimental = new Experimental(mockClient as unknown as ComposioClient);
  });

  it('mounts usage on the experimental namespace and instruments it', () => {
    expect(experimental.usage).toBeInstanceOf(Usage);
    expect(telemetry.instrument).toHaveBeenCalledWith(experimental.usage, 'Usage');
    expect(telemetry.instrument).toHaveBeenCalledWith(experimental, 'Experimental');
  });

  describe('summary', () => {
    it('sends an empty body when called without params', async () => {
      mockClient.project.usage.retrieveSummary.mockResolvedValue({ entities: {} });

      const result = await experimental.usage.summary();

      expect(mockClient.project.usage.retrieveSummary).toHaveBeenCalledWith(
        { from: undefined, to: undefined, entity_types: undefined, filters: undefined },
        undefined
      );
      expect(result).toEqual({ entities: {} });
    });

    it('maps params to the wire and transforms the response', async () => {
      mockClient.project.usage.retrieveSummary.mockResolvedValue({
        entities: {
          tool_calls: { unit: 'call', total_quantity: '42', event_count: 42 },
          sessions: { unit: 'session', total_quantity: '3', event_count: 3 },
        },
      });
      const signal = new AbortController().signal;

      const result = await experimental.usage.summary(
        {
          from: 1,
          to: 2,
          entityTypes: ['tool_calls', 'sessions'],
          filters: { userId: ['user_1'], sessionId: null },
        },
        { signal }
      );

      expect(mockClient.project.usage.retrieveSummary).toHaveBeenCalledWith(
        {
          from: 1,
          to: 2,
          entity_types: ['tool_calls', 'sessions'],
          filters: { user_id: ['user_1'], session_id: null },
        },
        { signal }
      );
      expect(result).toEqual({
        entities: {
          tool_calls: { unit: 'call', totalQuantity: '42', eventCount: 42 },
          sessions: { unit: 'session', totalQuantity: '3', eventCount: 3 },
        },
      });
    });

    it('throws a ValidationError for invalid params', async () => {
      await expect(
        experimental.usage.summary({ from: 'yesterday' as unknown as number })
      ).rejects.toThrow(ValidationError);
      expect(mockClient.project.usage.retrieveSummary).not.toHaveBeenCalled();
    });
  });

  describe('breakdown', () => {
    it('passes the entity type positionally and maps params', async () => {
      mockClient.project.usage.retrieve.mockResolvedValue({
        entity_type: 'tool_calls',
        unit: 'call',
        total_quantity: '10',
        event_count: 10,
        groups: [{ key: 'GITHUB_GET_REPO', total_quantity: '10', event_count: 10 }],
      });

      const result = await experimental.usage.breakdown('tool_calls', {
        groupBy: 'tool_slug',
        orderBy: 'event_count',
        orderDirection: 'asc',
        limit: 5,
        filters: { sessionId: ['trs_1'] },
      });

      expect(mockClient.project.usage.retrieve).toHaveBeenCalledWith(
        'tool_calls',
        {
          from: undefined,
          to: undefined,
          group_by: 'tool_slug',
          order_by: 'event_count',
          order_direction: 'asc',
          limit: 5,
          filters: { user_id: undefined, session_id: ['trs_1'] },
        },
        undefined
      );
      expect(result).toEqual({
        entityType: 'tool_calls',
        unit: 'call',
        totalQuantity: '10',
        eventCount: 10,
        groups: [{ key: 'GITHUB_GET_REPO', totalQuantity: '10', eventCount: 10 }],
      });
    });

    it('throws a ValidationError for an unknown orderBy', async () => {
      await expect(
        experimental.usage.breakdown('tool_calls', { orderBy: 'name' as 'key' })
      ).rejects.toThrow(ValidationError);
      expect(mockClient.project.usage.retrieve).not.toHaveBeenCalled();
    });
  });
});
