import { Config, Option } from 'effect';

type DEBUG_CONFIG = Config.Config.Wrap<{
  UPGRADE_TARGET: Option.Option<string>;
  VERSION: Option.Option<string>;
}>;

/**
 * Describe debug configuration keys used at runtime.
 * Keys are read from environment variables (with the `DEBUG_OVERRIDE_<key>` format).
 */
export const DEBUG_OVERRIDE_CONFIG = {
  // The local binary used when upgrading the Composio CLI (for debugging).
  // When set, the upgrade command will use this local file instead of downloading from GitHub.
  UPGRADE_TARGET: Config.option(Config.string('DEBUG_OVERRIDE_UPGRADE_TARGET')),

  // The version to use when upgrading the Composio CLI (for debugging).
  VERSION: Config.option(Config.string('DEBUG_OVERRIDE_VERSION')),
} satisfies DEBUG_CONFIG;
