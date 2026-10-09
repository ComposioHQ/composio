import { Config, type LogLevel, Option, Schema } from 'effect';

/**
 * Readers shared by the configuration catalogs in `src/config`.
 *
 * Every catalog names its environment variables in full (`COMPOSIO_USER_API_KEY`, `CI`, ...)
 * and reads them through the ambient `ConfigProvider`, which defaults to the process
 * environment. Nothing rewrites lookup paths, so a test configures the CLI by providing
 * `ConfigProvider.fromEnvRecord({ COMPOSIO_USER_API_KEY: '...' })` and nothing else.
 */

/** A string setting; `undefined` when unset or blank. Surrounding whitespace is dropped. */
export const optionalString = (name: string): Config.Config<string | undefined> =>
  Config.option(Config.String(name)).pipe(
    Config.map(value => {
      const trimmed = Option.getOrUndefined(value)?.trim();
      return trimmed ? trimmed : undefined;
    })
  );

/** A `LogLevel` setting; `undefined` when unset. */
export const optionalLogLevel = (name: string): Config.Config<LogLevel.LogLevel | undefined> =>
  Config.option(Config.LogLevel(name)).pipe(Config.map(Option.getOrUndefined));

/** A string setting that falls back to `fallback` when unset or blank. */
export const stringWithDefault = (name: string, fallback: string): Config.Config<string> =>
  optionalString(name).pipe(Config.map(value => value ?? fallback));

const FLAG_OFF_SPELLINGS = new Set(['0', 'false', 'no', 'off']);

/**
 * Tri-state read of a boolean flag. Flags arrive from the ambient environment, where a blank
 * (`COMPOSIO_X=`) or unexpected value is routine, so this is deliberately more tolerant than
 * `Config.Boolean`, which rejects both:
 *
 *   unset or blank                        → `undefined`, the caller picks the default
 *   `0` / `false` / `no` / `off`, any casing → `false`
 *   anything else (`1`, `true`, a typo)   → `true`
 */
export const optionalFlag = (name: string): Config.Config<boolean | undefined> =>
  optionalString(name).pipe(
    Config.map(value =>
      value === undefined ? undefined : !FLAG_OFF_SPELLINGS.has(value.toLowerCase())
    )
  );

/** A boolean flag with `defaultValue` for the unset and blank cases (see `optionalFlag`). */
export const flag = (name: string, defaultValue = false): Config.Config<boolean> =>
  optionalFlag(name).pipe(Config.map(value => value ?? defaultValue));

// `ConfigProvider.fromEnv` splits every variable name on `_` to build a trie, so `CODEX_HOME`,
// `CODEX_0_X`, and a bare `CODEX` all surface under the root `CODEX`. This permissive schema
// accepts that subtree whatever its shape.
const environmentTree: Schema.Codec<unknown> = Schema.Union([
  Schema.String,
  Schema.Record(
    Schema.String,
    Schema.suspend(() => environmentTree)
  ),
  Schema.Array(Schema.suspend(() => environmentTree)),
]);

/**
 * Whether any variable named `<root>` or `<root>_*` is set. Names are matched as written, so
 * `codex_home` does not count for the root `CODEX`.
 */
export const hasEnvironmentRoot = (root: string): Config.Config<boolean> =>
  Config.schema(environmentTree, root).pipe(Config.option, Config.map(Option.isSome));
