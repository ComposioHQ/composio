import type ComposioClient from '@composio/client';
import type { ComposioRequestOptions } from '../types/requestOptions.types';
import type { ToolRouterSessionDeleteResponse } from '../types/toolRouter.types';
import { ToolRouterSessionDeleteResponseSchema } from '../types/toolRouter.types';
import { withCancellation } from '../utils/cancellation';

type ToolRouterSessionDeleteWireResponse = {
  session_id: string;
  deleted: true;
};

export async function deleteToolRouterSession(
  client: ComposioClient,
  sessionId: string,
  requestOptions?: ComposioRequestOptions
): Promise<ToolRouterSessionDeleteResponse> {
  const response = await withCancellation(
    () =>
      client.delete<ToolRouterSessionDeleteWireResponse>(
        `/api/v3.1/tool_router/session/${encodeURIComponent(sessionId)}`,
        requestOptions
      ),
    requestOptions?.signal
  );

  return ToolRouterSessionDeleteResponseSchema.parse({
    sessionId: response.session_id,
    deleted: response.deleted,
  });
}
