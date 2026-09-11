/**
 * @fileoverview The `composio.webhooks` namespace: project webhook
 * subscriptions (outbound event delivery) and webhook endpoints (inbound
 * per-toolkit ingress URLs).
 *
 * @module Webhooks
 */
import ComposioClient from '@composio/client';
import { z } from 'zod/v3';
import {
  DefaultWebhookSubscriptionEvents,
  WebhookSubscription,
  WebhookVersions,
} from '../types/triggers.types';
import {
  WebhookEndpoint,
  WebhookEndpointCreateParams,
  WebhookEndpointCreateParamsSchema,
  WebhookEndpointListParams,
  WebhookEndpointListParamsSchema,
  WebhookEndpointListResponse,
  WebhookEndpointReplaceParams,
  WebhookEndpointReplaceParamsSchema,
  WebhookEndpointUpdateParams,
  WebhookEndpointUpdateParamsSchema,
  WebhookSubscriptionEventTypesResponse,
  WebhookSubscriptionDeleteResponse,
  WebhookSubscriptionListParams,
  WebhookSubscriptionListParamsSchema,
  WebhookSubscriptionListResponse,
  WebhookSubscriptionRotateSecretResponse,
  WebhookSubscriptionSetParams,
  WebhookSubscriptionSetParamsSchema,
  WebhookSubscriptionUpdateParams,
  WebhookSubscriptionUpdateParamsSchema,
} from '../types/webhooks.types';
import { ComposioRequestOptions } from '../types/requestOptions.types';
import { ValidationError } from '../errors/ValidationErrors';
import { telemetry } from '../telemetry/Telemetry';
import { withCancellation } from '../utils/cancellation';
import {
  transformWebhookEndpoint,
  transformWebhookEndpointListResponse,
  transformWebhookSubscriptionEventTypesResponse,
  transformWebhookSubscription,
  transformWebhookSubscriptionDeleteResponse,
  transformWebhookSubscriptionListResponse,
  transformWebhookSubscriptionRotateSecretResponse,
} from '../utils/transformers/webhooks';

/**
 * The only part of the `list({ limit: 1 })` probe the upsert needs: the id of
 * the first (and, since the API allows one subscription per project, only)
 * subscription. Parsed at the boundary so a malformed payload never reaches
 * the update path.
 */
const FirstWebhookSubscriptionIdSchema = z
  .object({
    items: z.array(z.object({ id: z.string().min(1) }).passthrough()).optional(),
  })
  .passthrough()
  .transform(response => response.items?.[0]?.id);

/**
 * Create-or-update the project webhook subscription.
 *
 * Shared by `composio.webhooks.subscriptions.set()` and the legacy
 * `composio.triggers.setWebhookSubscription()` so both issue the exact same
 * call sequence: `webhookSubscriptions.list({ limit: 1 })`, then
 * `webhookSubscriptions.update(id, body)` when a subscription exists,
 * otherwise `webhookSubscriptions.create(body)`.
 *
 * @internal
 */
export async function upsertWebhookSubscription(
  client: ComposioClient,
  params: WebhookSubscriptionSetParams,
  requestOptions?: ComposioRequestOptions
): Promise<WebhookSubscription> {
  const parsedParams = WebhookSubscriptionSetParamsSchema.safeParse(params);

  if (!parsedParams.success) {
    throw new ValidationError(`Invalid parameters passed to set webhook subscription`, {
      cause: parsedParams.error,
    });
  }

  const body = {
    webhook_url: parsedParams.data.webhookUrl,
    enabled_events: parsedParams.data.enabledEvents ?? [...DefaultWebhookSubscriptionEvents],
    version: parsedParams.data.version ?? WebhookVersions.V3,
  };

  const existing = await withCancellation(
    () => client.webhookSubscriptions.list({ limit: 1 }, requestOptions),
    requestOptions?.signal
  );
  const parsedExisting = FirstWebhookSubscriptionIdSchema.safeParse(existing);
  if (!parsedExisting.success) {
    throw new ValidationError('Failed to parse webhook subscription list response', {
      cause: parsedExisting.error,
    });
  }
  const subscriptionId = parsedExisting.data;

  const subscription = await withCancellation(
    () =>
      subscriptionId
        ? client.webhookSubscriptions.update(subscriptionId, body, requestOptions)
        : client.webhookSubscriptions.create(body, requestOptions),
    requestOptions?.signal
  );

  return transformWebhookSubscription(subscription);
}

