import type {
  SessionConfigsListResponse as RawSessionConfigListResponse,
  SessionConfigsRetrieveResponse as RawSessionConfig,
} from '@composio/client/resources/session-configs';
import {
  SessionConfig,
  SessionConfigListResponse,
  SessionConfigListResponseSchema,
  SessionConfigSchema,
  SessionConfigSummary,
  SessionConfigSummarySchema,
} from '../../types/sessionConfigs.types';
import { transform } from '../transform';

export const transformSessionConfigSummary = (
  response: RawSessionConfigListResponse['items'][number]
): SessionConfigSummary => {
  return transform(response)
    .with(SessionConfigSummarySchema)
    .using(response => ({
      id: response.id,
      name: response.name,
      archived: response.archived,
      createdAt: response.created_at,
      updatedAt: response.updated_at,
    }));
};

export const transformSessionConfigListResponse = (
  response: RawSessionConfigListResponse
): SessionConfigListResponse => {
  return transform(response)
    .with(SessionConfigListResponseSchema)
    .using(response => ({
      items: response.items.map(transformSessionConfigSummary),
      nextCursor: response.next_cursor,
    }));
};

export const transformSessionConfig = (response: RawSessionConfig): SessionConfig => {
  return transform(response)
    .with(SessionConfigSchema)
    .using(response => ({
      id: response.id,
      name: response.name,
      description: response.description,
      archived: response.archived,
      // The policy keeps the backend's wire shape: copy it as-is so toolkit
      // slugs and tag names survive.
      config: response.config,
      createdAt: response.created_at,
      updatedAt: response.updated_at,
    }));
};
