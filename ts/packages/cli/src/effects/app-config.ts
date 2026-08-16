import { Config, HashMap, LogLevel, Option } from 'effect';
import * as constants from 'src/constants';

type APP_CONFIG = Config.Config.Wrap<{
  USER_API_KEY: Option.Option<string>;
  ENVIRONMENT: Option.Option<string>;
  BASE_URL: string;
  WEB_URL: string;
  CACHE_DIR: string | undefined;
  SESSION_DIR: string | undefined;
  BIN_DIR: string | undefined;
  LOG_LEVEL: Option.Option<LogLevel.LogLevel>;
  ORG_ID: Option.Option<string>;
  PROJECT_ID: Option.Option<string>;
  AGENTS_BASE_URL: string | undefined;
  WEBHOOK_SECRET: string | undefined;
  CLI_INVOCATION_ORIGIN: string | undefined;
  CLI_PARENT_RUN_ID: string | undefined;
  RUN_ACP_ONLY: boolean;
  RUN_OUTPUT_DIR: string | undefined;
  PERF_DEBUG: boolean;
  TOOL_DEBUG: boolean;
  DISABLE_CONNECTED_ACCOUNT_CACHE: boolean;
}>;

type UNPREFIXED_CONFIG = Config.Config.Wrap<{
  CACHE_DIR: string | undefined;
  NPM_CONFIG_USER_AGENT: string | undefined;
  CI_REDACTION_ENABLED: boolean;
  INTERACTIVE_PERMISSION_UI_DISABLED: boolean;
  NO_COLOR: boolean;
  TELEMETRY_DEBUG: boolean;
  MASTER_SIGNALS: {
    readonly codex: boolean;
    readonly claude: boolean;
  };
  CALLER_AGENT_SIGNALS: {
    readonly explicit: string | undefined;
    readonly openclaw: boolean;
    readonly claude: boolean;
    readonly codex: boolean;
  };
}>;

const optionalString = (name: string): Config.Config<string | undefined> =>
  Config.option(Config.string(name)).pipe(Config.map(Option.getOrUndefined));

const optionalTrimmedString = (name: string): Config.Config<string | undefined> =>
  optionalString(name).pipe(
    Config.map(value => {
      if (value === undefined) return undefined;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    })
  );

const ENV_FLAG_OFF_SPELLINGS = new Set(['0', 'false', 'no', 'off']);

// A flag that is set counts as enabled unless it spells out one of the usual
// "off" values, compared case-insensitively (`OFF` disables like `off`).
const isEnvFlagEnabled = (value: string): boolean =>
  !ENV_FLAG_OFF_SPELLINGS.has(value.toLowerCase());

/**
 * Tri-state read of a boolean environment flag:
 *
 *   unset, or set to blank (`COMPOSIO_X=`)   → `undefined` — absent, caller picks the default
 *   `0` / `false` / `no` / `off`, any casing → `false`
 *   anything else (`1`, `true`, even a typo) → `true`
 */
const optionalEnvironmentFlag = (name: string): Config.Config<boolean | undefined> =>
  optionalTrimmedString(name).pipe(
    Config.map(value => (value === undefined ? undefined : isEnvFlagEnabled(value)))
  );

// Deliberately tolerant rather than `Config.boolean`: these flags arrive from the ambient
// environment, where a blank (`COMPOSIO_PERF_DEBUG=`) or unexpected value is routine.
// `Config.boolean` rejects both with `InvalidData`, and `Config.withDefault` only recovers
// `MissingData`, so a stray value would surface as an unrecoverable defect instead of `false`.
const booleanFlag = (name: string, defaultValue = false): Config.Config<boolean> =>
  optionalEnvironmentFlag(name).pipe(Config.map(value => value ?? defaultValue));

// `Config.hashMap` enumerates the provider's root keys instead of reading one
// named variable, so it depends on how `ConfigProvider.fromEnv` derives them:
// every `process.env` key is uppercased and split on `_`, and the first segment
// becomes a root. `CODEX_HOME`, `codex_home`, and a bare `CODEX` therefore all
// surface as the root `CODEX`. Matching is consequently case-insensitive and no
// longer requires a trailing underscore, unlike the
// `Object.keys(env).some(key => key.startsWith('CODEX_'))` scan it replaced.
const agentPrefixSignals = Config.hashMap(Config.succeed(true)).pipe(
  Config.map(environmentRoots => ({
    codex: HashMap.has(environmentRoots, 'CODEX'),
    claude: HashMap.has(environmentRoots, 'CLAUDE'),
    openclaw: HashMap.has(environmentRoots, 'OPENCLAW'),
  }))
);

/**
 * Derives a URL default based on the `COMPOSIO_ENVIRONMENT` config key.
 * Returns `stagingDefault` when ENVIRONMENT is `"staging"`, otherwise `prodDefault`.
 */
const environmentBasedDefault = (
  prodDefault: string,
  stagingDefault: string
): Config.Config<string> =>
  Config.string('ENVIRONMENT').pipe(
    Config.map(env => (env === 'staging' ? stagingDefault : prodDefault)),
    Config.withDefault(prodDefault)
  );

/**
 * Describe every configuration key used at runtime.
 * Keys are read from environment variables (with the `${APP_ENV_CONFIG_KEY_PREFIX}<key>` format).
 *
 * URL precedence (highest → lowest):
 *   COMPOSIO_BASE_URL  →  COMPOSIO_ENVIRONMENT-derived  →  DEFAULT_BASE_URL
 *   COMPOSIO_WEB_URL   →  COMPOSIO_ENVIRONMENT-derived  →  DEFAULT_WEB_URL
 */