/**
 * `composio.webhooks.subscriptions` — the project's outbound webhook
 * subscription. The API allows one subscription per project; every response
 * includes the signing `secret` used to verify deliveries with
 * `composio.triggers.verifyWebhook()` / `composio.triggers.parse()`.
 */
export class WebhookSubscriptions {
  private client: ComposioClient;

  constructor(client: ComposioClient) {
    this.client = client;
    telemetry.instrument(this, 'WebhookSubscriptions');
  }

  /**
   * List the project's webhook subscriptions.
   *
   * @param {WebhookSubscriptionListParams} [query] - Pagination options
   * @returns {Promise<WebhookSubscriptionListResponse>} Paginated subscriptions
   *
   * @example
   * ```typescript
   * const { items } = await composio.webhooks.subscriptions.list();
   * console.log(items[0]?.webhookUrl);
   * ```
   */
  async list(
    query?: WebhookSubscriptionListParams,
    requestOptions?: ComposioRequestOptions
  ): Promise<WebhookSubscriptionListResponse> {
    const parsedQuery = WebhookSubscriptionListParamsSchema.safeParse(query ?? {});
    if (!parsedQuery.success) {
      throw new ValidationError('Failed to parse webhook subscription list query', {
        cause: parsedQuery.error,
      });
    }
    const listParams = {
      limit: parsedQuery.data.limit,
      cursor: parsedQuery.data.cursor,
    };
    const result = await withCancellation(
      () => this.client.webhookSubscriptions.list(listParams, requestOptions),
      requestOptions?.signal
    );
    return transformWebhookSubscriptionListResponse(result);
  }

  /**
   * Retrieve a webhook subscription by id.
   *
   * @param {string} id - The subscription id
   * @returns {Promise<WebhookSubscription>} The subscription, including its signing secret
   *
   * @example
   * ```typescript
   * const subscription = await composio.webhooks.subscriptions.get('whs_abc123');
   * console.log(subscription.enabledEvents);
   * ```
   */
  async get(id: string, requestOptions?: ComposioRequestOptions): Promise<WebhookSubscription> {
    const result = await withCancellation(
      () => this.client.webhookSubscriptions.retrieve(id, requestOptions),
      requestOptions?.signal
    );
    return transformWebhookSubscription(result);
  }

  /**
   * Create or update the project webhook subscription.
   *
   * If a subscription already exists it is updated in place, otherwise a new
   * one is created. By default this subscribes to V3 trigger message events.
   *
   * @param {WebhookSubscriptionSetParams} params - `webhookUrl`, optional `enabledEvents` and `version`
   * @returns {Promise<WebhookSubscription>} The resulting subscription
   * @throws {ValidationError} If the params fail validation
   *
   * @example
   * ```typescript
   * const subscription = await composio.webhooks.subscriptions.set({
   *   webhookUrl: `${APP_URL}/webhooks/composio`,
   *   enabledEvents: ['composio.trigger.message', 'composio.connected_account.expired'],
   * });
   * process.env.COMPOSIO_WEBHOOK_SECRET = subscription.secret;
   * ```
   */
  async set(
    params: WebhookSubscriptionSetParams,
    requestOptions?: ComposioRequestOptions
  ): Promise<WebhookSubscription> {
    return upsertWebhookSubscription(this.client, params, requestOptions);
  }

