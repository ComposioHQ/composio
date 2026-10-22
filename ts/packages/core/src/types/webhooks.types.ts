import { z } from 'zod/v3';
import { SetWebhookSubscriptionParamsSchema } from './triggers.types';

/**
 * Webhook payload versions accepted by the webhook subscription endpoints.
 */
export const WebhookVersionSchema = z.enum(['V1', 'V2', 'V3']);

// ---------------------------------------------------------------------------
// Webhook subscriptions
// ---------------------------------------------------------------------------

/**
 * A project webhook subscription in the SDK's camelCase shape. The signing
 * `secret` is returned by the API on every subscription read/write.
 */
export const WebhookSubscriptionSchema = z.object({
  id: z.string(),
  webhookUrl: z.string(),
  version: WebhookVersionSchema,
  enabledEvents: z.array(z.string()),
  secret: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const WebhookSubscriptionListParamsSchema = z.object({
  /** Number of items per page, max allowed is 50. */
  limit: z.number().optional(),
  /** Cursor for pagination, taken from a previous response's `nextCursor`. */
  cursor: z.string().optional(),
});
export type WebhookSubscriptionListParams = z.infer<typeof WebhookSubscriptionListParamsSchema>;

export const WebhookSubscriptionListResponseSchema = z.object({
  items: z.array(WebhookSubscriptionSchema),
  nextCursor: z.string().nullable(),
  totalPages: z.number(),
  currentPage: z.number(),
  totalItems: z.number(),
});
export type WebhookSubscriptionListResponse = z.infer<typeof WebhookSubscriptionListResponseSchema>;

/**
 * Params for `composio.webhooks.subscriptions.set()`. Identical to the
 * params accepted by `composio.triggers.setWebhookSubscription()`.
 */
export const WebhookSubscriptionSetParamsSchema = SetWebhookSubscriptionParamsSchema;
export type WebhookSubscriptionSetParams = z.infer<typeof WebhookSubscriptionSetParamsSchema>;

export const WebhookSubscriptionUpdateParamsSchema = z.object({
  /** HTTPS URL to receive webhook events. */
  webhookUrl: z.string().min(1).optional(),
  /** Event types to subscribe to. */
  enabledEvents: z.array(z.string()).min(1).optional(),
  /** Webhook payload version. */
  version: WebhookVersionSchema.optional(),
});
export type WebhookSubscriptionUpdateParams = z.infer<typeof WebhookSubscriptionUpdateParamsSchema>;

export const WebhookSubscriptionDeleteResponseSchema = z.object({
  success: z.boolean(),
});
export type WebhookSubscriptionDeleteResponse = z.infer<
  typeof WebhookSubscriptionDeleteResponseSchema
>;

export const WebhookSubscriptionRotateSecretResponseSchema = z.object({
  id: z.string(),
  /** The new signing secret. Store it — the previous secret stops validating. */
  secret: z.string(),
});
export type WebhookSubscriptionRotateSecretResponse = z.infer<
  typeof WebhookSubscriptionRotateSecretResponseSchema
>;

export const WebhookSubscriptionEventTypeSchema = z.object({
  eventType: z.string(),
  description: z.string(),
  supportedVersions: z.array(WebhookVersionSchema),
});
export type WebhookSubscriptionEventType = z.infer<typeof WebhookSubscriptionEventTypeSchema>;

export const WebhookSubscriptionEventTypesResponseSchema = z.object({
  items: z.array(WebhookSubscriptionEventTypeSchema),
});
export type WebhookSubscriptionEventTypesResponse = z.infer<
  typeof WebhookSubscriptionEventTypesResponseSchema
>;

// ---------------------------------------------------------------------------
// Webhook endpoints (per toolkit + OAuth app inbound ingress URLs)
// ---------------------------------------------------------------------------

export const WebhookEndpointListParamsSchema = z.object({
  /** Only return endpoints for this toolkit slug. */
  toolkitSlug: z.string().optional(),
});
export type WebhookEndpointListParams = z.infer<typeof WebhookEndpointListParamsSchema>;

export const WebhookEndpointListItemSchema = z.object({
  id: z.string(),
  toolkitSlug: z.string(),
  clientId: z.string().nullable(),
});
export type WebhookEndpointListItem = z.infer<typeof WebhookEndpointListItemSchema>;

export const WebhookEndpointListResponseSchema = z.object({
  items: z.array(WebhookEndpointListItemSchema),
});
export type WebhookEndpointListResponse = z.infer<typeof WebhookEndpointListResponseSchema>;

export const WebhookEndpointSchema = z.object({
  id: z.string(),
  toolkitSlug: z.string(),
  clientId: z.string().nullable(),
  /** The inbound URL to register with the third-party provider. */
  webhookUrl: z.string(),
  /** Configured setup fields with secret values masked. */
  data: z.record(z.string(), z.string()).nullable(),
  createdAt: z.string(),
});
export type WebhookEndpoint = z.infer<typeof WebhookEndpointSchema>;

export const WebhookEndpointCreateParamsSchema = z.object({
  /** Toolkit identifier (e.g. `slack`, `discord`). */
  toolkitSlug: z.string().min(1),
  /** OAuth app client ID — identifies which app this endpoint is for. */
  clientId: z.string().min(1),
});
export type WebhookEndpointCreateParams = z.infer<typeof WebhookEndpointCreateParamsSchema>;

export const WebhookEndpointReplaceParamsSchema = z.object({
  /** Key-value pairs for ALL required setup fields of the toolkit. */
  data: z.record(z.string(), z.string()),
});
export type WebhookEndpointReplaceParams = z.infer<typeof WebhookEndpointReplaceParamsSchema>;

export const WebhookEndpointUpdateParamsSchema = z.object({
  /** Key-value pairs to merge into the setup fields. Omitted fields are preserved. */
  data: z.record(z.string(), z.string()),
});
export type WebhookEndpointUpdateParams = z.infer<typeof WebhookEndpointUpdateParamsSchema>;
