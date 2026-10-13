import { Config } from 'effect';
import { hasEnvironmentRoot, optionalFlag, optionalString } from './env';

const agentPrefixSignals = Config.all({
  codex: hasEnvironmentRoot('CODEX'),
  claude: hasEnvironmentRoot('CLAUDE'),
  openclaw: hasEnvironmentRoot('OPENCLAW'),
});

/**
 * Facts about the process that launched the CLI: the shell, CI, the package manager, and the
 * agent host (Claude Code, Codex, ...). Most of these variables are owned by other programs;
 * the string-to-domain normalization lives here so consumers never inspect raw values.
 */
export const HOST_CONFIG = {
  // POSIX shell variables `composio install` edits rc files for
  SHELL: optionalString('SHELL'),
  PATH: optionalString('PATH'),

  // The package manager that invoked the CLI, as reported by npm-compatible clients
  NPM_CONFIG_USER_AGENT: optionalString('npm_config_user_agent'),

  // https://no-color.org/
  NO_COLOR: optionalString('NO_COLOR').pipe(Config.map(value => value !== undefined)),

  // Output redaction is for recorded CI sessions and keys off the exact `CI=true` convention.
  // `INTERACTIVE_PERMISSION_UI_DISABLED` below reads the same variable tolerantly because
  // failing closed there is the safe reading of any non-falsy `CI` value.
  CI_REDACTION_ENABLED: optionalString('CI').pipe(
    Config.map(value => value?.toLowerCase() === 'true')
  ),

  // The browser approval page must never open from automated environments. The explicit
  // COMPOSIO_DISABLE_PERMISSION_UI knob wins in both directions; without it, CI and Vitest
  // runs disable the UI.
  INTERACTIVE_PERMISSION_UI_DISABLED: Config.all({
    explicit: optionalFlag('COMPOSIO_DISABLE_PERMISSION_UI'),
    ci: optionalFlag('CI'),
    vitest: optionalFlag('VITEST'),
  }).pipe(Config.map(({ explicit, ci, vitest }) => explicit ?? (ci === true || vitest === true))),

  // Markers and directories the agent hosts export to the processes they spawn
  AGENT_HOST: Config.all({
    claudeCode: optionalString('CLAUDECODE'),
    codexThreadId: optionalString('CODEX_THREAD_ID'),
    codexSandbox: optionalString('CODEX_SANDBOX'),
    claudeConfigDir: optionalString('CLAUDE_CONFIG_DIR'),
    codexHome: optionalString('CODEX_HOME'),
  }),

  // Which agent, if any, drives this process: any `CODEX*` / `CLAUDE*` variable counts
  MASTER_SIGNALS: agentPrefixSignals.pipe(Config.map(({ codex, claude }) => ({ codex, claude }))),

  // The agent asking for a tool permission: an explicit name beats the prefix signals
  CALLER_AGENT_SIGNALS: Config.all({
    explicit: Config.all({
      callerAgent: optionalString('COMPOSIO_CALLER_AGENT'),
      legacyAgent: optionalString('COMPOSIO_AGENT'),
    }).pipe(Config.map(({ callerAgent, legacyAgent }) => callerAgent ?? legacyAgent)),
    prefixes: agentPrefixSignals,
  }).pipe(Config.map(({ explicit, prefixes }) => ({ explicit, ...prefixes }))),
};

export type AgentHostEnvironment = Config.Success<typeof HOST_CONFIG.AGENT_HOST>;
export type CallerAgentSignals = Config.Success<typeof HOST_CONFIG.CALLER_AGENT_SIGNALS>;
