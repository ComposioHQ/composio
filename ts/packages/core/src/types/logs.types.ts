import { z } from 'zod/v3';

/**
 * Fields a tool-execution log search can filter on.
 */
export const LogSearchFilterFieldSchema = z.enum([
  'tool_slug',
  'toolkit_slug',
  'connected_account_id',
  'auth_config_id',
  'status',
  'user_id',
  'session_id',
  'sandbox_id',
  'request_id',
  'log_id',
]);
export type LogSearchFilterField = z.infer<typeof LogSearchFilterFieldSchema>;

export const LogSearchFilterOperatorSchema = z.enum(['==', '!=', 'contains', 'not_contains']);
export type LogSearchFilterOperator = z.infer<typeof LogSearchFilterOperatorSchema>;

export const LogSearchFilterSchema = z.object({
  field: LogSearchFilterFieldSchema,
  operator: LogSearchFilterOperatorSchema,
  value: z.string(),
});
export type LogSearchFilter = z.infer<typeof LogSearchFilterSchema>;

export const LogSearchTimeRangeSchema = z.object({
  /** Start time in epoch milliseconds (inclusive). */
  from: z.number(),
  /** End time in epoch milliseconds. */
  to: z.number(),
});
export type LogSearchTimeRange = z.infer<typeof LogSearchTimeRangeSchema>;

/**
 * Params for `composio.logs.search()`.
 */
export const LogSearchParamsSchema = z.object({
  limit: z.number().optional(),
  cursor: z.string().nullable().optional(),
  filters: z.array(LogSearchFilterSchema).optional(),
  timeRange: LogSearchTimeRangeSchema.optional(),
});
export type LogSearchParams = z.infer<typeof LogSearchParamsSchema>;

export const ToolExecutionLogStatusSchema = z.enum(['success', 'failed']);
export const ToolExecutionLogLevelSchema = z.enum(['info', 'error', 'warn']);

export const ToolExecutionLogParentSchema = z
  .object({
    logId: z.string(),
    toolSlug: z.string(),
  })
  .nullable();

/**
 * A tool-execution log entry as returned by `composio.logs.search()`.
 */
export const ToolExecutionLogSchema = z.object({
  id: z.string(),
  /** ISO 8601 timestamp. */
  timestamp: z.string(),
  /** Log event type, e.g. `tool.execution`. */
  type: z.string(),
  status: ToolExecutionLogStatusSchema,
  level: ToolExecutionLogLevelSchema,
  message: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()),
  metrics: z.record(z.string(), z.unknown()),
  parent: ToolExecutionLogParentSchema,
});
export type ToolExecutionLog = z.infer<typeof ToolExecutionLogSchema>;

export const LogSearchResponseSchema = z.object({
  logs: z.array(ToolExecutionLogSchema),
  nextCursor: z.string().nullable(),
});
export type LogSearchResponse = z.infer<typeof LogSearchResponseSchema>;

/**
 * A single tool-execution log with its full detail, as returned by
 * `composio.logs.get()`.
 */
export const ToolExecutionLogDetailSchema = ToolExecutionLogSchema.extend({
  timings: z
    .object({
      /** Epoch milliseconds. */
      startTime: z.number(),
      /** Epoch milliseconds. */
      endTime: z.number(),
    })
    .optional(),
  context: z.object({
    sessionId: z.string().optional(),
    traceId: z.string().optional(),
    requestId: z.string().optional(),
  }),
  source: z.object({
    host: z.string().optional(),
    framework: z.string().optional(),
    language: z.string().optional(),
  }),
  data: z.record(z.string(), z.unknown()),
});
export type ToolExecutionLogDetail = z.infer<typeof ToolExecutionLogDetailSchema>;
