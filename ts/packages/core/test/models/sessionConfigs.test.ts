import { describe, it, expect, vi, beforeEach } from 'vitest';
import ComposioClient, {
  APIUserAbortError,
  NotFoundError,
  PermissionDeniedError,
} from '@composio/client';
import { SessionConfigs } from '../../src/models/SessionConfigs';
import { telemetry } from '../../src/telemetry/Telemetry';
import { ValidationError } from '../../src/errors/ValidationErrors';
import { ComposioRequestCancelledError } from '../../src/errors/SDKErrors';

vi.mock('../../src/telemetry/Telemetry', () => ({
  telemetry: {
    instrument: vi.fn(),
  },
}));

const createMockClient = () => ({
  baseURL: 'https://api.composio.dev',
  apiKey: 'test-api-key',
  sessionConfigs: {
    list: vi.fn(),
    retrieve: vi.fn(),
  },
});

const rawSummary = {
  id: 'sc_1',
  name: 'Daily digest',
  archived: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
};
const summary = {
  id: 'sc_1',
  name: 'Daily digest',
  archived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

describe('SessionConfigs', () => {
  let sessionConfigs: SessionConfigs;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    sessionConfigs = new SessionConfigs(mockClient as unknown as ComposioClient);
  });

  it('instruments the class with telemetry', () => {
    expect(telemetry.instrument).toHaveBeenCalledWith(sessionConfigs, 'SessionConfigs');
  });

  describe('list', () => {
    it('sends an empty query when called without params', async () => {
      mockClient.sessionConfigs.list.mockResolvedValue({ items: [], next_cursor: null });

      const result = await sessionConfigs.list();

      expect(mockClient.sessionConfigs.list).toHaveBeenCalledWith({}, undefined);
      expect(result).toEqual({ items: [], nextCursor: null });
    });

    it('forwards search, archived, limit and cursor unchanged', async () => {
      mockClient.sessionConfigs.list.mockResolvedValue({ items: [], next_cursor: null });
      const signal = new AbortController().signal;

      await sessionConfigs.list(
        { search: 'Daily', archived: true, limit: 50, cursor: 'c1' },
        { signal }
      );

      expect(mockClient.sessionConfigs.list).toHaveBeenCalledWith(
        { search: 'Daily', archived: true, limit: 50, cursor: 'c1' },
        { signal }
      );
    });

    it('forwards a limit above the backend cap without clamping', async () => {
      mockClient.sessionConfigs.list.mockResolvedValue({ items: [], next_cursor: null });

      await sessionConfigs.list({ limit: 500 });

      expect(mockClient.sessionConfigs.list).toHaveBeenCalledWith({ limit: 500 }, undefined);
    });

    it('camelCases each item and the next cursor, keeping ISO strings unchanged', async () => {
      mockClient.sessionConfigs.list.mockResolvedValue({
        items: [rawSummary, { ...rawSummary, id: 'sc_2', archived: true }],
        next_cursor: 'c2',
      });

      const result = await sessionConfigs.list();

      expect(result).toEqual({
        items: [summary, { ...summary, id: 'sc_2', archived: true }],
        nextCursor: 'c2',
      });
    });

    it('returns a null next cursor on the last page', async () => {
      mockClient.sessionConfigs.list.mockResolvedValue({
        items: [rawSummary],
        next_cursor: null,
      });

      const result = await sessionConfigs.list({ cursor: 'c2' });

      expect(result.nextCursor).toBeNull();
    });

    it('throws a ValidationError for a non-numeric limit and makes no call', async () => {
      await expect(
        sessionConfigs.list({ limit: 'ten' as unknown as number })
      ).rejects.toBeInstanceOf(ValidationError);
      expect(mockClient.sessionConfigs.list).not.toHaveBeenCalled();
    });

    it('propagates a 403 from the client unchanged', async () => {
      const error = new PermissionDeniedError(403, undefined, 'Forbidden', {});
      mockClient.sessionConfigs.list.mockRejectedValue(error);

      await expect(sessionConfigs.list()).rejects.toBe(error);
    });

    it('reports a cancelled request when the signal is aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      mockClient.sessionConfigs.list.mockRejectedValue(new APIUserAbortError());

      await expect(sessionConfigs.list({}, { signal: controller.signal })).rejects.toBeInstanceOf(
        ComposioRequestCancelledError
      );
    });
  });

  describe('get', () => {
    const rawConfig = {
      ...rawSummary,
      description: null,
      config: {
        toolkits: { enable: ['github', 'google_calendar'] },
        tools: {
          github: { enable: ['GITHUB_GET_REPO'] },
          google_calendar: { tags: { enable: ['readOnlyHint'], disable: ['destructiveHint'] } },
        },
        tags: { disable: ['destructiveHint'] },
      },
    };

    it('retrieves a config by id and camelCases only the metadata fields', async () => {
      mockClient.sessionConfigs.retrieve.mockResolvedValue(rawConfig);

      const result = await sessionConfigs.get('sc_1');

      expect(mockClient.sessionConfigs.retrieve).toHaveBeenCalledWith('sc_1', undefined);
      expect(result).toEqual({
        ...summary,
        description: null,
        config: rawConfig.config,
      });
    });

    it('keeps toolkit slug keys and tag names exactly as sent', async () => {
      mockClient.sessionConfigs.retrieve.mockResolvedValue(rawConfig);

      const result = await sessionConfigs.get('sc_1');

      expect(Object.keys(result.config.tools ?? {})).toEqual(['github', 'google_calendar']);
      expect(result.config.tools?.google_calendar).toEqual({
        tags: { enable: ['readOnlyHint'], disable: ['destructiveHint'] },
      });
      expect(result.config.tags).toEqual({ disable: ['destructiveHint'] });
    });

    it('does not invent tools or tags for a toolkit-only policy', async () => {
      mockClient.sessionConfigs.retrieve.mockResolvedValue({
        ...rawConfig,
        description: 'Read-only access',
        config: { toolkits: { disable: ['gmail'] } },
      });

      const result = await sessionConfigs.get('sc_1');

      expect(result.description).toBe('Read-only access');
      expect(result.config).toEqual({ toolkits: { disable: ['gmail'] } });
      expect('tools' in result.config).toBe(false);
      expect('tags' in result.config).toBe(false);
    });

    it.each(['', '   '])('rejects the id %j with a ValidationError and makes no call', async id => {
      await expect(sessionConfigs.get(id)).rejects.toBeInstanceOf(ValidationError);
      expect(mockClient.sessionConfigs.retrieve).not.toHaveBeenCalled();
    });

    it('propagates a 404 from the client unchanged', async () => {
      const error = new NotFoundError(404, undefined, 'Not found', {});
      mockClient.sessionConfigs.retrieve.mockRejectedValue(error);

      await expect(sessionConfigs.get('sc_missing')).rejects.toBe(error);
    });

    it('reports a cancelled request when the signal is aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      mockClient.sessionConfigs.retrieve.mockRejectedValue(new APIUserAbortError());

      await expect(
        sessionConfigs.get('sc_1', { signal: controller.signal })
      ).rejects.toBeInstanceOf(ComposioRequestCancelledError);
    });
  });
});
