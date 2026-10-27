import {
  SessionCreateParams,
  SessionPatchParams,
} from '@composio/client/resources/tool-router/session';
import {
  ToolRouterConfigTags,
  ToolRouterConfigTools,
  ToolRouterConfigToolsSchema,
  ToolRouterToolsParam,
  ToolRouterConfigManageConnectionsSchema,
  ToolRouterCreateSessionConfigSchema,
  ToolRouterToolkitsParamSchema,
  ToolRouterToolkitsDisabledConfigSchema,
  ToolRouterToolkitsEnabledConfigSchema,
  ToolRouterUpdateSessionConfigSchema,
  ToolRouterUpdateManageConnectionsConfig,
  ToolRouterUpdateManageConnectionsSchema,
  ToolRouterUpdateExperimentalConfig,
  ToolRouterSandboxConfig,
  ToolRouterInstant,
  ToolRouterProxyExecute,
  ToolRouterHook,
} from '../types/toolRouter.types';
import { ValidationError } from '../errors';
import { z } from 'zod';
import type { TypeOf } from 'zod/v3';

/** Parsed create input; the public `ToolRouterCreateSessionConfig` is a union over it. */
type ParsedCreateSessionConfig = TypeOf<typeof ToolRouterCreateSessionConfigSchema>;
/** Parsed update input; the public `ToolRouterUpdateSessionConfig` is a union over it. */
type ParsedUpdateSessionConfig = TypeOf<typeof ToolRouterUpdateSessionConfigSchema>;

/** A toolkit's entry in the session `tools` map, as sent on create and update. */
type SessionToolsEntry = NonNullable<SessionCreateParams['tools']>[string];

/** `require_approval` when the caller set an approval list, nothing otherwise. */
const requireApprovalParam = <T extends string>(
  requireApproval: T[] | undefined
): { require_approval?: T[] } =>
  requireApproval !== undefined ? { require_approval: requireApproval } : {};

export const transformToolRouterToolsParams = (
  params?: Record<string, ToolRouterToolsParam | ToolRouterConfigTools> | undefined
): Record<string, SessionToolsEntry> | undefined => {
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
              acc[key] = { enable: data.enable, ...requireApprovalParam(data.requireApproval) };
            } else if ('disable' in data) {
              acc[key] = { disable: data.disable, ...requireApprovalParam(data.requireApproval) };
            } else if ('tags' in data) {
              const tags = transformToolRouterTagsParams(data.tags);
              if (tags) {
                acc[key] = { tags, ...requireApprovalParam(data.requireApproval) };
              }
            } else {
              acc[key] = { require_approval: data.requireApproval };
            }
          } else {
            throw new ValidationError(parsedResult.error.message);
          }
        } else {
          acc[key] = { enable: params[key] };
        }
        return acc;
      },
      {} as Record<string, SessionToolsEntry>
    );
    return result;
  }
};

export const transformToolRouterTagsParams = (
  params?: ToolRouterConfigTags
):
  | Extract<NonNullable<SessionCreateParams['tools']>[string], { tags: unknown }>['tags']
  | undefined => {
  if (!params) {
    return undefined;
  }
  if (Array.isArray(params)) {
    return { enable: params };
  } else if (typeof params === 'object') {
    return {
      enable: params.enable,
      disable: params.disable,
      ...requireApprovalParam(params.requireApproval),
    };
  }
};

