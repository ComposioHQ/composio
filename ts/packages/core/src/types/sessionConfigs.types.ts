import { z } from 'zod/v3';
import { ToolRouterTagsParamSchema } from './toolRouter.types';

/**
 * Params for `composio.sessionConfigs.list()`. The backend owns the defaults:
 * active configs only, 20 per page, at most 100.
 */
export const SessionConfigListParamsSchema = z.object({
  /** Case-insensitive substring match against the config name. */
  search: z.string().optional(),
  /** `true` returns only archived configs. Omitted returns active configs. */
  archived: z.boolean().optional(),
  /** Page size. The backend defaults to 20 and caps it at 100. */
  limit: z.number().optional(),
  /** `nextCursor` from a previous page. */
  cursor: z.string().optional(),
});
export type SessionConfigListParams = z.infer<typeof SessionConfigListParamsSchema>;

/**
 * A saved Session config as listed by `composio.sessionConfigs.list()`.
 */
export const SessionConfigSummarySchema = z.object({
  /** Stable `sc_…` identifier. */
  id: z.string(),
  /** Project-unique display name. */
  name: z.string(),
  archived: z.boolean(),
  /** ISO 8601 timestamp. */
  createdAt: z.string(),
  /** ISO 8601 timestamp. */
  updatedAt: z.string(),
});
export type SessionConfigSummary = z.infer<typeof SessionConfigSummarySchema>;

export const SessionConfigListResponseSchema = z.object({
  items: z.array(SessionConfigSummarySchema),
  /** Cursor for the next page, or `null` on the last page. */
  nextCursor: z.string().nullable(),
});
export type SessionConfigListResponse = z.infer<typeof SessionConfigListResponseSchema>;

const SessionConfigTagPolicySchema = z.object({
  enable: z.array(ToolRouterTagsParamSchema.element).optional(),
  disable: z.array(ToolRouterTagsParamSchema.element).optional(),
});

/**
 * The access policy stored in a saved Session config, in the backend's
 * `enable`/`disable` shape. Toolkit slug keys and tag names are kept exactly
 * as the backend sends them.
 */
export const SessionConfigPolicySchema = z.object({
  toolkits: z
    .union([z.object({ enable: z.array(z.string()) }), z.object({ disable: z.array(z.string()) })])
    .optional(),
  /** Per-toolkit tool policy, keyed by toolkit slug. */
  tools: z
    .record(
      z.string(),
      z.union([
        z.object({ enable: z.array(z.string()) }),
        z.object({ disable: z.array(z.string()) }),
        z.object({ tags: SessionConfigTagPolicySchema }),
      ])
    )
    .optional(),
  /** Global tag policy. */
  tags: SessionConfigTagPolicySchema.optional(),
});
export type SessionConfigPolicy = z.infer<typeof SessionConfigPolicySchema>;

/**
 * A saved Session config with its description and access policy, as returned
 * by `composio.sessionConfigs.get()`.
 */
export const SessionConfigSchema = SessionConfigSummarySchema.extend({
  description: z.string().nullable(),
  config: SessionConfigPolicySchema,
});
export type SessionConfig = z.infer<typeof SessionConfigSchema>;
