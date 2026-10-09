import { Config } from 'effect';
import * as constants from 'src/constants';
import { flag, optionalString, stringWithDefault } from './env';

/** Opt-out switches and the PostHog target for CLI telemetry. */
export const TELEMETRY_CONFIG = {
  // Any opt-out spelling, a test run, or CI silences telemetry entirely
  DISABLED: Config.all({
    cli: flag('COMPOSIO_CLI_TELEMETRY_DISABLED'),
    composio: flag('COMPOSIO_DISABLE_TELEMETRY'),
    generic: flag('TELEMETRY_DISABLED'),
    ci: flag('CI'),
    nodeEnv: optionalString('NODE_ENV'),
  }).pipe(
    Config.map(
      ({ cli, composio, generic, ci, nodeEnv }) =>
        cli || composio || generic || ci || nodeEnv === 'test'
    )
  ),

  // PostHog capture endpoint and public project key (the key is baked at build time)
  POSTHOG_INGEST_URL: stringWithDefault(
    'COMPOSIO_POSTHOG_INGEST_URL',
    constants.COMPOSIO_POSTHOG_INGEST_URL
  ),
  POSTHOG_PROJECT_API_KEY: stringWithDefault(
    'COMPOSIO_POSTHOG_PROJECT_API_KEY',
    constants.COMPOSIO_POSTHOG_PROJECT_API_KEY
  ),
};
