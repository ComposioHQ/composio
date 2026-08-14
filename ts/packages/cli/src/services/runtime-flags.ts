import { Effect } from 'effect';
import { APP_CONFIG, HOST_CONFIG } from 'src/effects/app-config';
import { loadHostConfig } from 'src/services/config';

export const TELEMETRY_DEBUG_FLAG = '--telemetry-debug';

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

let telemetryDebugOverride: boolean | undefined;

export const configureRuntimeFlags = (flags: RuntimeFlags): void => {
  runtimeFlags = flags;
};

export const resetRuntimeFlags = (): void => {
  runtimeFlags = {
    perfDebug: undefined,
    toolDebug: undefined,
    acpOnly: undefined,
  };
  telemetryDebugOverride = undefined;
};

export const enableRuntimeTelemetryDebug = (): void => {
  telemetryDebugOverride = true;
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

export const isTelemetryDebugEnabled = () =>
  loadHostConfig(HOST_CONFIG.TELEMETRY_DEBUG).pipe(
    Effect.map(configured => telemetryDebugOverride ?? configured)
  );
