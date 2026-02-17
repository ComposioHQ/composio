import { z } from 'zod/v3';
import { AuthSchemeTypes } from './authConfigs.types';
import { ConnectionStatuses } from './connectedAccountAuthStates.types';

// =============================================================================
// WEBHOOK EVENT TYPES
// =============================================================================

export const WebhookEventTypes = {
  CONNECTION_EXPIRED: 'composio.connected_account.expired',
  TRIGGER_MESSAGE: 'composio.trigger.message',
} as const;

export type WebhookEventType = (typeof WebhookEventTypes)[keyof typeof WebhookEventTypes];

// =============================================================================
// CONNECTED ACCOUNT DATA SCHEMA (matches GET /api/v3/connected_accounts/{id})
// =============================================================================

/**
 * Auth config schema for webhook payloads (raw API format, snake_case).
 *
 * This intentionally does NOT reuse ConnectedAccountAuthConfigSchema from
 * connectedAccounts.types.ts because:
 * - Webhook payloads arrive in raw snake_case (is_composio_managed, is_disabled)
 *   while the SDK schema uses camelCase (isComposioManaged, isDisabled)
 * - Webhook payloads include additional fields (auth_scheme, deprecated)
 *   not present in the SDK schema
 *
 * Uses .passthrough() to accept unknown fields the API may add in the future.
 *
 * @see ConnectedAccountAuthConfigSchema in connectedAccounts.types.ts for the camelCase SDK version
 */
export const WebhookConnectedAccountAuthConfigSchema = z
  .object({
    /** The nano ID of the auth config */
    id: z.string(),
    /** @deprecated - use state.authScheme instead */
    auth_scheme: z.nativeEnum(AuthSchemeTypes),
    /** Whether this auth config is managed by Composio */
    is_composio_managed: z.boolean(),
    /** Whether the auth config is disabled */
    is_disabled: z.boolean(),
    /** @deprecated */
    deprecated: z
      .object({
        uuid: z.string(),
      })
      .optional(),
  })
  .passthrough();

export type WebhookConnectedAccountAuthConfig = z.infer<
  typeof WebhookConnectedAccountAuthConfigSchema
>;

/**
 * Simplified connection state schema for webhook payloads (raw API format).
 *
 * This intentionally does NOT reuse ConnectionDataSchema from
 * connectedAccountAuthStates.types.ts because:
 * - ConnectionDataSchema is a discriminated union requiring typed `val`
 *   per auth scheme (e.g., Oauth2ConnectionDataSchema)
 * - Webhook payloads need loose validation (z.record(z.unknown()))
 *   since the connection state varies and isn't the focus of event handling
 *
 * Uses .passthrough() to accept unknown fields the API may add in the future.
 *
 * @see ConnectionDataSchema in connectedAccountAuthStates.types.ts for the full typed version
 */
export const WebhookConnectionStateSchema = z
  .object({
    /** The auth scheme type (e.g., 'OAUTH2', 'API_KEY') */
    authScheme: z.nativeEnum(AuthSchemeTypes),
    /** Connection state values - varies by auth scheme */
    val: z.record(z.unknown()),
  })
  .passthrough();

export type WebhookConnectionState = z.infer<typeof WebhookConnectionStateSchema>;

/**
 * Connected account data schema for webhook payloads (raw API format, snake_case).
 *
 * This is the snake_case equivalent of ConnectedAccountRetrieveResponseSchema
 * from connectedAccounts.types.ts. It intentionally does NOT reuse that schema because:
 * - Webhook payloads arrive in raw snake_case (auth_config, user_id, created_at, etc.)
 *   while the SDK schema uses camelCase (authConfig, createdAt, etc.)
 * - The SDK applies a transformation layer (utils/transformers/connectedAccounts.ts)
 *   before validation; webhooks are validated directly by the user
 * - Webhook payloads include user_id, which the SDK schema omits
 *
 * Uses .passthrough() to accept unknown fields the API may add in the future.
 *
 * @see ConnectedAccountRetrieveResponseSchema in connectedAccounts.types.ts for the camelCase SDK version
 * @see utils/transformers/connectedAccounts.ts for the snake-to-camel transformation
 */
