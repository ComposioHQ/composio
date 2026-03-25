import { SessionCreateParams } from '@composio/client/resources/tool-router/session/session.mjs';
import {
  ToolRouterConfigTags,
  ToolRouterConfigTools,
  ToolRouterConfigToolsSchema,
  ToolRouterToolsParam,
  ToolRouterConfigManageConnectionsSchema,
  ToolRouterCreateSessionConfig,
  ToolRouterToolkitsParamSchema,
  ToolRouterToolkitsDisabledConfigSchema,
  ToolRouterToolkitsEnabledConfigSchema,
} from '../types/toolRouter.types';
import { ValidationError } from '../errors';
import { z } from 'zod';

export const transformToolRouterToolsParams = (
  params?: Record<string, ToolRouterToolsParam | ToolRouterConfigTools> | undefined
):
  | Record<
      string,
      SessionCreateParams.Enable | SessionCreateParams.Disable | SessionCreateParams.Tags
    >
  | undefined => {
  if (!params) {
    return undefined;
  }

  if (typeof params === 'object') {
    const result = Object.keys(params).reduce(
      (acc, key) => {
        if (Array.isArray(params[key])) {
          acc[key] = { enable: params[key] };
        } else if (typeof params[key] === 'object') {
          const parsedResult = ToolRouterConfigToolsSchema.safeParse(params[key]);
          if (parsedResult.success) {
            const data = parsedResult.data;
            if (Array.isArray(data)) {
              acc[key] = { enable: data };
            } else if ('enable' in data) {
              acc[key] = { enable: data.enable };
            } else if ('disable' in data) {
              acc[key] = { disable: data.disable };
            } else if ('tags' in data) {
              const tags = transformToolRouterTagsParams(data.tags);
              if (tags) {
                acc[key] = { tags };
              }
            }
          } else {
            throw new ValidationError(parsedResult.error.message);
          }
        } else {
          acc[key] = { enable: params[key] };
        }
        return acc;
      },
      {} as Record<
        string,
        SessionCreateParams.Enable | SessionCreateParams.Disable | SessionCreateParams.Tags
      >
    );
    return result;
  }
};

export const transformToolRouterTagsParams = (
  params?: ToolRouterConfigTags
): SessionCreateParams.Tags['tags'] | undefined => {
  if (!params) {
    return undefined;
  }
  if (Array.isArray(params)) {
    return { enable: params };
  } else if (typeof params === 'object') {
    return {
      enable: params.enable,
      disable: params.disable,
    };
  }
};

export const transformToolRouterManageConnectionsParams = (
  params?: boolean | z.infer<typeof ToolRouterConfigManageConnectionsSchema>
): SessionCreateParams.ManageConnections => {
  if (params === undefined) {
    // Default case when params is undefined
    return {
      enable: true,
    };
  }

  if (typeof params === 'boolean') {
    return {
      enable: params,
    };
  }

  // Parse the params using the zod schema for type safety
  const parsedResult = ToolRouterConfigManageConnectionsSchema.safeParse(params);
  if (!parsedResult.success) {
    throw new ValidationError('Failed to parse manage connections config', {
      cause: parsedResult.error,
    });
  }

  const config = parsedResult.data;
  return {
    enable: config.enable ?? true,
    callback_url: config.callbackUrl,
    enable_wait_for_connections: config.waitForConnections,
  };
};

/**
 * Transforms the SDK's camelCase workbench configuration into the snake_case
 * format expected by the session creation API.
 *
 * The workbench is a persistent Python sandbox that provides code execution tools
 * (`COMPOSIO_REMOTE_WORKBENCH` and `COMPOSIO_REMOTE_BASH_TOOL`) within a session.
 *
 * @param params - Workbench configuration from the session config.
 * @param params.enable - Master switch for the workbench. When `false`, no code
 *   execution tools are available in the session. Defaults to `true`.
 * @param params.enableProxyExecution - Whether to allow `proxy_execute()` calls
 *   in the workbench sandbox. When `false`, prevents arbitrary HTTP requests.
 * @param params.autoOffloadThreshold - Maximum execution payload size (in characters).
 *   Responses larger than this are automatically offloaded to the workbench.
 * @returns The transformed workbench params for the API, or `undefined` if no config was provided.
 */
export const transformToolRouterWorkbenchParams = (
  params?: ToolRouterCreateSessionConfig['workbench']
): SessionCreateParams.Workbench | undefined => {
  if (!params) {
    return undefined;
  }

  return {
    enable: params.enable ?? true,
    enable_proxy_execution: params.enableProxyExecution,
    auto_offload_threshold: params.autoOffloadThreshold,
  };
};

export const transformToolRouterToolkitsParams = (
  params?: ToolRouterCreateSessionConfig['toolkits']
): SessionCreateParams.Enable | SessionCreateParams.Disable | undefined => {
  if (!params) {
    return undefined;
  }

  // If it's an array, convert to enable format
  if (Array.isArray(params)) {
    return { enable: params };
  }

  // Otherwise return as-is (already in enable/disable format)
  return params as SessionCreateParams.Enable | SessionCreateParams.Disable;
};
