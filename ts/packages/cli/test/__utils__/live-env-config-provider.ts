import { ConfigProvider, Effect } from 'effect';

/**
 * `ConfigProvider.fromEnv` snapshots the environment when it is built, so a
 * provider created at module scope never observes `vi.stubEnv` calls made
 * inside a test. This provider re-reads the environment on every lookup.
 */
export const liveEnvConfigProvider: ConfigProvider.ConfigProvider = ConfigProvider.make(
  configPath => ConfigProvider.fromEnv().load(configPath)
);

/**
 * The default provider of `TestLive`: the real host environment (`CI`, `VITEST`, `PATH`, the
 * agent-host markers, ...) read live, but never the developer shell's `COMPOSIO_*` values, so a
 * test only sees the Composio settings it provides itself.
 */
export const hostOnlyEnvConfigProvider: ConfigProvider.ConfigProvider = ConfigProvider.make(
  configPath =>
    configPath.map(String).join('_').startsWith('COMPOSIO_')
      ? Effect.succeed(undefined)
      : liveEnvConfigProvider.load(configPath)
);
