import { describe, it, expect, vi, beforeEach } from 'vitest';
import ComposioClient from '@composio/client';
import { Logs } from '../../src/models/Logs';
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
  logs: {
    createToolExecution: vi.fn(),
    retrieveToolExecution: vi.fn(),
  },
});

const rawLog = {
  id: 'log_1',
  timestamp: '2026-01-01T00:00:00Z',
  type: 'tool.execution',
  status: 'success',
  level: 'info',
  message: 'ok',
  metadata: { tool_slug: 'GITHUB_GET_REPO' },
  metrics: { duration_ms: 12 },
  parent: { log_id: 'log_0', tool_slug: 'COMPOSIO_MULTI_EXECUTE_TOOL' },
};
const transformedLog = {
  id: 'log_1',
  timestamp: '2026-01-01T00:00:00Z',
  type: 'tool.execution',
  status: 'success',
  level: 'info',
  message: 'ok',
  metadata: { tool_slug: 'GITHUB_GET_REPO' },
  metrics: { duration_ms: 12 },
  parent: { logId: 'log_0', toolSlug: 'COMPOSIO_MULTI_EXECUTE_TOOL' },
};

describe('Logs', () => {
  let logs: Logs;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    logs = new Logs(mockClient as unknown as ComposioClient);
  });

  it('instruments the class with telemetry', () => {
    expect(telemetry.instrument).toHaveBeenCalledWith(logs, 'Logs');
  });

  describe('search', () => {
    it('sends an empty body when called without params', async () => {
      mockClient.logs.createToolExecution.mockResolvedValue({ logs: [], next_cursor: null });

      const result = await logs.search();

      expect(mockClient.logs.createToolExecution).toHaveBeenCalledWith(
        { limit: undefined, cursor: undefined, filters: undefined, time_range: undefined },
        undefined
      );
      expect(result).toEqual({ logs: [], nextCursor: null });
    });

    it('maps camelCase params to the wire and transforms the response', async () => {
      mockClient.logs.createToolExecution.mockResolvedValue({
        logs: [rawLog, { ...rawLog, id: 'log_2', parent: null, message: undefined }],
        next_cursor: 'cursor_2',
      });
      const signal = new AbortController().signal;

      const result = await logs.search(
        {
          limit: 2,
          cursor: 'cursor_1',
          filters: [{ field: 'toolkit_slug', operator: '==', value: 'github' }],
          timeRange: { from: 1, to: 2 },
        },
        { signal }
      );

      expect(mockClient.logs.createToolExecution).toHaveBeenCalledWith(
        {
          limit: 2,
          cursor: 'cursor_1',
          filters: [{ field: 'toolkit_slug', operator: '==', value: 'github' }],
          time_range: { from: 1, to: 2 },
        },
        { signal }
      );
      expect(result).toEqual({
        logs: [
          transformedLog,
          { ...transformedLog, id: 'log_2', parent: null, message: undefined },
        ],
        nextCursor: 'cursor_2',
      });
    });

    it('throws a ValidationError for an unknown filter field', async () => {
      await expect(
        logs.search({
          filters: [{ field: 'nope' as 'tool_slug', operator: '==', value: 'x' }],
        })
      ).rejects.toThrow(ValidationError);
      expect(mockClient.logs.createToolExecution).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('retrieves a log by id and transforms the detail fields', async () => {
      mockClient.logs.retrieveToolExecution.mockResolvedValue({
        ...rawLog,
        timings: { start_time: 10, end_time: 22 },
        context: { session_id: 'trs_1', trace_id: 'trace_1', request_id: 'req_1' },
        source: { host: 'node', framework: 'vercel', language: 'typescript' },
        data: { input: { owner: 'composio' } },
      });

      const result = await logs.get('log_1');

      expect(mockClient.logs.retrieveToolExecution).toHaveBeenCalledWith('log_1', undefined);
      expect(result).toEqual({
        ...transformedLog,
        timings: { startTime: 10, endTime: 22 },
        context: { sessionId: 'trs_1', traceId: 'trace_1', requestId: 'req_1' },
        source: { host: 'node', framework: 'vercel', language: 'typescript' },
        data: { input: { owner: 'composio' } },
      });
    });

    it('leaves timings undefined when the API omits them', async () => {
      mockClient.logs.retrieveToolExecution.mockResolvedValue({
        ...rawLog,
        context: {},
        source: {},
        data: {},
      });

      const result = await logs.get('log_1');

      expect(result.timings).toBeUndefined();
      expect(result.context).toEqual({});
    });
  });
});
