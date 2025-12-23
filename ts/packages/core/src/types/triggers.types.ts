import { z } from 'zod/v3';

export const TriggerStatuses = {
  ENABLE: 'enable',
  DISABLE: 'disable',
} as const;
export type TriggerStatusType = (typeof TriggerStatuses)[keyof typeof TriggerStatuses];
export const TriggerStatusEnum = z.enum(['enable', 'disable']);

export const TriggerSubscribeParamSchema = z.object({
  toolkits: z.array(z.string()).optional(),
  triggerId: z.string().optional(),
  connectedAccountId: z.string().optional(),
  authConfigId: z.string().optional(),
  triggerSlug: z.array(z.string()).optional(),
  triggerData: z.string().optional(),
  userId: z.string().optional(),
});
export type TriggerSubscribeParams = z.infer<typeof TriggerSubscribeParamSchema>;

export const TriggerInstanceListActiveParamsSchema = z.object({
  authConfigIds: z.array(z.string()).nullable().optional(),
  connectedAccountIds: z.array(z.string()).nullable().optional(),
  limit: z.number().optional(),
  page: z.number().optional(),
  showDisabled: z.boolean().nullable().optional(),
  triggerIds: z.array(z.string()).nullable().optional(),
  triggerNames: z.array(z.string()).nullable().optional(),
});

export type TriggerInstanceListActiveParams = z.infer<typeof TriggerInstanceListActiveParamsSchema>;

export const TriggerInstanceListActiveResponseItemSchema = z.object({
  id: z.string(),
  connectedAccountId: z.string(),
  disabledAt: z.string().nullable(),
  state: z.record(z.unknown()),
  triggerConfig: z.record(z.unknown()),
  triggerName: z.string(),
  updatedAt: z.string(),
  triggerData: z.string().optional(),
  uuid: z.string().optional(),
});

export const TriggerInstanceListActiveResponseSchema = z.object({
  items: z.array(TriggerInstanceListActiveResponseItemSchema),
  nextCursor: z.string().nullable(),
  totalPages: z.number(),
});

export type TriggerInstanceListActiveResponse = z.infer<
  typeof TriggerInstanceListActiveResponseSchema
>;
export type TriggerInstanceListActiveResponseItem = z.infer<
  typeof TriggerInstanceListActiveResponseItemSchema
>;

export const TriggerInstanceUpsertParamsSchema = z.object({
  connectedAccountId: z.string().optional(),
  triggerConfig: z.record(z.unknown()).optional(),
});

export type TriggerInstanceUpsertParams = z.infer<typeof TriggerInstanceUpsertParamsSchema>;

export const TriggerInstanceUpsertResponseSchema = z.object({
  triggerId: z.string(),
});

export type TriggerInstanceUpsertResponse = z.infer<typeof TriggerInstanceUpsertResponseSchema>;

export const TriggerInstanceManageUpdateParamsSchema = z.object({
  status: z.enum(['enable', 'disable']),
});

export type TriggerInstanceManageUpdateParams = z.infer<
  typeof TriggerInstanceManageUpdateParamsSchema
>;

export const TriggerInstanceManageUpdateResponseSchema = z.object({
  status: z.enum(['success']),
});

export type TriggerInstanceManageUpdateResponse = z.infer<
  typeof TriggerInstanceManageUpdateResponseSchema
>;

export const TriggerInstanceManageDeleteResponseSchema = z.object({
  triggerId: z.string(),
});

export type TriggerInstanceManageDeleteResponse = z.infer<
  typeof TriggerInstanceManageDeleteResponseSchema
>;

export const IncomingTriggerPayloadSchema = z.object({
  id: z.string().describe('The ID of the trigger'),
  uuid: z.string().describe('The UUID of the trigger'),
  triggerSlug: z.string().describe('The slug of the trigger that triggered the event'),
  toolkitSlug: z.string().describe('The slug of the toolkit that triggered the event'),
  userId: z.string().describe('The ID of the user that triggered the event'),
  payload: z.record(z.unknown()).describe('The payload of the trigger').optional(),
  originalPayload: z.record(z.unknown()).describe('The original payload of the trigger').optional(),
  metadata: z.object({
    id: z.string(),
    uuid: z.string(),
    toolkitSlug: z.string(),
    triggerSlug: z.string(),
    triggerData: z.string().optional(),
    triggerConfig: z.record(z.unknown()),
    connectedAccount: z.object({
      id: z.string(),
      uuid: z.string(),
      authConfigId: z.string(),
      authConfigUUID: z.string(),
      userId: z.string(),
      status: z.enum(['ACTIVE', 'INACTIVE']),
    }),
  }),
});

export type IncomingTriggerPayload = z.infer<typeof IncomingTriggerPayloadSchema>;

export type TriggerData = {
  appName: string;
  clientId: number;
  payload: Record<string, unknown>;
  originalPayload: Record<string, unknown>;
  metadata: {
    id: string;
    nanoId: string;
    triggerName: string;
    triggerData: string;
    triggerConfig: Record<string, unknown>;
    connection: {
      id: string;
      connectedAccountNanoId: string;
      integrationId: string;
      authConfigNanoId: string;
      clientUniqueUserId: string;
      status: string;
    };
  };
};

export const TriggersTypeListParamsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().nullish(),
  toolkits: z.array(z.string()).nullish(),
});
export type TriggersTypeListParams = z.infer<typeof TriggersTypeListParamsSchema>;

export const TriggerTypeSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  instructions: z.string().optional(),
  toolkit: z.object({
    logo: z.string(),
    slug: z.string(),
    name: z.string(),
  }),
  payload: z.record(z.unknown()),
  config: z.record(z.unknown()),
  version: z.string().optional(),
});

export type TriggerType = z.infer<typeof TriggerTypeSchema>;

export const TriggersTypeListResponseSchema = z.object({
  items: z.array(TriggerTypeSchema),
  nextCursor: z.string().nullish(),
  totalPages: z.number(),
});

export type TriggersTypeListResponse = z.infer<typeof TriggersTypeListResponseSchema>;
export type TriggersTypeRetrieveResponse = z.infer<typeof TriggerTypeSchema>;

/**
 * Generic trigger event type that can be used with generated trigger payload types
 * @template TPayload - The specific trigger payload type (e.g., GITHUB_COMMIT_EVENT_PAYLOAD)
 */
export interface TriggerEvent<TPayload = unknown> {
  type: string;
  timestamp: string;
  data: TriggerEventData<TPayload>;
}

/**
 * Generic trigger event data type that contains the payload and metadata
 * @template TPayload - The specific trigger payload type
 */
export type TriggerEventData<TPayload = unknown> = TPayload & {
  connection_nano_id: string;
  trigger_nano_id: string;
  user_id: string;
};

/**
 * Parameters for verifying a webhook signature
 */
export const VerifyWebhookParamsSchema = z.object({
  /** The raw webhook payload as a string (request body) */
  payload: z.string(),
  /** The signature from the webhook header (e.g., 'x-composio-signature') */
  signature: z.string(),
  /** The webhook secret used to sign the payload */
  secret: z.string(),
  /**
   * Maximum allowed age of the webhook in seconds.
   * If the webhook timestamp is older than this, verification will fail.
   * Set to 0 to disable timestamp validation.
   * @default 300 (5 minutes)
   */
  tolerance: z.number().optional().default(300),
});

export type VerifyWebhookParams = z.input<typeof VerifyWebhookParamsSchema>;

/**
 * Result of a successful webhook verification
 */
export type VerifyWebhookResult = IncomingTriggerPayload;
