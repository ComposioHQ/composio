import { Effect } from 'effect';
import { readRawOptionalEnv } from 'src/services/config';

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
  readRawOptionalEnv('COMPOSIO_PERF_DEBUG').pipe(
    Effect.map(value => runtimeDebugFlags.perfDebug || value === '1')
  );

export const isToolDebugEnabled = () =>
  readRawOptionalEnv('COMPOSIO_TOOL_DEBUG').pipe(
    Effect.map(value => runtimeDebugFlags.toolDebug || value === '1')
  );
