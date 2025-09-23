import { Config } from 'effect';

type FORCE_CONFIG = Config.Config.Wrap<{
  USE_CACHE: boolean;
}>;

/**
 * Describe force configuration keys used at runtime.
 * Keys are read from environment variables (with the `FORCE_<key>` format).
 */
export const FORCE_CONFIG = {
  USE_CACHE: Config.boolean('FORCE_USE_CACHE').pipe(Config.withDefault(false)),
} satisfies FORCE_CONFIG;
