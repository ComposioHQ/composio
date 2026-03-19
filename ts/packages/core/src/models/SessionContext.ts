/**
 * @fileoverview Session context implementation injected into custom tool execute functions.
 */
import { Composio as ComposioClient } from '@composio/client';
import type { SessionContext, CustomToolsMap } from '../types/customTool.types';
import type { ToolExecuteResponse } from '../types/tool.types';
import type { SessionProxyExecuteParams, ToolRouterSessionProxyExecuteResponse } from '../types/toolRouter.types';
import { SessionProxyExecuteParamsSchema } from '../types/toolRouter.types';
import { ValidationError } from '../errors';
import { transformProxyParams } from './proxyParamsTransform';
import { findCustomTool, executeCustomTool } from './customToolExecution';

/**
 * Concrete implementation of SessionContext.
 * One instance is created per session (or per multi-execute batch) and shared
 * across all custom tool invocations, including sibling routing.
 *
 * When `customToolsMap` is provided, `execute()` checks local tools first
 * before falling back to the backend API. This allows tool A to call tool B
 * via `session.execute('B', ...)` without hitting the network.
 */
export class SessionContextImpl implements SessionContext {
  public readonly userId: string;

  constructor(
    private readonly client: ComposioClient,
    userId: string,
    private readonly sessionId: string,
    private readonly customToolsMap?: CustomToolsMap
  ) {
    this.userId = userId;
  }

  /**
   * Execute any tool from within a custom tool.
   * Routes to sibling local tools in-process when available,
   * otherwise delegates to the backend API.
   */
  async execute(
    toolSlug: string,
    arguments_: Record<string, unknown>
  ): Promise<ToolExecuteResponse> {
    // Try local tool first (sibling routing)
    const entry = findCustomTool(this.customToolsMap, toolSlug);
    if (entry) {
      return executeCustomTool(entry, arguments_, this);
    }

    // Fall back to remote execution
    const response = await this.client.toolRouter.session.execute(
      this.sessionId,
      {
        tool_slug: toolSlug,
        arguments: arguments_,
      }
    );
    return {
      data: response.data,
      error: response.error,
      successful: !response.error,
    };
  }

  /**
   * Proxy API calls through Composio's auth layer.
   * The backend resolves the connected account from the toolkit within the session.
   */
  async proxyExecute(params: SessionProxyExecuteParams): Promise<ToolRouterSessionProxyExecuteResponse> {
    const validated = SessionProxyExecuteParamsSchema.safeParse(params);
    if (!validated.success) {
      throw new ValidationError('Invalid proxy execute parameters', { cause: validated.error });
    }

    const clientParams = transformProxyParams(validated.data);
    const response = await this.client.toolRouter.session.proxyExecute(
      this.sessionId,
      clientParams
    );

    return {
      status: response.status,
      data: response.data,
      headers: response.headers,
      ...(response.binary_data ? {
        binaryData: {
          contentType: response.binary_data.content_type,
          size: response.binary_data.size,
          url: response.binary_data.url,
          expiresAt: response.binary_data.expires_at,
        },
      } : {}),
    };
  }
}
