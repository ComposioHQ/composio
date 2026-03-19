/**
 * @fileoverview Shared transform for converting SDK SessionProxyExecuteParams
 * to the official @composio/client proxy execute params.
 */
import type { SessionProxyExecuteParams } from '../types/toolRouter.types';
import type { SessionProxyExecuteParams as ClientProxyExecuteParams } from '@composio/client/resources/tool-router/session/session.mjs';

/**
 * Transform SDK session proxy params to the official client request format.
 * Converts SDK-facing `toolkit` → `toolkit_slug` and `parameters[].in` → `parameters[].type`.
 */
export function transformProxyParams(params: SessionProxyExecuteParams): ClientProxyExecuteParams {
  const parameters: ClientProxyExecuteParams['parameters'] = params.parameters?.map(p => ({
    name: p.name,
    type: p.in as 'header' | 'query',
    value: p.value.toString(),
  }));

  return {
    toolkit_slug: params.toolkit,
    endpoint: params.endpoint,
    method: params.method,
    ...(params.body !== undefined ? { body: params.body } : {}),
    ...(parameters?.length ? { parameters } : {}),
  };
}