export const APP_CONFIG = {
  // The API key for the Composio API
  USER_API_KEY: Config.option(Config.string('USER_API_KEY')),

  // The deployment environment ("production" | "staging"). Controls URL defaults.
  ENVIRONMENT: Config.option(Config.string('ENVIRONMENT')),

  // The base URL for the Composio API
  BASE_URL: Config.string('BASE_URL').pipe(
    Config.orElse(() =>
      environmentBasedDefault(constants.DEFAULT_BASE_URL, constants.STAGING_BASE_URL)
    )
  ),

  // The base URL for the Composio web app
  WEB_URL: Config.string('WEB_URL').pipe(
    Config.orElse(() =>
      environmentBasedDefault(constants.DEFAULT_WEB_URL, constants.STAGING_WEB_URL)
    )
  ),

  // The cache directory for the Composio CLI
  CACHE_DIR: optionalTrimmedString('CACHE_DIR'),

  // Override the root directory for CLI session artifacts
  SESSION_DIR: optionalTrimmedString('SESSION_DIR'),

  // Override the directory added to PATH by `composio install`
  BIN_DIR: optionalTrimmedString('BIN_DIR'),

  // The log level for the Composio CLI
  LOG_LEVEL: Config.option(Config.logLevel('LOG_LEVEL')),

  // The organization ID for multi-project auth (overrides file-based config)
  ORG_ID: Config.option(Config.string('ORG_ID')),

  // The project ID for multi-project auth (overrides file-based config)
  PROJECT_ID: Config.option(Config.string('PROJECT_ID')),

  // Override the Composio agents service URL
  AGENTS_BASE_URL: optionalString('AGENTS_BASE_URL'),

  // Sign forwarded trigger payloads with this secret
  WEBHOOK_SECRET: optionalString('WEBHOOK_SECRET'),

  // Internal context propagated between CLI processes
  CLI_INVOCATION_ORIGIN: optionalTrimmedString('CLI_INVOCATION_ORIGIN'),
  CLI_PARENT_RUN_ID: optionalTrimmedString('CLI_PARENT_RUN_ID'),
  RUN_ACP_ONLY: booleanFlag('RUN_ACP_ONLY'),
  RUN_OUTPUT_DIR: optionalTrimmedString('RUN_OUTPUT_DIR'),

  // Runtime debug flags
  PERF_DEBUG: booleanFlag('PERF_DEBUG'),
  TOOL_DEBUG: booleanFlag('TOOL_DEBUG'),

  // Disable connected account cache (defaults to true — cache is off by default)
  DISABLE_CONNECTED_ACCOUNT_CACHE: booleanFlag('DISABLE_CONNECTED_ACCOUNT_CACHE', true),
} satisfies APP_CONFIG;

/**
 * Configuration whose keys are spelled out in full and are therefore loaded
 * through the raw `ConfigProvider.fromEnv()` provider (`loadHostConfig` in
 * `src/services/config.ts`) rather than the `COMPOSIO_`-prefixing provider that
 * serves `APP_CONFIG`. Several keys do carry the `COMPOSIO_` prefix; what unites
 * them is that the prefix is written here instead of being applied by the
 * provider. Keep their string-to-domain normalization here so consumers never
 * inspect raw environment strings.
 */
export const UNPREFIXED_CONFIG = {
  // The cache directory of the host tool driving the CLI (not `COMPOSIO_CACHE_DIR`)
  CACHE_DIR: optionalTrimmedString('CACHE_DIR'),

  // The package manager that invoked the CLI, as reported by npm-compatible clients
  NPM_CONFIG_USER_AGENT: optionalString('npm_config_user_agent'),

  // Stricter than the `booleanFlag` family on purpose: output redaction is for
  // recorded CI sessions and keys off the exact `CI=true` convention. A looser
  // parse would also start redacting under `CI=1`-style environments, changing
  // long-standing behavior. `INTERACTIVE_PERMISSION_UI_DISABLED` below reads
  // the same variable tolerantly because failing closed there is the safe
  // reading of any non-falsy `CI` value.
  CI_REDACTION_ENABLED: optionalTrimmedString('CI').pipe(
    Config.map(value => value?.toLowerCase() === 'true')
  ),
  INTERACTIVE_PERMISSION_UI_DISABLED: Config.all({
    explicit: optionalEnvironmentFlag('COMPOSIO_DISABLE_PERMISSION_UI'),
    ci: optionalEnvironmentFlag('CI'),
    vitest: optionalEnvironmentFlag('VITEST'),
  }).pipe(Config.map(({ explicit, ci, vitest }) => explicit ?? (ci === true || vitest === true))),
  NO_COLOR: optionalString('NO_COLOR').pipe(Config.map(Boolean)),
  TELEMETRY_DEBUG: booleanFlag('COMPOSIO_CLI_TELEMETRY_DEBUG'),
  MASTER_SIGNALS: agentPrefixSignals.pipe(Config.map(({ codex, claude }) => ({ codex, claude }))),
  CALLER_AGENT_SIGNALS: Config.all({
    explicit: Config.all({
      callerAgent: optionalTrimmedString('COMPOSIO_CALLER_AGENT'),
      legacyAgent: optionalTrimmedString('COMPOSIO_AGENT'),
    }).pipe(Config.map(({ callerAgent, legacyAgent }) => callerAgent ?? legacyAgent)),
    prefixes: agentPrefixSignals,
  }).pipe(Config.map(({ explicit, prefixes }) => ({ explicit, ...prefixes }))),
} satisfies UNPREFIXED_CONFIG;