export const transformToolRouterManageConnectionsParams = (
  params?: boolean | z.infer<typeof ToolRouterConfigManageConnectionsSchema>
): NonNullable<SessionCreateParams['manage_connections']> => {
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

export const resolveToolRouterSandboxConfig = (
  config: Pick<ParsedCreateSessionConfig, 'sandbox' | 'workbench'>
): ParsedCreateSessionConfig['sandbox'] | ParsedCreateSessionConfig['workbench'] => {
  if (config.sandbox !== undefined && config.workbench !== undefined) {
    throw new ValidationError(
      'Pass either sandbox or workbench, not both. workbench is a backwards-compatible alias for sandbox.'
    );
  }
  return config.sandbox ?? config.workbench;
};

export const transformToolRouterSandboxParams = (
  params?: ParsedCreateSessionConfig['sandbox'] | ParsedCreateSessionConfig['workbench']
): NonNullable<SessionCreateParams['workbench']> | undefined => {
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

/** @deprecated Renamed — use `transformToolRouterSandboxParams` instead. `workbench` is a backwards-compatible alias for `sandbox`. */
export const transformToolRouterWorkbenchParams = transformToolRouterSandboxParams;

/**
 * PATCH-safe variant of transformToolRouterManageConnectionsParams.
 * Does NOT apply defaults — only includes fields explicitly present in the input.
 */
/**
 * Widens the listed keys of a generated request type so `null` can travel on
 * the wire. The spec does not mark these nullable until ComposioHQ/platform#13157
 * lands.
 */
type WithNull<T, K extends keyof T> = Omit<T, K> & { [P in K]?: NonNullable<T[P]> | null };

/**
 * `manage_connections` as sent by `session.update()`. Only the supplied
 * subfields travel; `callback_url: null` removes the stored callback.
 */
export type SessionPatchManageConnectionsBody = WithNull<
  NonNullable<SessionPatchParams['manage_connections']>,
  'callback_url'
>;

/** `multi_account` as sent by `session.update()`; `null` removes the stored maximum. */
export type SessionPatchMultiAccountBody = WithNull<
  NonNullable<SessionPatchParams['multi_account']>,
  'max_accounts_per_toolkit'
>;

/** `experimental` as sent by `session.update()`; `null` removes a stored leaf. */
export type SessionPatchExperimentalBody = WithNull<
  NonNullable<SessionPatchParams['experimental']>,
  'permissions' | 'link_url_overwrite' | 'fast_mode' | 'submit_feedback'
>;

/**
 * `hooks` as sent on create and update: `appliesTo` becomes `applies_to`.
 * Create and patch take the same hook shape.
 */
export const transformToolRouterHooksParams = (
  hooks: ToolRouterHook[]
): NonNullable<SessionCreateParams['hooks']> =>
  hooks.map(({ appliesTo, ...hook }) => ({ ...hook, applies_to: appliesTo }));

/**
 * Request body of `session.update()`. Extends the generated `SessionPatchParams`
 * with the nullable policy blocks (`null` removes the stored override) and the
 * `expected_config_version` root precondition, which the spec does not declare
 * until ComposioHQ/platform#13157 lands.
 */
export type SessionPatchBody = Omit<
  WithNull<
    SessionPatchParams,
    'toolkits' | 'tools' | 'tags' | 'auth_configs' | 'preload' | 'search' | 'execute'
  >,
  'manage_connections' | 'multi_account' | 'experimental'
> & {
  manage_connections?: SessionPatchManageConnectionsBody | null;
  multi_account?: SessionPatchMultiAccountBody | null;
  experimental?: SessionPatchExperimentalBody | null;
  expected_config_version?: number;
};

/** `proxy_execute` as sent on create and update: a boolean becomes `{ enable }`. */
export const transformToolRouterProxyExecuteParams = (
  config: ToolRouterProxyExecute
): NonNullable<SessionCreateParams['proxy_execute']> =>
  typeof config === 'boolean' ? { enable: config } : config;

export const transformToolRouterInstantParams = (
  config: ToolRouterInstant
): NonNullable<SessionCreateParams['instant']> => {
  if (config === false) return false;
  return {
    ...(config.toolkits !== undefined && { toolkits: config.toolkits }),
    ...(config.tools !== undefined && { tools: config.tools }),
    ...(config.returnInstantCharge !== undefined && {
      return_instant_charge: config.returnInstantCharge,
    }),
    ...(config.returnPricesInSearch !== undefined && {
      return_prices_in_search: config.returnPricesInSearch,
    }),
  };
};

export const transformToolRouterUpdateManageConnectionsParams = (
  params: boolean | ToolRouterUpdateManageConnectionsConfig
): SessionPatchManageConnectionsBody => {
  if (typeof params === 'boolean') {
    return { enable: params };
  }

  const parsedResult = ToolRouterUpdateManageConnectionsSchema.safeParse(params);
  if (!parsedResult.success) {
    throw new ValidationError('Failed to parse manage connections config', {
      cause: parsedResult.error,
    });
  }

  const config = parsedResult.data;
  const result: SessionPatchManageConnectionsBody = {};
  if (config.enable !== undefined) {
    result.enable = config.enable;
  }
  if (config.callbackUrl !== undefined) {
    result.callback_url = config.callbackUrl;
  }
  if (config.waitForConnections !== undefined) {
    result.enable_wait_for_connections = config.waitForConnections;
  }
  if (config.enableConnectionRemoval !== undefined) {
    result.enable_connection_removal = config.enableConnectionRemoval;
  }
  return result;
};

const transformToolRouterUpdateExperimentalParams = (
  config: ToolRouterUpdateExperimentalConfig
): SessionPatchExperimentalBody => {
  const result: SessionPatchExperimentalBody = {};
  if (config.permissions !== undefined) {
    result.permissions = config.permissions;
  }
  if (config.linkUrlOverwrite !== undefined) {
    result.link_url_overwrite = config.linkUrlOverwrite;
  }
  if (config.fastMode !== undefined) {
    result.fast_mode = config.fastMode;
  }
  if (config.submitFeedback !== undefined) {
    result.submit_feedback = config.submitFeedback;
  }
  if (config.sessionConfigId !== undefined) {
    result.session_config_id = config.sessionConfigId;
  }
  if (config.noElicitationSupportFallback !== undefined) {
    result.no_elicitation_support_fallback = config.noElicitationSupportFallback;
  }
  return result;
};

/**
 * PATCH-safe variant of transformToolRouterSandboxParams.
 * Does NOT apply `enable ?? true` default — only includes fields explicitly present.
 */
export const transformToolRouterUpdateSandboxParams = (
  params: Partial<ToolRouterSandboxConfig>
): NonNullable<SessionPatchParams['workbench']> => {
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
  return result as NonNullable<SessionPatchParams['workbench']>;
};

/** @deprecated Renamed — use `transformToolRouterUpdateSandboxParams` instead. `workbench` is a backwards-compatible alias for `sandbox`. */
export const transformToolRouterUpdateWorkbenchParams = transformToolRouterUpdateSandboxParams;

export const transformToolRouterMultiAccountParams = (
  params?: ParsedCreateSessionConfig['multiAccount']
): NonNullable<SessionCreateParams['multi_account']> | undefined => {
  if (!params) {
    return undefined;
  }

  const transformedParams = {
    enable: params.enable,
    max_accounts_per_toolkit: params.maxAccountsPerToolkit,
    require_explicit_selection:
      params.requireExplicitSelection ?? (params.enable ? true : undefined),
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
  params?: ParsedCreateSessionConfig['toolkits']
): NonNullable<SessionCreateParams['toolkits']> | undefined => {
  if (!params) {
    return undefined;
  }

  // If it's an array, convert to enable format
  if (Array.isArray(params)) {
    return { enable: params };
  }

  if ('enable' in params) {
    return { enable: params.enable, ...requireApprovalParam(params.requireApproval) };
  }
  if ('disable' in params) {
    return { disable: params.disable, ...requireApprovalParam(params.requireApproval) };
  }
  return { require_approval: params.requireApproval };
};

/**
 * Request body of `session.update()`. Every key present in `config` is sent,
 * including `null` (remove the stored override) and empty collections (an
 * empty toolkit allowlist denies every app toolkit). The
 * `expectedConfigVersion` option is not a body field here: the session
 * adds it only when the caller explicitly supplies a numeric version.
 */
export const transformToolRouterUpdateParams = (
  config: ParsedUpdateSessionConfig
): SessionPatchBody => {
  const params: SessionPatchBody = {};

  if (config.toolkits !== undefined) {
    params.toolkits =
      config.toolkits === null ? null : transformToolRouterToolkitsParams(config.toolkits);
  }
  if (config.instant !== undefined) {
    params.instant = transformToolRouterInstantParams(config.instant);
  }
  if (config.tools !== undefined) {
    params.tools = config.tools === null ? null : transformToolRouterToolsParams(config.tools);
  }
  if (config.tags !== undefined) {
    params.tags = config.tags === null ? null : transformToolRouterTagsParams(config.tags);
  }
  if (config.authConfigs !== undefined) {
    params.auth_configs = config.authConfigs;
  }
  if (config.connectedAccounts !== undefined) {
    params.connected_accounts = config.connectedAccounts;
  }
  if (config.manageConnections !== undefined) {
    params.manage_connections =
      config.manageConnections === null
        ? null
        : transformToolRouterUpdateManageConnectionsParams(config.manageConnections);
  }
  const sandboxConfig = config.sandbox !== undefined ? config.sandbox : config.workbench;
  if (sandboxConfig !== undefined) {
    params.workbench =
      sandboxConfig === null ? null : transformToolRouterUpdateSandboxParams(sandboxConfig);
  }
  if (config.multiAccount !== undefined) {
    if (config.multiAccount === null) {
      params.multi_account = null;
    } else {
      const ma: SessionPatchMultiAccountBody = {};
      if (config.multiAccount.enable !== undefined) ma.enable = config.multiAccount.enable;
      if (config.multiAccount.maxAccountsPerToolkit !== undefined)
        ma.max_accounts_per_toolkit = config.multiAccount.maxAccountsPerToolkit;
      if (config.multiAccount.requireExplicitSelection !== undefined)
        ma.require_explicit_selection = config.multiAccount.requireExplicitSelection;
      params.multi_account = ma;
    }
  }
  if (config.proxyExecute !== undefined) {
    params.proxy_execute =
      config.proxyExecute === null
        ? null
        : transformToolRouterProxyExecuteParams(config.proxyExecute);
  }
  if (config.hooks !== undefined) {
    params.hooks = config.hooks === null ? null : transformToolRouterHooksParams(config.hooks);
  }
  if (config.preload !== undefined) {
    params.preload = config.preload;
  }
  if (config.search !== undefined) {
    params.search = config.search;
  }
  if (config.execute !== undefined) {
    params.execute =
      config.execute === null
        ? null
        : config.execute.enableMultiExecute === undefined
          ? {}
          : { enable_multi_execute: config.execute.enableMultiExecute };
  }
  if (config.experimental !== undefined) {
    params.experimental =
      config.experimental === null
        ? null
        : transformToolRouterUpdateExperimentalParams(config.experimental);
  }

  return params;
};
