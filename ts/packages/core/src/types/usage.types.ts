import { z } from 'zod/v3';

/**
 * Filters shared by the usage summary and breakdown queries.
 * **Experimental — shape may change in future releases.**
 */
export const UsageFiltersSchema = z.object({
  /** Only count events for these external end-user IDs (OR logic). */
  userId: z.array(z.string()).nullable().optional(),
  /** Only count events for these session IDs (OR logic). */
  sessionId: z.array(z.string()).nullable().optional(),
});
export type UsageFilters = z.infer<typeof UsageFiltersSchema>;

/**
 * Params for `composio.experimental.usage.summary()`.
 * **Experimental — shape may change in future releases.**
 */
export const UsageSummaryParamsSchema = z.object({
  /** Inclusive range start (Unix epoch milliseconds). Defaults to 30 days before `to`. */
  from: z.number().optional(),
  /** Exclusive range end (Unix epoch milliseconds). Defaults to now. */
  to: z.number().optional(),
  /** Restrict to these metering entity types. Omit for all types. */
  entityTypes: z.array(z.string()).optional(),
  filters: UsageFiltersSchema.optional(),
});
export type UsageSummaryParams = z.infer<typeof UsageSummaryParamsSchema>;

export const UsageOrderBySchema = z.enum(['key', 'total_quantity', 'event_count']);
export const UsageOrderDirectionSchema = z.enum(['asc', 'desc']);

/**
 * Params for `composio.experimental.usage.breakdown()`.
 * **Experimental — shape may change in future releases.**
 */
export const UsageBreakdownParamsSchema = z.object({
  /** Inclusive range start (Unix epoch milliseconds). Defaults to 30 days before `to`. */
  from: z.number().optional(),
  /** Exclusive range end (Unix epoch milliseconds). Defaults to now. */
  to: z.number().optional(),
  /** Dimension to group by. Defaults to `tool_slug` for tool_calls and `user_id` for sessions. */
  groupBy: z.string().optional(),
  /** Field to order groups by. Defaults to `total_quantity`. */
  orderBy: UsageOrderBySchema.optional(),
  /** Sort direction. Defaults to `desc`. */
  orderDirection: UsageOrderDirectionSchema.optional(),
  /** Maximum number of groups to return. Defaults to 100, max 1000. */
  limit: z.number().optional(),
  filters: UsageFiltersSchema.optional(),
});
export type UsageBreakdownParams = z.infer<typeof UsageBreakdownParamsSchema>;

export const UsageEntitySummarySchema = z.object({
  unit: z.string(),
  totalQuantity: z.string(),
  eventCount: z.number(),
});
export type UsageEntitySummary = z.infer<typeof UsageEntitySummarySchema>;

export const UsageSummaryResponseSchema = z.object({
  /** Aggregates keyed by metering entity type (e.g. `tool_calls`, `sessions`). */
  entities: z.record(z.string(), UsageEntitySummarySchema),
});
export type UsageSummaryResponse = z.infer<typeof UsageSummaryResponseSchema>;

export const UsageBreakdownGroupSchema = z.object({
  key: z.string(),
  totalQuantity: z.string(),
  eventCount: z.number(),
});
export type UsageBreakdownGroup = z.infer<typeof UsageBreakdownGroupSchema>;

export const UsageBreakdownResponseSchema = z.object({
  entityType: z.string(),
  unit: z.string(),
  totalQuantity: z.string(),
  eventCount: z.number(),
  groups: z.array(UsageBreakdownGroupSchema),
});
export type UsageBreakdownResponse = z.infer<typeof UsageBreakdownResponseSchema>;