  /**
   * Update an existing webhook subscription. Only the provided fields change.
   *
   * @param {string} id - The subscription id
   * @param {WebhookSubscriptionUpdateParams} params - Fields to update
   * @returns {Promise<WebhookSubscription>} The updated subscription
   * @throws {ValidationError} If the params fail validation
   *
   * @example
   * ```typescript
   * await composio.webhooks.subscriptions.update('whs_abc123', {
   *   enabledEvents: ['composio.trigger.message'],
   * });
   * ```
   */
  async update(
    id: string,
    params: WebhookSubscriptionUpdateParams,
    requestOptions?: ComposioRequestOptions
  ): Promise<WebhookSubscription> {
    const parsedParams = WebhookSubscriptionUpdateParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      throw new ValidationError('Failed to parse webhook subscription update params', {
        cause: parsedParams.error,
      });
    }
    const body = {
      webhook_url: parsedParams.data.webhookUrl,
      enabled_events: parsedParams.data.enabledEvents,
      version: parsedParams.data.version,
    };
    const result = await withCancellation(
      () => this.client.webhookSubscriptions.update(id, body, requestOptions),
      requestOptions?.signal
    );
    return transformWebhookSubscription(result);
  }

  /**
   * Delete a webhook subscription. Deliveries stop immediately.
   *
   * @param {string} id - The subscription id
   * @returns {Promise<WebhookSubscriptionDeleteResponse>} `{ success }`
   *
   * @example
   * ```typescript
   * await composio.webhooks.subscriptions.delete('whs_abc123');
   * ```
   */
  async delete(
    id: string,
    requestOptions?: ComposioRequestOptions
  ): Promise<WebhookSubscriptionDeleteResponse> {
    const result = await withCancellation(
      () => this.client.webhookSubscriptions.delete(id, requestOptions),
      requestOptions?.signal
    );
    return transformWebhookSubscriptionDeleteResponse(result);
  }

  /**
   * Rotate the signing secret of a webhook subscription. The previous secret
   * stops validating, so update your verifier with the returned `secret`.
   *
   * @param {string} id - The subscription id
   * @returns {Promise<WebhookSubscriptionRotateSecretResponse>} `{ id, secret }`
   *
   * @example
   * ```typescript
   * const { secret } = await composio.webhooks.subscriptions.rotateSecret('whs_abc123');
   * ```
   */
  async rotateSecret(
    id: string,
    requestOptions?: ComposioRequestOptions
  ): Promise<WebhookSubscriptionRotateSecretResponse> {
    const result = await withCancellation(
      () => this.client.webhookSubscriptions.rotateSecret(id, requestOptions),
      requestOptions?.signal
    );
    return transformWebhookSubscriptionRotateSecretResponse(result);
  }

  /**
   * List the event types a subscription can enable, with the payload
   * versions each one supports.
   *
   * @returns {Promise<WebhookSubscriptionEventTypesResponse>} The available event types
   *
   * @example
   * ```typescript
   * const { items } = await composio.webhooks.subscriptions.listEventTypes();
   * console.log(items.map(item => item.eventType));
   * ```
   */
  async listEventTypes(
    requestOptions?: ComposioRequestOptions
  ): Promise<WebhookSubscriptionEventTypesResponse> {
    const result = await withCancellation(
      () => this.client.webhookSubscriptions.listEventTypes(requestOptions),
      requestOptions?.signal
    );
    return transformWebhookSubscriptionEventTypesResponse(result);
  }
}

/**
 * `composio.webhooks.endpoints` — inbound webhook endpoints. Each endpoint is
 * the ingress URL Composio exposes for one toolkit + OAuth app pair, which you
 * register with the third-party provider so it can push events to Composio.
 */
export class WebhookEndpoints {
  private client: ComposioClient;

  constructor(client: ComposioClient) {
    this.client = client;
    telemetry.instrument(this, 'WebhookEndpoints');
  }

  /**
   * List webhook endpoints, optionally filtered by toolkit.
   *
   * @param {WebhookEndpointListParams} [query] - Optional `toolkitSlug` filter
   * @returns {Promise<WebhookEndpointListResponse>} The endpoints
   *
   * @example
   * ```typescript
   * const { items } = await composio.webhooks.endpoints.list({ toolkitSlug: 'slack' });
   * ```
   */
  async list(
    query?: WebhookEndpointListParams,
    requestOptions?: ComposioRequestOptions
  ): Promise<WebhookEndpointListResponse> {
    const parsedQuery = WebhookEndpointListParamsSchema.safeParse(query ?? {});
    if (!parsedQuery.success) {
      throw new ValidationError('Failed to parse webhook endpoint list query', {
        cause: parsedQuery.error,
      });
    }
    const listParams = { toolkit_slug: parsedQuery.data.toolkitSlug };
    const result = await withCancellation(
      () => this.client.webhookEndpoints.list(listParams, requestOptions),
      requestOptions?.signal
    );
    return transformWebhookEndpointListResponse(result);
  }

  /**
   * Retrieve a webhook endpoint by its nano id.
   *
   * @param {string} nanoId - The endpoint nano id (e.g. `we_abc123`)
   * @returns {Promise<WebhookEndpoint>} The endpoint, with secret setup values masked
   *
   * @example
   * ```typescript
   * const endpoint = await composio.webhooks.endpoints.get('we_abc123');
   * console.log(endpoint.webhookUrl);
   * ```
   */
  async get(nanoId: string, requestOptions?: ComposioRequestOptions): Promise<WebhookEndpoint> {
    const result = await withCancellation(
      () => this.client.webhookEndpoints.retrieve(nanoId, requestOptions),
      requestOptions?.signal
    );
    return transformWebhookEndpoint(result);
  }

