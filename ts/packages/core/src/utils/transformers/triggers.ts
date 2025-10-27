import {
  TriggersTypeRetrieveResponse as RawTriggersTypeRetrieveResponse,
  TriggersTypeListResponse as RawTriggersTypeListResponse,
} from '@composio/client/resources/triggers-types';
import { TriggerInstanceListActiveResponse as RawTriggerInstanceListActiveResponse } from '@composio/client/resources/index';
import {
  IncomingTriggerPayload,
  IncomingTriggerPayloadSchema,
  TriggerData,
  TriggersTypeRetrieveResponse,
  TriggerTypeSchema,
  TriggersTypeListResponse,
  TriggersTypeListResponseSchema,
  TriggerInstanceListActiveResponse,
  TriggerInstanceListActiveResponseSchema,
  TriggerInstanceListActiveResponseItem,
  TriggerInstanceListActiveResponseItemSchema,
} from '../../types/triggers.types';
import { transform } from '../transform';

export function transformIncomingTriggerPayload(response: TriggerData): IncomingTriggerPayload {
  return transform(response)
    .with(IncomingTriggerPayloadSchema)
    .using(response => ({
      id: response.metadata.nanoId,
      uuid: response.metadata.id,
      triggerSlug: response.metadata.triggerName,
      toolkitSlug: response.appName,
      userId: response.metadata.connection?.clientUniqueUserId,
      payload: response.payload,
      originalPayload: response.originalPayload,
      metadata: {
        id: response.metadata.nanoId,
        uuid: response.metadata.id,
        triggerConfig: response.metadata.triggerConfig,
        triggerSlug: response.metadata.triggerName,
        toolkitSlug: response.appName,
        triggerData: response.metadata.triggerData,
        connectedAccount: {
          id: response.metadata.connection?.connectedAccountNanoId,
          uuid: response.metadata.connection?.id,
          authConfigId: response.metadata.connection?.authConfigNanoId,
          authConfigUUID: response.metadata.connection?.integrationId,
          userId: response.metadata.connection?.clientUniqueUserId,
          status: response.metadata.connection?.status as 'ACTIVE' | 'INACTIVE',
        },
      },
    }));
}

export function transformTriggerTypeRetrieveResponse(
  response: RawTriggersTypeRetrieveResponse
): TriggersTypeRetrieveResponse {
  return transform(response)
    .with(TriggerTypeSchema)
    .using(response => ({
      slug: response.slug,
      name: response.name,
      description: response.description,
      instructions: response.instructions,
      toolkit: {
        logo: response.toolkit.logo,
        slug: response.toolkit.slug,
        name: response.toolkit.name,
      },
      version: response.version,
      payload: response.payload,
      config: response.config,
    }));
}

export function transformTriggerTypeListResponse(
  response: RawTriggersTypeListResponse
): TriggersTypeListResponse {
  return transform(response)
    .with(TriggersTypeListResponseSchema)
    .using(response => ({
      items: response.items,
      nextCursor: response.next_cursor ?? null,
      totalPages: response.total_pages,
    }));
}

/**
 * Parse the trigger instance list active item
 *
 * @param response - The response from the composio client
 * @returns The parsed trigger instance list active item
 */
export function transformTriggerInstanceListActiveItem(
  response: RawTriggerInstanceListActiveResponse['items'][0]
): TriggerInstanceListActiveResponseItem {
  return transform(response)
    .with(TriggerInstanceListActiveResponseItemSchema)
    .using(response => ({
      id: response.id,
      connectedAccountId: response.connected_account_id,
      disabledAt: response.disabled_at,
      state: response.state,
      triggerConfig: response.trigger_config,
      triggerName: response.trigger_name,
      updatedAt: response.updated_at,
      triggerData: response.trigger_data,
      uuid: response.uuid,
    }));
}

export function transformTriggerInstanceListActiveResponse(
  response: RawTriggerInstanceListActiveResponse
): TriggerInstanceListActiveResponse {
  return transform(response)
    .with(TriggerInstanceListActiveResponseSchema)
    .using(response => ({
      items: response.items.map(item => transformTriggerInstanceListActiveItem(item)),
      nextCursor: response.next_cursor ?? null,
      totalPages: response.total_pages,
    }));
}
