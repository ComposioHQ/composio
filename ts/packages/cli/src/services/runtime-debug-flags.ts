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
  // eslint-disable-next-line eslint-js/no-restricted-syntax -- called from sync non-Effect helper code in spawned child processes, where the flag arrives via inherited environment rather than a Config provider
  runtimeDebugFlags.perfDebug || process.env.COMPOSIO_PERF_DEBUG === '1';

export const isToolDebugEnabled = () =>
  // eslint-disable-next-line eslint-js/no-restricted-syntax -- called from sync non-Effect helper code in spawned child processes, where the flag arrives via inherited environment rather than a Config provider
  runtimeDebugFlags.toolDebug || process.env.COMPOSIO_TOOL_DEBUG === '1';
