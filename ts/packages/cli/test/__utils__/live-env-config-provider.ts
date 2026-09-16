import { ConfigProvider } from 'effect';

/**
 * `ConfigProvider.fromEnv` snapshots the environment when it is built, so a
 * provider created at module scope never observes `vi.stubEnv` calls made
 * inside a test. This provider re-reads the environment on every lookup.
 */
export const liveEnvConfigProvider: ConfigProvider.ConfigProvider = ConfigProvider.make(
  configPath => ConfigProvider.fromEnv().load(configPath)
);
