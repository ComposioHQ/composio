import { Context, Effect, Layer, Option } from 'effect';
import { APP_CONFIG, UNPREFIXED_CONFIG } from 'src/effects/app-config';
import { loadHostConfig } from 'src/services/config';

export const TELEMETRY_DEBUG_FLAG = '--telemetry-debug';

export type StrippedTelemetryDebugArgv = {
  readonly argv: ReadonlyArray<string>;
  readonly telemetryDebug: boolean;
};

/**
 * Removes `--telemetry-debug` from the CLI's own arguments and reports whether it was there.
 *
 * Only arguments before the first `--` are considered: everything after the delimiter belongs to
 * the process `composio run` spawns, so `composio run -- my-agent --telemetry-debug` has to reach
 * `my-agent` untouched.
 *
 * `src/bin.ts` runs this before the Effect runtime exists, which is why the answer travels into
 * the runtime as the `TelemetryDebugMode` service instead of module state.
 */
export const stripTelemetryDebugFlag = (
  argv: ReadonlyArray<string>
): StrippedTelemetryDebugArgv => {
  const delimiterIndex = argv.indexOf('--');
  const searchEnd = delimiterIndex < 0 ? argv.length : delimiterIndex;
  const flagIndex = argv.findIndex(
    (token, index) => index < searchEnd && token === TELEMETRY_DEBUG_FLAG
  );
  if (flagIndex < 0) {
    return { argv, telemetryDebug: false };
  }

  return {
    argv: [...argv.slice(0, flagIndex), ...argv.slice(flagIndex + 1)],
    telemetryDebug: true,
  };
};

/**
 * Values parsed from the hidden `--perf-debug` / `--tool-debug` / `--acp-only` flags.
 *
 * `undefined` means "the flag was absent", which is what lets the corresponding `COMPOSIO_*`
 * config value through; an explicit `true`/`false` always wins over it.
 */
export type CliDebugFlagOverrides = {
  readonly perfDebug: boolean | undefined;
  readonly toolDebug: boolean | undefined;
  readonly acpOnly: boolean | undefined;
};

export const NO_CLI_DEBUG_FLAG_OVERRIDES: CliDebugFlagOverrides = {
  perfDebug: undefined,
  toolDebug: undefined,
  acpOnly: undefined,
};

/**
 * Hidden debug flags of the current invocation.
 *
 * `src/commands/index.ts` parses them out of argv in one place and provides this service for the
 * command it then routes to, so every reader takes the values as an input instead of reaching for
 * process-wide state.
 */
export class CliDebugFlags extends Context.Tag('services/CliDebugFlags')<
  CliDebugFlags,
  CliDebugFlagOverrides
>() {}

export const cliDebugFlagsLayer = (
  overrides: CliDebugFlagOverrides = NO_CLI_DEBUG_FLAG_OVERRIDES
): Layer.Layer<CliDebugFlags> => Layer.succeed(CliDebugFlags, overrides);

const debugFlagOr = (
  select: (overrides: CliDebugFlagOverrides) => boolean | undefined,
  configured: Effect.Effect<boolean, never, never>
): Effect.Effect<boolean, never, CliDebugFlags> =>
  Effect.map(
    Effect.all([CliDebugFlags, configured]),
    ([overrides, configuredValue]) => select(overrides) ?? configuredValue
  );

export const isPerfDebugEnabled = debugFlagOr(
  overrides => overrides.perfDebug,
  Effect.orDie(APP_CONFIG.PERF_DEBUG)
);

export const isToolDebugEnabled = debugFlagOr(
  overrides => overrides.toolDebug,
  Effect.orDie(APP_CONFIG.TOOL_DEBUG)
);

export const isAcpOnlyEnabled = debugFlagOr(
  overrides => overrides.acpOnly,
  Effect.orDie(APP_CONFIG.RUN_ACP_ONLY)
);

/**
 * Debug state a parent CLI process resolved for the processes it spawns.
 *
 * Flags reach the parent as hidden CLI options or `COMPOSIO_*` variables, but a child only sees
 * the environment, so every spawn site has to serialize the resolved values back into it. Keeping
 * the mapping here means a flag added to this file cannot be forwarded from one spawn site and
 * forgotten at another.
 */
export type ChildProcessDebugFlags = {
  readonly perfDebug: boolean;
  readonly toolDebug: boolean;
  readonly acpOnly: boolean;
  readonly telemetryDebug: boolean;
};

export const debugFlagsToChildEnv = (flags: ChildProcessDebugFlags): Record<string, string> => ({
  COMPOSIO_PERF_DEBUG: flags.perfDebug ? '1' : '0',
  COMPOSIO_TOOL_DEBUG: flags.toolDebug ? '1' : '0',
  COMPOSIO_RUN_ACP_ONLY: flags.acpOnly ? '1' : '0',
  COMPOSIO_CLI_TELEMETRY_DEBUG: flags.telemetryDebug ? '1' : '0',
});

/**
 * Set when `--telemetry-debug` was found on the command line.
 *
 * The flag is stripped in `src/bin.ts` before the Effect runtime exists, so its value is handed to
 * the runtime as this service. Telemetry dispatch runs from service constructors and from the
 * detached worker process, where a hard requirement could not be satisfied, so readers resolve it
 * with `Effect.serviceOption` and fall back to `COMPOSIO_CLI_TELEMETRY_DEBUG`.
 */
export class TelemetryDebugMode extends Context.Tag('services/TelemetryDebugMode')<
  TelemetryDebugMode,
  boolean
>() {}

export const telemetryDebugModeLayer = (enabled: boolean): Layer.Layer<TelemetryDebugMode> =>
  Layer.succeed(TelemetryDebugMode, enabled);

export const isTelemetryDebugEnabled: Effect.Effect<boolean> = Effect.flatMap(
  Effect.serviceOption(TelemetryDebugMode),
  Option.match({
    onNone: () => loadHostConfig(UNPREFIXED_CONFIG.TELEMETRY_DEBUG),
    onSome: Effect.succeed,
  })
);
