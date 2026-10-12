import { Context, Effect, Layer, Option } from 'effect';
import { Flag, GlobalFlag } from 'effect/unstable/cli';
import { APP_CONFIG, UNPREFIXED_CONFIG } from 'src/effects/app-config';
import { loadHostConfig } from 'src/services/config';

export const TELEMETRY_DEBUG_FLAG = '--telemetry-debug';

/**
 * Read telemetry debugging before constructing services that emit lifecycle events.
 * The caller excludes the run script tail. Effect still validates this hidden global flag;
 * bootstrap never removes it from argv.
 */
export const readTelemetryDebugOverride = (argv: ReadonlyArray<string>): boolean | undefined => {
  for (const token of argv) {
    if (token === '--') break;
    if (token === TELEMETRY_DEBUG_FLAG || token === `${TELEMETRY_DEBUG_FLAG}=true`) return true;
    if (token === '--no-telemetry-debug' || token === `${TELEMETRY_DEBUG_FLAG}=false`) return false;
  }
  return undefined;
};

/**
 * Values parsed from the hidden `--perf-debug` / `--tool-debug` flags.
 *
 * `undefined` means "the flag was absent", which is what lets the corresponding `COMPOSIO_*`
 * config value through; an explicit `true`/`false` always wins over it.
 */
export type CliDebugFlagOverrides = {
  readonly perfDebug: boolean | undefined;
  readonly toolDebug: boolean | undefined;
};

export const NO_CLI_DEBUG_FLAG_OVERRIDES: CliDebugFlagOverrides = {
  perfDebug: undefined,
  toolDebug: undefined,
};

/**
 * Hidden debug flags of the current invocation.
 *
 * The command framework parses global settings without rewriting argv. This service supplies
 * overrides for direct Effect callers that do not run through the command parser.
 */
export class CliDebugFlags extends Context.Service<CliDebugFlags, CliDebugFlagOverrides>()(
  'services/CliDebugFlags'
) {}

export const cliDebugFlagsLayer = (
  overrides: CliDebugFlagOverrides = NO_CLI_DEBUG_FLAG_OVERRIDES
): Layer.Layer<CliDebugFlags> => Layer.succeed(CliDebugFlags, overrides);

const debugSetting = <const Name extends string>(name: Name) =>
  GlobalFlag.Setting(name)({ flag: Flag.Boolean(name).pipe(Flag.optional, Flag.withHidden) });

const debugSettings = {
  'perf-debug': debugSetting('perf-debug'),
  'tool-debug': debugSetting('tool-debug'),
  'telemetry-debug': debugSetting('telemetry-debug'),
};
export const CLI_DEBUG_FLAG_NAMES = Object.keys(debugSettings);
export const CLI_DEBUG_GLOBAL_FLAGS = Object.values(debugSettings);

const debugFlagOr = <const Name extends string>(
  setting: GlobalFlag.Setting<Name, Option.Option<boolean>>,
  select: (overrides: CliDebugFlagOverrides) => boolean | undefined,
  configured: Effect.Effect<boolean, never, never>
): Effect.Effect<boolean, never, CliDebugFlags> =>
  Effect.gen(function* () {
    const parsed = Option.flatten(yield* Effect.serviceOption(setting));
    if (Option.isSome(parsed)) return parsed.value;
    const overrides = yield* CliDebugFlags;
    return select(overrides) ?? (yield* configured);
  });

export const isPerfDebugEnabled = debugFlagOr(
  debugSettings['perf-debug'],
  overrides => overrides.perfDebug,
  Effect.orDie(APP_CONFIG.PERF_DEBUG)
);

export const isToolDebugEnabled = debugFlagOr(
  debugSettings['tool-debug'],
  overrides => overrides.toolDebug,
  Effect.orDie(APP_CONFIG.TOOL_DEBUG)
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
  readonly telemetryDebug: boolean;
};

export const debugFlagsToChildEnv = (flags: ChildProcessDebugFlags): Record<string, string> => ({
  COMPOSIO_PERF_DEBUG: flags.perfDebug ? '1' : '0',
  COMPOSIO_TOOL_DEBUG: flags.toolDebug ? '1' : '0',
  COMPOSIO_CLI_TELEMETRY_DEBUG: flags.telemetryDebug ? '1' : '0',
});

/** Telemetry debug override for service construction and internal worker invocations. */
export class TelemetryDebugMode extends Context.Service<TelemetryDebugMode, boolean>()(
  'services/TelemetryDebugMode'
) {}

export const telemetryDebugModeLayer = (enabled: boolean): Layer.Layer<TelemetryDebugMode> =>
  Layer.succeed(TelemetryDebugMode, enabled);

export const isTelemetryDebugEnabled: Effect.Effect<boolean> = Effect.gen(function* () {
  const parsed = Option.flatten(yield* Effect.serviceOption(debugSettings['telemetry-debug']));
  if (Option.isSome(parsed)) return parsed.value;
  const bootstrap = yield* Effect.serviceOption(TelemetryDebugMode);
  return Option.isSome(bootstrap)
    ? bootstrap.value
    : yield* loadHostConfig(UNPREFIXED_CONFIG.TELEMETRY_DEBUG);
});
