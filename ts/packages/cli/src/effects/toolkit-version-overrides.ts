import { Config, ConfigError, Effect, HashMap, Option, pipe, String } from 'effect';
import { BaseConfigProviderLive } from 'src/services/config';

/**
 * Represents a toolkit with its version specification.
 * The `toolkitSlug` is guaranteed to be lowercase at the type level.
 */
export interface ToolkitVersionSpec {
  readonly toolkitSlug: Lowercase<string>;
  readonly toolkitVersion: string;
}

/**
 * Config that reads COMPOSIO_TOOLKIT_VERSION_<TOOLKIT>=<version> env vars.
 * Uses Effect's Config.hashMap with Config.nested to read all env vars
 * `COMPOSIO_TOOLKIT_VERSION_${TOOLKIT}` with a wildcard suffix.
 *
 * @example
 * // Given: COMPOSIO_TOOLKIT_VERSION_GMAIL=20250901_00
 * // Returns: HashMap { "GMAIL" => "20250901_00" }
 */
export const TOOLKIT_VERSION_OVERRIDES_CONFIG = pipe(
  Config.hashMap(Config.string()),
  Config.nested('VERSION'),
  Config.nested('TOOLKIT'),
  Config.nested('COMPOSIO'),
  Config.option // Optional, so missing env vars don't fail the config
);

/**
 * Map type with lowercase toolkit slugs as keys.
 */
export type ToolkitVersionOverrides = Map<Lowercase<string>, string>;

/**
 * Reads toolkit version overrides from environment variables.
 *
 * Uses Effect's Config system to read env vars matching the pattern
 * COMPOSIO_TOOLKIT_VERSION_<TOOLKIT>=<version>.
 *
 * This function uses `BaseConfigProviderLive` directly (bypassing `extendConfigProvider`)
 * to correctly parse the nested path structure of the environment variable names.
 *
 * @returns Effect that yields a Map<Lowercase<string>, string> where keys are lowercase toolkit slugs
 *          and values are version strings
 *
 * @example
 * // Given: COMPOSIO_TOOLKIT_VERSION_GMAIL=20250901_00
 * // Returns: Map { "gmail" => "20250901_00" }
 */
export const getToolkitVersionOverrides: Effect.Effect<
  ToolkitVersionOverrides,
  ConfigError.ConfigError
> = Effect.gen(function* () {
  const maybeOverrides = yield* TOOLKIT_VERSION_OVERRIDES_CONFIG;

  return Option.match(maybeOverrides, {
    onNone: () => new Map<Lowercase<string>, string>(),
    onSome: hashMap => {
      const result = new Map<Lowercase<string>, string>();
      for (const [key, value] of HashMap.toEntries(hashMap)) {
        // Normalize toolkit name to lowercase and skip 'latest' values
        if (value && value !== 'latest') {
          result.set(String.toLowerCase(key), value);
        }
      }
      return result;
    },
  });
}).pipe(Effect.withConfigProvider(BaseConfigProviderLive));

/**
 * Builds an array of ToolkitVersionSpec from toolkit slugs and version overrides.
 *
 * @example
 * // Given slugs: ['gmail', 'slack', 'github']
 * // Given overrides: Map { "gmail" => "20250901_00" }
 * // Returns: [
 * //   { toolkitSlug: 'gmail', toolkitVersion: '20250901_00' },
 * //   { toolkitSlug: 'slack', toolkitVersion: 'latest' },
 * //   { toolkitSlug: 'github', toolkitVersion: 'latest' }
 * // ]
 */
export const buildToolkitVersionSpecs = (
  toolkitSlugs: ReadonlyArray<string>,
  overrides: ToolkitVersionOverrides
): ReadonlyArray<ToolkitVersionSpec> =>
  toolkitSlugs.map(slug => {
    const normalizedSlug = String.toLowerCase(slug);
    return {
      toolkitSlug: normalizedSlug,
      toolkitVersion: overrides.get(normalizedSlug) ?? 'latest',
    };
  });

/**
 * Groups ToolkitVersionSpecs by version for efficient API batching.
 *
 * @example
 * // Given specs with mixed versions
 * // Returns: Map { "20250901_00" => ["gmail"], "latest" => ["slack", "github"] }
 */
export const groupByVersion = (
  specs: ReadonlyArray<ToolkitVersionSpec>
): Map<string, Lowercase<string>[]> => {
  const grouped = new Map<string, Lowercase<string>[]>();
  for (const spec of specs) {
    const existing = grouped.get(spec.toolkitVersion) ?? [];
    grouped.set(spec.toolkitVersion, [...existing, spec.toolkitSlug]);
  }
  return grouped;
};
