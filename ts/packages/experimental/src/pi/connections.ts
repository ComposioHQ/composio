import type {
  PiComposioSessionLike,
  PiConnectionHandlers,
  PiConnectionManagementContext,
  PiConnectionManagementResult,
  PiConnectionToolkitResult,
  PiProviderOptions,
  PiSessionToolCapabilities,
  PiSessionToolOptions,
} from './types';
import { stringValue } from './utils';

export const defaultIsToolkitConnected = (state: unknown): boolean => {
  if (!state || typeof state !== 'object') return false;
  const record = state as Record<string, unknown>;
  if (record.isNoAuth === true || record.is_no_auth === true) return true;
  if (typeof record.isConnected === 'boolean') return record.isConnected;
  if (typeof record.is_connected === 'boolean') return record.is_connected;

  const connection = record.connection as Record<string, unknown> | undefined;
  if (connection) {
    if (connection.isActive === true || connection.is_active === true) return true;
    if (connection.status === 'ACTIVE') return true;
    const nestedConnectedAccount = connection.connectedAccount as
      | Record<string, unknown>
      | undefined;
    if (nestedConnectedAccount?.status === 'ACTIVE') return true;
    const nestedConnectedAccountSnake = connection.connected_account as
      | Record<string, unknown>
      | undefined;
    if (nestedConnectedAccountSnake?.status === 'ACTIVE') return true;
  }

  const connectedAccount = record.connectedAccount as Record<string, unknown> | undefined;
  if (connectedAccount?.status === 'ACTIVE') return true;
  const connectedAccountSnake = record.connected_account as Record<string, unknown> | undefined;
  if (connectedAccountSnake?.status === 'ACTIVE') return true;

  return false;
};

const toolkitKeyFromState = (state: unknown): string | undefined => {
  if (!state || typeof state !== 'object') return undefined;
  const record = state as Record<string, unknown>;
  const toolkit = record.toolkit as Record<string, unknown> | undefined;
  return (
    stringValue(record.slug) ??
    stringValue(record.toolkitSlug) ??
    stringValue(record.toolkit_slug) ??
    stringValue(record.name) ??
    stringValue(toolkit?.slug)
  );
};

export const normalizeToolkitStateMap = (
  raw: unknown,
  requestedToolkits: string[]
): Map<string, unknown> => {
  const byToolkit = new Map<string, unknown>();
  const addState = (toolkit: string | undefined, state: unknown) => {
    if (toolkit) byToolkit.set(toolkit.toLowerCase(), state);
  };

  if (!raw) return byToolkit;

  if (Array.isArray(raw)) {
    raw.forEach((state, index) =>
      addState(toolkitKeyFromState(state) ?? requestedToolkits[index], state)
    );
    return byToolkit;
  }

  if (typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    if (Array.isArray(record.items)) {
      record.items.forEach((state, index) =>
        addState(toolkitKeyFromState(state) ?? requestedToolkits[index], state)
      );
      return byToolkit;
    }

    for (const toolkit of requestedToolkits) {
      if (record[toolkit] !== undefined) {
        addState(toolkit, record[toolkit]);
      }
    }

    if (byToolkit.size === 0 && requestedToolkits.length === 1) {
      addState(toolkitKeyFromState(raw) ?? requestedToolkits[0], raw);
    }
  }

  return byToolkit;
};

export const formatDefaultConnectionResult = <TState, TAuthorizeResult>(
  results: Record<string, PiConnectionToolkitResult<TState, TAuthorizeResult>>
): PiConnectionManagementResult<TState, TAuthorizeResult> => {
  const missing = Object.values(results).filter(result => !result.connected).length;
  return {
    successful: true,
    data: {
      message:
        missing === 0
          ? 'All requested toolkits are connected.'
          : 'Connection flow initiated for missing toolkits.',
      results,
    },
    error: null,
  };
};

const inferSessionConnections = (
  session: PiComposioSessionLike,
  options: PiSessionToolOptions
): PiConnectionHandlers | undefined => {
  if (!session.toolkits && !session.authorize) return undefined;
  return {
    getToolkitStates: session.toolkits
      ? toolkits => session.toolkits?.({ toolkits, limit: Math.max(toolkits.length, 1) })
      : undefined,
    authorizeToolkit: session.authorize
      ? (toolkit, authorizeOptions) =>
          session.authorize?.(toolkit, {
            callbackUrl: authorizeOptions.callbackUrl ?? options.callbackUrl,
            alias: authorizeOptions.alias,
            experimental: authorizeOptions.experimental,
          })
      : undefined,
  };
};

const isCapabilityInput = (
  value: PiComposioSessionLike | PiSessionToolCapabilities
): value is PiSessionToolCapabilities =>
  'connections' in value ||
  'hooks' in value ||
  'includeWorkbenchTools' in value ||
  'names' in value;

export const toCapabilities = (
  input: PiComposioSessionLike | PiSessionToolCapabilities,
  providerOptions: PiProviderOptions,
  options: PiSessionToolOptions = {}
): PiSessionToolCapabilities => {
  if (isCapabilityInput(input)) {
    return {
      ...providerOptions,
      ...input,
      names: { ...(providerOptions as PiSessionToolOptions).names, ...(input.names ?? {}) },
    };
  }

  const mergedOptions = { ...providerOptions, ...options };
  return {
    ...mergedOptions,
    sessionId: input.sessionId,
    search: params => input.search(params),
    execute: (toolSlug, args, executeOptions) =>
      executeOptions
        ? input.execute(toolSlug, args, executeOptions)
        : input.execute(toolSlug, args),
    connections: inferSessionConnections(input, mergedOptions),
  };
};

export type { PiConnectionManagementContext };
