import type {
  WebhookSubscriptionCreateResponse as RawWebhookSubscriptionCreateResponse,
  WebhookSubscriptionDeleteResponse as RawWebhookSubscriptionDeleteResponse,
  WebhookSubscriptionListEventTypesResponse as RawWebhookSubscriptionListEventTypesResponse,
  WebhookSubscriptionListResponse as RawWebhookSubscriptionListResponse,
  WebhookSubscriptionRetrieveResponse as RawWebhookSubscriptionRetrieveResponse,
  WebhookSubscriptionRotateSecretResponse as RawWebhookSubscriptionRotateSecretResponse,
  WebhookSubscriptionUpdateResponse as RawWebhookSubscriptionUpdateResponse,
} from '@composio/client/resources/webhook-subscriptions';
import type {
  WebhookEndpointCreateResponse as RawWebhookEndpointCreateResponse,
  WebhookEndpointListResponse as RawWebhookEndpointListResponse,
  WebhookEndpointReplaceResponse as RawWebhookEndpointReplaceResponse,
  WebhookEndpointRetrieveResponse as RawWebhookEndpointRetrieveResponse,
  WebhookEndpointUpdateResponse as RawWebhookEndpointUpdateResponse,
} from '@composio/client/resources/webhook-endpoints';
import type { WebhookSubscription } from '../../types/triggers.types';
import {
  WebhookEndpoint,
  WebhookEndpointListResponse,
  WebhookEndpointListResponseSchema,
  WebhookEndpointSchema,
  WebhookSubscriptionEventTypesResponse,
  WebhookSubscriptionEventTypesResponseSchema,
  WebhookSubscriptionDeleteResponse,
  WebhookSubscriptionDeleteResponseSchema,
  WebhookSubscriptionListResponse,
  WebhookSubscriptionListResponseSchema,
  WebhookSubscriptionRotateSecretResponse,
  WebhookSubscriptionRotateSecretResponseSchema,
  WebhookSubscriptionSchema,
} from '../../types/webhooks.types';
import { transform } from '../transform';

/**
 * Every subscription read/write on the wire returns the same object; the
 * generated client only gives it a different nominal name per operation.
 */
export type RawWebhookSubscription =
  | RawWebhookSubscriptionCreateResponse
  | RawWebhookSubscriptionRetrieveResponse
  | RawWebhookSubscriptionUpdateResponse
  | RawWebhookSubscriptionListResponse['items'][number];

export const transformWebhookSubscription = (
  response: RawWebhookSubscription
): WebhookSubscription => {
  // Map to camelCase explicitly — do NOT spread `...response`, or the wire's
  // snake_case keys (webhook_url, enabled_events, created_at, ...) leak into
  // the public object alongside their camelCase counterparts.
  return transform(response)
    .with(WebhookSubscriptionSchema)
    .using(response => ({
      id: response.id,
      webhookUrl: response.webhook_url,
      version: response.version,
      enabledEvents: response.enabled_events,
      secret: response.secret,
      createdAt: response.created_at,
      updatedAt: response.updated_at,
    }));
};

export const transformWebhookSubscriptionListResponse = (
  response: RawWebhookSubscriptionListResponse
): WebhookSubscriptionListResponse => {
  return transform(response)
    .with(WebhookSubscriptionListResponseSchema)
    .using(response => ({
      items: response.items.map(transformWebhookSubscription),
      nextCursor: response.next_cursor ?? null,
      totalPages: response.total_pages,
      currentPage: response.current_page,
      totalItems: response.total_items,
    }));
};

export const transformWebhookSubscriptionDeleteResponse = (
  response: RawWebhookSubscriptionDeleteResponse
): WebhookSubscriptionDeleteResponse => {
  return transform(response)
    .with(WebhookSubscriptionDeleteResponseSchema)
    .using(response => ({ success: response.success }));
};

export const transformWebhookSubscriptionRotateSecretResponse = (
  response: RawWebhookSubscriptionRotateSecretResponse
): WebhookSubscriptionRotateSecretResponse => {
  return transform(response)
    .with(WebhookSubscriptionRotateSecretResponseSchema)
    .using(response => ({ id: response.id, secret: response.secret }));
};

export const transformWebhookSubscriptionEventTypesResponse = (
  response: RawWebhookSubscriptionListEventTypesResponse
): WebhookSubscriptionEventTypesResponse => {
  return transform(response)
    .with(WebhookSubscriptionEventTypesResponseSchema)
    .using(response => ({
      items: response.items.map(item => ({
        eventType: item.event_type,
        description: item.description,
        supportedVersions: item.supported_versions,
      })),
    }));
};

export type RawWebhookEndpoint =
  | RawWebhookEndpointCreateResponse
  | RawWebhookEndpointRetrieveResponse
  | RawWebhookEndpointReplaceResponse
  | RawWebhookEndpointUpdateResponse;

export const transformWebhookEndpoint = (response: RawWebhookEndpoint): WebhookEndpoint => {
  return transform(response)
    .with(WebhookEndpointSchema)
    .using(response => ({
      id: response.id,
      toolkitSlug: response.toolkit_slug,
      clientId: response.client_id,
      webhookUrl: response.webhook_url,
      data: response.data,
      createdAt: response.created_at,
    }));
};

export const transformWebhookEndpointListResponse = (
  response: RawWebhookEndpointListResponse
): WebhookEndpointListResponse => {
  return transform(response)
    .with(WebhookEndpointListResponseSchema)
    .using(response => ({
      items: response.items.map(item => ({
        id: item.id,
        toolkitSlug: item.toolkit_slug,
        clientId: item.client_id,
      })),
    }));
};
