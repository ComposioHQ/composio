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
  cursor: z.string().optional(),
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
 * Webhook payload schemas for V1, V2, V3 versions
 * These schemas represent the raw payload structure sent by Composio's webhook system
 */

/** V1 webhook payload - legacy format */
export const WebhookPayloadV1Schema = z.object({
  trigger_name: z.string(),
  connection_id: z.string(),
  trigger_id: z.string(),
  payload: z.record(z.unknown()),
  log_id: z.string(),
});
export type WebhookPayloadV1 = z.infer<typeof WebhookPayloadV1Schema>;

/** V2 webhook payload - includes timestamp and nested data */
export const WebhookPayloadV2Schema = z.object({
  type: z.string(),
  timestamp: z.string(),
  log_id: z.string(),
  data: z
    .object({
      connection_id: z.string(),
      connection_nano_id: z.string(),
      trigger_nano_id: z.string(),
      trigger_id: z.string(),
      user_id: z.string(),
    })
    .passthrough(),
});
export type WebhookPayloadV2 = z.infer<typeof WebhookPayloadV2Schema>;

/** V3 webhook payload - generic envelope for all composio.* events */
export const WebhookPayloadV3Schema = z.object({
  id: z.string(),
  timestamp: z.string(),
  type: z.string().refine(val => val.startsWith('composio.'), {
    message: "V3 event type must start with 'composio.'",
  }),
  metadata: z.record(z.unknown()),
  data: z.record(z.unknown()),
});
export type WebhookPayloadV3 = z.infer<typeof WebhookPayloadV3Schema>;

/** V3 trigger-specific payload - has trigger metadata fields */
export const WebhookTriggerPayloadV3Schema = z.object({
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  metadata: z
    .object({
      log_id: z.string(),
      trigger_slug: z.string(),
      trigger_id: z.string(),
      connected_account_id: z.string(),
      auth_config_id: z.string(),
      user_id: z.string(),
    })
    .passthrough(),
  data: z.record(z.unknown()),
});
export type WebhookTriggerPayloadV3 = z.infer<typeof WebhookTriggerPayloadV3Schema>;

/** Union of all webhook payload versions */
export const WebhookPayloadSchema = z.union([
  WebhookPayloadV3Schema,
  WebhookPayloadV2Schema,
  WebhookPayloadV1Schema,
]);
export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;

/** Webhook version enum */
export const WebhookVersions = {
  V1: 'V1',
  V2: 'V2',
  V3: 'V3',
} as const;
export type WebhookVersion = (typeof WebhookVersions)[keyof typeof WebhookVersions];

export const DefaultWebhookSubscriptionEvents = ['composio.trigger.message'] as const;

export const SetWebhookSubscriptionParamsSchema = z.object({
  /** HTTPS URL to receive webhook events. */
  webhookUrl: z.string().min(1),
  /** Event types to subscribe to. Defaults to trigger messages. */
  enabledEvents: z.array(z.string()).min(1).optional(),
  /** Webhook payload version. Defaults to V3. */
  version: z.enum(['V1', 'V2', 'V3']).optional(),
});

export type SetWebhookSubscriptionParams = z.infer<typeof SetWebhookSubscriptionParamsSchema>;

export type WebhookSubscription = {
  id: string;
  webhookUrl: string;
  version: WebhookVersion;
  enabledEvents: string[];
  secret?: string;
  createdAt?: string;
  updatedAt?: string;
};

/**
 * Parameters for verifying a webhook signature
 */
export const VerifyWebhookParamsSchema = z.object({
  /**
   * The webhook message ID from the 'webhook-id' header.
   * Format: 'msg_xxx'
   */
  id: z.string({
    required_error: "Missing 'id' parameter. Pass the value of the 'webhook-id' HTTP header.",
    invalid_type_error: "Invalid 'id' parameter. Expected string from 'webhook-id' HTTP header.",
  }),
  /** The raw webhook payload as a string (request body) */
  payload: z.string({
    required_error:
      "Missing 'payload' parameter. Pass the raw request body as a string (do not parse it).",
    invalid_type_error: "Invalid 'payload' parameter. Expected string (raw request body).",
  }),
  /** The webhook secret used to sign the payload (from Composio dashboard) */
  secret: z.string({
    required_error:
      "Missing 'secret' parameter. Get your webhook secret from the Composio dashboard.",
    invalid_type_error: "Invalid 'secret' parameter. Expected string.",
  }),
  /**
   * The signature from the 'webhook-signature' header.
   * Format: 'v1,base64EncodedSignature'
   */
  signature: z.string({
    required_error:
      "Missing 'signature' parameter. Pass the value of the 'webhook-signature' HTTP header.",
    invalid_type_error:
      "Invalid 'signature' parameter. Expected string from 'webhook-signature' HTTP header.",
  }),
  /**
   * The webhook timestamp from the 'webhook-timestamp' header.
   * This is the Unix timestamp in seconds when the webhook was sent.
   */
  timestamp: z.string({
    required_error:
      "Missing 'timestamp' parameter. Pass the value of the 'webhook-timestamp' HTTP header.",
    invalid_type_error:
      "Invalid 'timestamp' parameter. Expected string from 'webhook-timestamp' HTTP header.",
  }),
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
 * An incoming HTTP request that carries a Composio webhook.
 *
 * Accepts either:
 * - A Fetch API `Request` (Next.js App Router, Hono, Remix, Cloudflare Workers).
 * - A plain object `{ body, headers }` (Express with `express.raw`, Next.js
 *   Pages Router `req`). `body` may be a string, a Buffer/Uint8Array, or an
 *   already-parsed object; `headers` may be a `Headers` instance or a plain
 *   record of `string | string[] | undefined`.
 */
export type WebhookRequestLike =
  | Request
  | {
      body: unknown;
      headers: unknown;
    };

/**
 * Options for {@link Triggers.parse}.
 */
export type ParseWebhookOptions = {
  /**
   * The webhook secret used to sign the payload (from the Composio dashboard).
   * When provided, the request signature is verified before the payload is
   * returned. When omitted, the payload is parsed without verification.
   */
  verifySecret?: string;
  /**
   * Maximum allowed age of the webhook in seconds (default: 300 = 5 minutes).
   * Only used when `verifySecret` is provided. Set to 0 to disable timestamp
   * validation.
   */
  tolerance?: number;
};

/**
 * Result of a successful webhook verification.
 * Contains the parsed payload along with version information.
 */
export type VerifyWebhookResult = {
  /** The webhook version (V1, V2, or V3), from 'x-composio-webhook-version' */
  version: WebhookVersion;
  /** The parsed and normalized webhook payload */
  payload: IncomingTriggerPayload;
  /** The raw parsed payload before normalization */
  rawPayload: WebhookPayload;
};
