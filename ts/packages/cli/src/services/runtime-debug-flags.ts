type RuntimeDebugFlags = {
  readonly perfDebug: boolean;
  readonly toolDebug: boolean;
};

let runtimeDebugFlags: RuntimeDebugFlags = {
  perfDebug: false,
  toolDebug: false,
};

export const setRuntimeDebugFlags = (flags: Partial<RuntimeDebugFlags>) => {
  runtimeDebugFlags = {
    perfDebug: flags.perfDebug ?? runtimeDebugFlags.perfDebug,
    toolDebug: flags.toolDebug ?? runtimeDebugFlags.toolDebug,
  };
};

export const resetRuntimeDebugFlags = () => {
  runtimeDebugFlags = {
    perfDebug: false,
    toolDebug: false,
  };
};

export const isPerfDebugEnabled = () =>
  runtimeDebugFlags.perfDebug || process.env.COMPOSIO_PERF_DEBUG === '1';

export const isToolDebugEnabled = () =>
  runtimeDebugFlags.toolDebug || process.env.COMPOSIO_TOOL_DEBUG === '1';
