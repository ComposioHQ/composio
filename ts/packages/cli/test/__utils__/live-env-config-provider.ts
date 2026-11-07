import { ConfigProvider, Effect } from 'effect';

/**
 * `ConfigProvider.fromEnv` snapshots the environment when it is built, so a
 * provider created at module scope never observes `vi.stubEnv` calls made
 * inside a test. This provider re-reads the environment on every lookup.
 */
export const liveEnvConfigProvider: ConfigProvider.ConfigProvider = ConfigProvider.make(
  configPath => ConfigProvider.fromEnv().load(configPath)
);

// Variables a developer shell may export that would change what a test observes: every
// Composio setting (`APP_CONFIG`, `TELEMETRY_CONFIG`, `GITHUB_CONFIG`, the `COMPOSIO_*_DEBUG`
// toggles) and the developer overrides in `DEBUG_CONFIG`.
const MASKED_PREFIXES = ['COMPOSIO_', 'DEBUG_OVERRIDE_', 'FORCE_'];

/**
 * The default provider of `TestLive`: the real host environment (`CI`, `VITEST`, `PATH`, the
 * agent-host markers, ...) read live, but never the developer shell's Composio settings or
 * `DEBUG_OVERRIDE_*` / `FORCE_*` overrides, so a test only sees the values it provides itself.
 */
export const hostOnlyEnvConfigProvider: ConfigProvider.ConfigProvider = ConfigProvider.make(
  configPath => {
    const name = configPath.map(String).join('_');
    return MASKED_PREFIXES.some(prefix => name.startsWith(prefix))
      ? Effect.succeed(undefined)
      : liveEnvConfigProvider.load(configPath);
  }
);
