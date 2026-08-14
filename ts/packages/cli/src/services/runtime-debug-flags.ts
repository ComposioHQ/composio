import { Effect } from 'effect';
import { APP_CONFIG } from 'src/effects/app-config';

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
  APP_CONFIG.PERF_DEBUG.pipe(
    Effect.orDie,
    Effect.map(configured => runtimeDebugFlags.perfDebug || configured)
  );

export const isToolDebugEnabled = () =>
  APP_CONFIG.TOOL_DEBUG.pipe(
    Effect.orDie,
    Effect.map(configured => runtimeDebugFlags.toolDebug || configured)
  );