export const SingleConnectedAccountDetailedResponseSchema = z
  .object({
    /** Toolkit information */
    toolkit: z
      .object({
        slug: z.string().describe('The slug of the toolkit'),
      })
      .passthrough(),
    /** Auth config details */
    auth_config: WebhookConnectedAccountAuthConfigSchema,
    /** The nano ID of the connected account */
    id: z.string(),
    /** @deprecated - user ID of the connection owner */
    user_id: z.string(),
    /** Connection status */
    status: z.nativeEnum(ConnectionStatuses),
    /** ISO-8601 timestamp of creation */
    created_at: z.string(),
    /** ISO-8601 timestamp of last update */
    updated_at: z.string(),
    /** Connection state data (auth scheme + state values) */
    state: WebhookConnectionStateSchema,
    /** @deprecated - use state instead */
    data: z.record(z.unknown()),
    /** @deprecated - use state instead */
    params: z.record(z.unknown()),
    /** Reason for the current status (e.g., expiration reason) */
    status_reason: z.string().nullable(),
    /** Whether the connection is disabled */
    is_disabled: z.boolean(),
    /** Endpoint for making test requests */
    test_request_endpoint: z.string().optional(),
    /** @deprecated */
    deprecated: z
      .object({
        labels: z.array(z.string()),
        uuid: z.string(),
      })
      .optional(),
  })
  .passthrough();

export type SingleConnectedAccountDetailedResponse = z.infer<
  typeof SingleConnectedAccountDetailedResponseSchema
>;

// =============================================================================
// CONNECTION EXPIRED WEBHOOK EVENT SCHEMA
// =============================================================================

/**
 * Webhook metadata for connection events.
 * Note: This differs from the trigger webhook metadata in WebhookTriggerPayloadV3Schema.
 *
 * Uses .passthrough() to accept unknown fields the API may add in the future.
 */
export const WebhookConnectionMetadataSchema = z
  .object({
    /** Project nano ID */
    project_id: z.string(),
    /** Organization UUID */
    org_id: z.string(),
  })
  .passthrough();

export type WebhookConnectionMetadata = z.infer<typeof WebhookConnectionMetadataSchema>;

/**
 * Connection expired webhook event payload.
 * Emitted when a connected account expires due to authentication refresh failure.
 *
 * Uses .passthrough() to accept unknown fields the API may add in the future.
 *
 * @example
 * ```typescript
 * import { ConnectionExpiredEventSchema } from '@composio/core';
 *
 * // In your webhook handler
 * const result = ConnectionExpiredEventSchema.safeParse(webhookPayload);
 * if (result.success) {
 *   const { data, metadata } = result.data;
 *   console.log(`Connection ${data.id} expired for user ${data.user_id}`);
 *   console.log(`Toolkit: ${data.toolkit.slug}`);
 *   console.log(`Project: ${metadata.project_id}`);
 * }
 * ```
 */
export const ConnectionExpiredEventSchema = z
  .object({
    /** Unique message ID (e.g., "msg_847cdfcd-d219-4f18-a6dd-91acd42ca94a") */
    id: z.string(),
    /** ISO-8601 timestamp of when the event was emitted */
    timestamp: z.string(),
    /** Event type identifier */
    type: z.literal(WebhookEventTypes.CONNECTION_EXPIRED),
    /** Connected account data (same as GET /api/v3/connected_accounts/{id}) */
    data: SingleConnectedAccountDetailedResponseSchema,
    /** Event metadata */
    metadata: WebhookConnectionMetadataSchema,
  })
  .passthrough();

export type ConnectionExpiredEvent = z.infer<typeof ConnectionExpiredEventSchema>;

// =============================================================================
// UNION TYPE FOR ALL WEBHOOK EVENTS
// =============================================================================

/**
 * Union of all typed webhook event schemas.
 * Extend this as new event types are added.
 *
 * Note: This covers specific known event types with strict validation.
 * For unknown or new event types, use WebhookPayloadV3Schema from
 * triggers.types.ts which accepts any composio.* event with loose validation.
 *
 * Trigger events (composio.trigger.message) are handled through the
 * WebhookTriggerPayloadV3Schema in triggers.types.ts and the TriggerEvent type.
 */
export const WebhookEventSchema = z.discriminatedUnion('type', [ConnectionExpiredEventSchema]);

export type WebhookEvent = z.infer<typeof WebhookEventSchema>;
