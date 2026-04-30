import { Composio as ComposioClient } from '@composio/client';
import type {
  SessionCreateParams,
  SessionCreateResponse,
  SessionRetrieveResponse,
  SessionToolsResponse,
} from '@composio/client/resources/tool-router/session/session.mjs';
import { SessionPreset } from '../types/toolRouter.types';

export const TOOL_ROUTER_SESSION_TOOLS_PAGE_LIMIT = 500;

export type SessionConfigWithPreset = (
  | SessionCreateResponse.Config
  | SessionRetrieveResponse.Config
) & {
  session_preset?: SessionPreset | null;
};

export type SessionCreateParamsV31 = SessionCreateParams & {
  session_preset?: SessionPreset;
};

export type SessionCreateResponseV31 = Omit<SessionCreateResponse, 'config'> & {
  config: SessionConfigWithPreset;
};

export type SessionToolsResponseV31 = SessionToolsResponse & {
  next_cursor?: string | null;
  total_pages?: number;
};

const encodePathSegment = (value: string): string => encodeURIComponent(value);

export const createToolRouterSessionV31 = (
  client: ComposioClient,
  payload: SessionCreateParamsV31
): Promise<SessionCreateResponseV31> => {
  return client.post('/api/v3.1/tool_router/session', { body: payload });
};

export const listToolRouterSessionToolsV31 = (
  client: ComposioClient,
  sessionId: string,
  query?: { cursor?: string | null; limit?: number }
): Promise<SessionToolsResponseV31> => {
  return client.get(`/api/v3.1/tool_router/session/${encodePathSegment(sessionId)}/tools`, {
    query,
  });
};

export const listAllToolRouterSessionToolsV31 = async (
  client: ComposioClient,
  sessionId: string
): Promise<SessionToolsResponse['items']> => {
  const items: SessionToolsResponse['items'] = [];
  let cursor: string | null | undefined;

  do {
    const response = await listToolRouterSessionToolsV31(client, sessionId, {
      limit: TOOL_ROUTER_SESSION_TOOLS_PAGE_LIMIT,
      ...(cursor ? { cursor } : {}),
    });
    items.push(...response.items);
    cursor = response.next_cursor;
  } while (cursor);

  return items;
};
