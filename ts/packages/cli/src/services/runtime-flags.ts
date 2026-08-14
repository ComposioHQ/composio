import { Effect } from 'effect';
import { APP_CONFIG } from 'src/effects/app-config';

type RuntimeFlags = {
  readonly perfDebug: boolean | undefined;
  readonly toolDebug: boolean | undefined;
  readonly acpOnly: boolean | undefined;
};

let runtimeFlags: RuntimeFlags = {
  perfDebug: undefined,
  toolDebug: undefined,
  acpOnly: undefined,
};

export const configureRuntimeFlags = (flags: RuntimeFlags): void => {
  runtimeFlags = flags;
};

export const resetRuntimeFlags = (): void => {
  runtimeFlags = {
    perfDebug: undefined,
    toolDebug: undefined,
    acpOnly: undefined,
  };
};

export const isPerfDebugEnabled = () =>
  APP_CONFIG.PERF_DEBUG.pipe(
    Effect.orDie,
    Effect.map(configured => runtimeFlags.perfDebug ?? configured)
  );

export const isToolDebugEnabled = () =>
  APP_CONFIG.TOOL_DEBUG.pipe(
    Effect.orDie,
    Effect.map(configured => runtimeFlags.toolDebug ?? configured)
  );

export const isAcpOnlyEnabled = () =>
  APP_CONFIG.RUN_ACP_ONLY.pipe(
    Effect.orDie,
    Effect.map(configured => runtimeFlags.acpOnly ?? configured)
  );