  /**
   * Create a webhook endpoint for a toolkit + OAuth app pair. Returns the
   * existing endpoint when one already exists for that pair.
   *
   * @param {WebhookEndpointCreateParams} params - `toolkitSlug` and `clientId`
   * @returns {Promise<WebhookEndpoint>} The endpoint; register `webhookUrl` with the provider
   * @throws {ValidationError} If the params fail validation
   *
   * @example
   * ```typescript
   * const endpoint = await composio.webhooks.endpoints.create({
   *   toolkitSlug: 'slack',
   *   clientId: 'my-slack-app-client-id',
   * });
   * ```
   */
  async create(
    params: WebhookEndpointCreateParams,
    requestOptions?: ComposioRequestOptions
  ): Promise<WebhookEndpoint> {
    const parsedParams = WebhookEndpointCreateParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      throw new ValidationError('Failed to parse webhook endpoint create params', {
        cause: parsedParams.error,
      });
    }
    const body = {
      toolkit_slug: parsedParams.data.toolkitSlug,
      client_id: parsedParams.data.clientId,
    };
    const result = await withCancellation(
      () => this.client.webhookEndpoints.create(body, requestOptions),
      requestOptions?.signal
    );
    return transformWebhookEndpoint(result);
  }

  /**
   * Replace the setup fields of a webhook endpoint. All required setup fields
   * for the toolkit must be provided — this is the initial configuration.
   *
   * @param {string} nanoId - The endpoint nano id
   * @param {WebhookEndpointReplaceParams} params - `data` with every required setup field
   * @returns {Promise<WebhookEndpoint>} The configured endpoint
   * @throws {ValidationError} If the params fail validation
   *
   * @example
   * ```typescript
   * await composio.webhooks.endpoints.replace('we_abc123', {
   *   data: { signing_secret: process.env.SLACK_SIGNING_SECRET! },
   * });
   * ```
   */
  async replace(
    nanoId: string,
    params: WebhookEndpointReplaceParams,
    requestOptions?: ComposioRequestOptions
  ): Promise<WebhookEndpoint> {
    const parsedParams = WebhookEndpointReplaceParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      throw new ValidationError('Failed to parse webhook endpoint replace params', {
        cause: parsedParams.error,
      });
    }
    const result = await withCancellation(
      () =>
        this.client.webhookEndpoints.replace(
          nanoId,
          { data: parsedParams.data.data },
          requestOptions
        ),
      requestOptions?.signal
    );
    return transformWebhookEndpoint(result);
  }

  /**
   * Merge setup fields into a webhook endpoint. Omitted fields are preserved.
   *
   * @param {string} nanoId - The endpoint nano id
   * @param {WebhookEndpointUpdateParams} params - `data` with the fields to change
   * @returns {Promise<WebhookEndpoint>} The updated endpoint
   * @throws {ValidationError} If the params fail validation
   *
   * @example
   * ```typescript
   * await composio.webhooks.endpoints.update('we_abc123', {
   *   data: { signing_secret: 'rotated-secret' },
   * });
   * ```
   */
  async update(
    nanoId: string,
    params: WebhookEndpointUpdateParams,
    requestOptions?: ComposioRequestOptions
  ): Promise<WebhookEndpoint> {
    const parsedParams = WebhookEndpointUpdateParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      throw new ValidationError('Failed to parse webhook endpoint update params', {
        cause: parsedParams.error,
      });
    }
    const result = await withCancellation(
      () =>
        this.client.webhookEndpoints.update(
          nanoId,
          { data: parsedParams.data.data },
          requestOptions
        ),
      requestOptions?.signal
    );
    return transformWebhookEndpoint(result);
  }
}

/**
 * `composio.webhooks` namespace.
 *
 * - `subscriptions`: the project's outbound webhook subscription (where
 *   Composio delivers trigger and lifecycle events).
 * - `endpoints`: inbound ingress URLs for third-party providers, one per
 *   toolkit + OAuth app pair.
 *
 * @example
 * ```typescript
 * const subscription = await composio.webhooks.subscriptions.set({
 *   webhookUrl: 'https://example.com/webhooks/composio',
 * });
 * const endpoints = await composio.webhooks.endpoints.list({ toolkitSlug: 'slack' });
 * ```
 */
export class Webhooks {
  /** Manage the project's outbound webhook subscription. */
  subscriptions: WebhookSubscriptions;
  /** Manage inbound webhook endpoints per toolkit + OAuth app. */
  endpoints: WebhookEndpoints;

  constructor(client: ComposioClient) {
    this.subscriptions = new WebhookSubscriptions(client);
    this.endpoints = new WebhookEndpoints(client);
    telemetry.instrument(this, 'Webhooks');
  }
}
