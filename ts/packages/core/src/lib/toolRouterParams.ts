import {
  SessionCreateParams,
  SessionPatchParams,
} from '@composio/client/resources/tool-router/session/session.mjs';
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
  ToolRouterUpdateSessionConfig,
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
    sandbox_size: params.sandboxSize,
  };
};

/**
 * PATCH-safe variant of transformToolRouterManageConnectionsParams.
 * Does NOT apply defaults — only includes fields explicitly present in the input.
 */
export const transformToolRouterUpdateManageConnectionsParams = (
  params: boolean | z.infer<typeof ToolRouterConfigManageConnectionsSchema>
): SessionPatchParams.ManageConnections => {
  if (typeof params === 'boolean') {
    return { enable: params };
  }

  const parsedResult = ToolRouterConfigManageConnectionsSchema.safeParse(params);
  if (!parsedResult.success) {
    throw new ValidationError('Failed to parse manage connections config', {
      cause: parsedResult.error,
    });
  }

  const config = parsedResult.data;
  const result: Record<string, unknown> = {};
  if (config.enable !== undefined) {
    result.enable = config.enable;
  }
  if (config.callbackUrl !== undefined) {
    result.callback_url = config.callbackUrl;
  }
  if (config.waitForConnections !== undefined) {
    result.enable_wait_for_connections = config.waitForConnections;
  }
  return result as SessionPatchParams.ManageConnections;
};

/**
 * PATCH-safe variant of transformToolRouterWorkbenchParams.
 * Does NOT apply `enable ?? true` default — only includes fields explicitly present.
 */
export const transformToolRouterUpdateWorkbenchParams = (
  params: {
    enable?: boolean;
    enableProxyExecution?: boolean;
    autoOffloadThreshold?: number;
    sandboxSize?: 'standard' | 'medium' | 'large' | 'xlarge';
  }
): SessionPatchParams.Workbench => {
  const result: Record<string, unknown> = {};
  if (params.enable !== undefined) {
    result.enable = params.enable;
  }
  if (params.enableProxyExecution !== undefined) {
    result.enable_proxy_execution = params.enableProxyExecution;
  }
  if (params.autoOffloadThreshold !== undefined) {
    result.auto_offload_threshold = params.autoOffloadThreshold;
  }
  if (params.sandboxSize !== undefined) {
    result.sandbox_size = params.sandboxSize;
  }
  return result as SessionPatchParams.Workbench;
};

export const transformToolRouterMultiAccountParams = (
  params?: ToolRouterCreateSessionConfig['multiAccount']
): SessionCreateParams.MultiAccount | undefined => {
  if (!params) {
    return undefined;
  }

  const transformedParams = {
    enable: params.enable,
    max_accounts_per_toolkit: params.maxAccountsPerToolkit,
    require_explicit_selection: params.requireExplicitSelection ?? (params.enable ? true : undefined),
  };

  if (
    transformedParams.enable === undefined &&
    transformedParams.max_accounts_per_toolkit === undefined &&
    transformedParams.require_explicit_selection === undefined
  ) {
    return undefined;
  }

  return transformedParams;
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

export const transformToolRouterUpdateParams = (
  config: ToolRouterUpdateSessionConfig
): SessionPatchParams => {
  const params: SessionPatchParams = {};

  if (config.toolkits !== undefined) {
    params.toolkits = transformToolRouterToolkitsParams(config.toolkits);
  }
  if (config.tools !== undefined) {
    params.tools = transformToolRouterToolsParams(config.tools);
  }
  if (config.tags !== undefined) {
    params.tags = transformToolRouterTagsParams(config.tags);
  }
  if (config.authConfigs !== undefined) {
    params.auth_configs = config.authConfigs;
  }
  if (config.connectedAccounts !== undefined) {
    const coerced: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(config.connectedAccounts)) {
      coerced[k] = typeof v === 'string' ? [v] : v;
    }
    params.connected_accounts = coerced;
  }
  if (config.manageConnections !== undefined) {
    if (config.manageConnections === null) {
      params.manage_connections = null;
    } else {
      params.manage_connections = transformToolRouterUpdateManageConnectionsParams(config.manageConnections);
    }
  }
  if (config.workbench !== undefined) {
    if (config.workbench === null) {
      params.workbench = null;
    } else {
      params.workbench = transformToolRouterUpdateWorkbenchParams(config.workbench);
    }
  }
  if (config.multiAccount !== undefined) {
    if (config.multiAccount === null) {
      params.multi_account = null;
    } else {
      const ma: Record<string, unknown> = {};
      if (config.multiAccount.enable !== undefined) ma.enable = config.multiAccount.enable;
      if (config.multiAccount.maxAccountsPerToolkit !== undefined) ma.max_accounts_per_toolkit = config.multiAccount.maxAccountsPerToolkit;
      if (config.multiAccount.requireExplicitSelection !== undefined) ma.require_explicit_selection = config.multiAccount.requireExplicitSelection;
      params.multi_account = ma as SessionPatchParams.MultiAccount;
    }
  }
  if (config.preload !== undefined) {
    params.preload = config.preload;
  }

  return params;
};
