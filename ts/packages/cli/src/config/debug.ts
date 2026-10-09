import { flag, optionalString } from './env';

/**
 * Diagnostics and developer overrides. None of these are documented for end users except the
 * two `*_DEBUG` toggles, which the hidden `--perf-debug` / `--tool-debug` / `--telemetry-debug`
 * global flags override (see `src/services/runtime-flags.ts`).
 */
export const DEBUG_CONFIG = {
  // Write performance / tool / telemetry diagnostics to stderr
  PERF_DEBUG: flag('COMPOSIO_PERF_DEBUG'),
  TOOL_DEBUG: flag('COMPOSIO_TOOL_DEBUG'),
  TELEMETRY_DEBUG: flag('COMPOSIO_CLI_TELEMETRY_DEBUG'),

  // Upgrade from this local binary instead of downloading a GitHub release
  UPGRADE_TARGET: optionalString('DEBUG_OVERRIDE_UPGRADE_TARGET'),

  // Report this as the running CLI version
  VERSION: optionalString('DEBUG_OVERRIDE_VERSION'),

  // Replay previously cached API responses instead of calling the backend
  FORCE_USE_CACHE: flag('FORCE_USE_CACHE'),
};
