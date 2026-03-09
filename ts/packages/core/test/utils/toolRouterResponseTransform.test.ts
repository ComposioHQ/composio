import { describe, it, expect } from 'vitest';
import {
  transformSearchResponse,
  transformExecuteResponse,
} from '../../src/utils/transformers/toolRouterResponseTransform';

describe('toolRouterResponseTransform', () => {
  describe('transformSearchResponse', () => {
    it('should transform snake_case search response to camelCase', () => {
      const raw = {
        success: true,
        error: null,
        results: [
          {
            index: 1,
            use_case: 'send emails',
            primary_tool_slugs: ['GMAIL_SEND_EMAIL'],
            related_tool_slugs: ['GMAIL_CREATE_DRAFT'],
            toolkits: ['gmail'],
            difficulty: 'easy',
            recommended_plan_steps: ['Step 1', 'Step 2'],
          },
        ],
        tool_schemas: {
          GMAIL_SEND_EMAIL: {
            tool_slug: 'GMAIL_SEND_EMAIL',
            toolkit: 'gmail',
            description: 'Send an email',
            hasFullSchema: true,
            input_schema: { to: { type: 'string' } },
            output_schema: { id: { type: 'string' } },
          },
        },
        toolkit_connection_statuses: [
          {
            toolkit: 'gmail',
            description: 'Gmail toolkit',
            has_active_connection: true,
            status_message: 'Connected',
          },
        ],
        next_steps_guidance: ['Connect Gmail if needed'],
        session: {
          id: 'trs_123',
          generate_id: false,
          instructions: 'Reuse this session id',
        },
        time_info: {
          current_time_utc: '2025-03-09T12:00:00.000Z',
          current_time_utc_epoch_seconds: 1741521600,
          message: 'UTC time',
        },
      };

      const result = transformSearchResponse(raw);

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toEqual({
        index: 1,
        useCase: 'send emails',
        primaryToolSlugs: ['GMAIL_SEND_EMAIL'],
        relatedToolSlugs: ['GMAIL_CREATE_DRAFT'],
        toolkits: ['gmail'],
        difficulty: 'easy',
        recommendedPlanSteps: ['Step 1', 'Step 2'],
      });
      expect(result.toolSchemas).toHaveProperty('GMAIL_SEND_EMAIL');
      expect(result.toolSchemas.GMAIL_SEND_EMAIL).toEqual({
        toolSlug: 'GMAIL_SEND_EMAIL',
        toolkit: 'gmail',
        description: 'Send an email',
        hasFullSchema: true,
        inputSchema: { to: { type: 'string' } },
        outputSchema: { id: { type: 'string' } },
      });
      expect(result.toolkitConnectionStatuses[0]).toEqual({
        toolkit: 'gmail',
        description: 'Gmail toolkit',
        hasActiveConnection: true,
        statusMessage: 'Connected',
      });
      expect(result.nextStepsGuidance).toEqual(['Connect Gmail if needed']);
      expect(result.session).toEqual({
        id: 'trs_123',
        generateId: false,
        instructions: 'Reuse this session id',
      });
      expect(result.timeInfo).toEqual({
        currentTimeUtc: '2025-03-09T12:00:00.000Z',
        currentTimeUtcEpochSeconds: 1741521600,
        message: 'UTC time',
      });
    });

    it('should transform schemaRef with tool_slugs to toolSlugs', () => {
      const raw = {
        success: true,
        error: null,
        results: [],
        tool_schemas: {
          TOOL_X: {
            tool_slug: 'TOOL_X',
            toolkit: 'x',
            schemaRef: {
              args: { tool_slugs: ['TOOL_X'] },
              message: 'Fetch schema',
              tool: 'COMPOSIO_GET_TOOL_SCHEMAS',
            },
          },
        },
        toolkit_connection_statuses: [],
        next_steps_guidance: [],
        session: {
          id: 'trs_1',
          generate_id: true,
          instructions: 'Use session',
        },
        time_info: {
          current_time_utc: '2025-03-09T12:00:00.000Z',
          current_time_utc_epoch_seconds: 1741521600,
          message: 'UTC',
        },
      };

      const result = transformSearchResponse(raw);
      expect(result.toolSchemas.TOOL_X.schemaRef).toEqual({
        args: { toolSlugs: ['TOOL_X'] },
        message: 'Fetch schema',
        tool: 'COMPOSIO_GET_TOOL_SCHEMAS',
      });
    });
  });

  describe('transformExecuteResponse', () => {
    it('should transform snake_case execute response to camelCase', () => {
      const raw = {
        data: { tool_slug: 'GMAIL_SEND_EMAIL', id: 'msg_123' },
        error: null,
        log_id: 'log_abc',
      };

      const result = transformExecuteResponse(raw);

      expect(result.data).toEqual({ tool_slug: 'GMAIL_SEND_EMAIL', id: 'msg_123' });
      expect(result.error).toBeNull();
      expect(result.logId).toBe('log_abc');
    });

    it('should preserve error in execute response', () => {
      const raw = {
        data: {},
        error: 'Connection not found',
        log_id: 'log_err',
      };

      const result = transformExecuteResponse(raw);

      expect(result.error).toBe('Connection not found');
      expect(result.logId).toBe('log_err');
    });
  });
});
