import { Command } from '@effect/platform';
import { Effect } from 'effect';
import { CommandRunner, type CommandResult } from './command-runner';
import { SetupSkillInstaller } from './setup-skill-installer';

export const SETUP_TARGETS = ['auto', 'claude', 'codex', 'all'] as const;
export type SetupTarget = (typeof SETUP_TARGETS)[number];
export type AgentHost = Exclude<SetupTarget, 'auto' | 'all'>;

export const CLAUDE_PLUGIN_MARKETPLACE = {
  name: 'composio',
  source: 'ComposioHQ/composio-plugin-cc',
  plugin: 'composio@composio',
} as const;

export const CODEX_PLUGIN_MARKETPLACE = {
  name: 'composio',
  source: 'ComposioHQ/composio-plugin-openai',
  plugin: 'composio@composio',
} as const;

export interface SetupTargetStatus {
  readonly target: AgentHost;
  readonly available: boolean;
  readonly marketplace_configured: boolean;
  readonly plugin_installed: boolean;
  readonly plugin_enabled: boolean;
  /** Whether this host can load the authenticated composio-cli skill. */
  readonly cli_skill_ready: boolean;
}

export interface SetupTargetResult extends SetupTargetStatus {
  readonly changed: boolean;
  readonly plugin_changed: boolean;
  readonly skill_changed: boolean;
}

interface SetupTargetAdapter {
  readonly target: AgentHost;
  readonly executable: string;
  readonly marketplace: typeof CLAUDE_PLUGIN_MARKETPLACE | typeof CODEX_PLUGIN_MARKETPLACE;
  readonly marketplaceListArgs: ReadonlyArray<string>;
  readonly pluginListArgs: ReadonlyArray<string>;
  readonly marketplaceAddArgs: ReadonlyArray<string>;
  readonly pluginInstallArgs: ReadonlyArray<string>;
  readonly pluginEnableArgs: ReadonlyArray<string>;
}

const CLAUDE_ADAPTER: SetupTargetAdapter = {
  target: 'claude',
  executable: 'claude',
  marketplace: CLAUDE_PLUGIN_MARKETPLACE,
  marketplaceListArgs: ['plugin', 'marketplace', 'list', '--json'],
  pluginListArgs: ['plugin', 'list', '--json'],
  marketplaceAddArgs: [
    'plugin',
    'marketplace',
    'add',
    CLAUDE_PLUGIN_MARKETPLACE.source,
    '--scope',
    'user',
  ],
  pluginInstallArgs: ['plugin', 'install', CLAUDE_PLUGIN_MARKETPLACE.plugin, '--scope', 'user'],
  pluginEnableArgs: ['plugin', 'enable', CLAUDE_PLUGIN_MARKETPLACE.plugin],
};

const CODEX_ADAPTER: SetupTargetAdapter = {
  target: 'codex',
  executable: 'codex',
  marketplace: CODEX_PLUGIN_MARKETPLACE,
  marketplaceListArgs: ['plugin', 'marketplace', 'list', '--json'],
  pluginListArgs: ['plugin', 'list', '--json'],
  marketplaceAddArgs: ['plugin', 'marketplace', 'add', CODEX_PLUGIN_MARKETPLACE.source, '--json'],
  pluginInstallArgs: ['plugin', 'add', CODEX_PLUGIN_MARKETPLACE.plugin, '--json'],
  // Codex has no separate enable command. Re-adding is its native install/repair path.
  pluginEnableArgs: ['plugin', 'add', CODEX_PLUGIN_MARKETPLACE.plugin, '--json'],
};

const ADAPTERS: ReadonlyArray<SetupTargetAdapter> = [CLAUDE_ADAPTER, CODEX_ADAPTER];

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
};

const recordsFrom = (value: unknown, key?: string): ReadonlyArray<Record<string, unknown>> => {
  const selected = key ? asRecord(value)?.[key] : value;
  return Array.isArray(selected)
    ? selected.flatMap(item => {
        const record = asRecord(item);
        return record ? [record] : [];
      })
    : [];
};

const normalizeGitHubRepository = (value: string): string | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  let repository = trimmed;
  const scpStyle = /^git@github\.com:(.+)$/i.exec(repository);
  if (scpStyle) {
    repository = scpStyle[1] ?? '';
  } else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(repository)) {
    try {
      const url = new URL(repository);
      if (url.hostname.toLowerCase() !== 'github.com') return undefined;
      repository = url.pathname;
    } catch {
      return undefined;
    }
  }

  repository = repository.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '');
  const parts = repository.split('/');
  if (parts.length !== 2 || parts.some(part => !/^[a-z0-9._-]+$/i.test(part))) {
    return undefined;
  }
  return parts.join('/').toLowerCase();
};

const marketplaceIsConfigured = (adapter: SetupTargetAdapter, output: string): boolean => {
  const parsed = parseJson(output);
  const records = recordsFrom(parsed, adapter.target === 'codex' ? 'marketplaces' : undefined);
  return records.some(record => {
    const repo = typeof record.repo === 'string' ? record.repo : undefined;
    const nestedSource = asRecord(record.source);
    const marketplaceSource = asRecord(record.marketplaceSource);
    const source =
      (typeof record.source === 'string' ? record.source : undefined) ??
      (typeof nestedSource?.repo === 'string' ? nestedSource.repo : undefined) ??
      (typeof nestedSource?.source === 'string' ? nestedSource.source : undefined) ??
      (typeof marketplaceSource?.source === 'string' ? marketplaceSource.source : undefined);
    const expected = normalizeGitHubRepository(adapter.marketplace.source);
    return [repo, source].some(
      candidate =>
        typeof candidate === 'string' && normalizeGitHubRepository(candidate) === expected
    );
  });
};

const pluginState = (
  adapter: SetupTargetAdapter,
  output: string
): { readonly installed: boolean; readonly enabled: boolean } => {
  const parsed = parseJson(output);
  const records = recordsFrom(parsed, adapter.target === 'codex' ? 'installed' : undefined);
  const plugin = records.find(record => {
    const id = record.id ?? record.pluginId;
    return id === adapter.marketplace.plugin;
  });
  if (!plugin || plugin.installed === false) return { installed: false, enabled: false };
  return { installed: true, enabled: plugin.enabled !== false };
};

const capture = (executable: string, args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const runner = yield* CommandRunner;
    return yield* runner
      .capture(Command.make(executable, ...args))
      .pipe(Effect.catchAll(() => Effect.succeed<CommandResult | undefined>(undefined)));
  });

const inspectAdapter = (adapter: SetupTargetAdapter) =>
  Effect.gen(function* () {
    const skillInstaller = yield* SetupSkillInstaller;
    const version = yield* capture(adapter.executable, ['--version']);
    if (!version || version.exitCode !== 0) {
      return {
        target: adapter.target,
        available: false,
        marketplace_configured: false,
        plugin_installed: false,
        plugin_enabled: false,
        cli_skill_ready: false,
      } satisfies SetupTargetStatus;
    }

    const [marketplaces, plugins] = yield* Effect.all([
      capture(adapter.executable, adapter.marketplaceListArgs),
      capture(adapter.executable, adapter.pluginListArgs),
    ]);
    const plugin =
      plugins && plugins.exitCode === 0
        ? pluginState(adapter, plugins.stdout)
        : { installed: false, enabled: false };

    const pluginReady = plugin.installed && plugin.enabled;
    return {
      target: adapter.target,
      available: true,
      marketplace_configured: Boolean(
        marketplaces &&
        marketplaces.exitCode === 0 &&
        marketplaceIsConfigured(adapter, marketplaces.stdout)
      ),
      plugin_installed: plugin.installed,
      plugin_enabled: plugin.enabled,
      // Codex loads the composio-cli skill from the plugin package itself. Claude's
      // plugin uses the standalone skill installed from the matching CLI release.
      cli_skill_ready:
        adapter.target === 'codex' ? pluginReady : yield* skillInstaller.isClaudeSkillInstalled,
    } satisfies SetupTargetStatus;
  });

const runRequired = (adapter: SetupTargetAdapter, args: ReadonlyArray<string>, operation: string) =>
  Effect.gen(function* () {
    const runner = yield* CommandRunner;
    const result = yield* runner.capture(Command.make(adapter.executable, ...args));
    if (result.exitCode !== 0) {
      const detail = result.stderr.trim() || result.stdout.trim();
      return yield* Effect.fail(
        new Error(`${operation} failed${detail ? `: ${detail}` : ` (exit ${result.exitCode})`}`)
      );
    }
  });

const installAdapter = (adapter: SetupTargetAdapter) =>
  Effect.gen(function* () {
    const initial = yield* inspectAdapter(adapter);
    if (!initial.available) {
      return yield* Effect.fail(
        new Error(
          `${adapter.executable} is not installed or not available on PATH. Install it and rerun \`composio setup --target ${adapter.target}\`.`
        )
      );
    }

    let pluginChanged = false;
    if (!initial.marketplace_configured) {
      yield* runRequired(
        adapter,
        adapter.marketplaceAddArgs,
        `Adding the ${adapter.target} marketplace`
      );
      pluginChanged = true;
    }
    if (!initial.plugin_installed) {
      yield* runRequired(
        adapter,
        adapter.pluginInstallArgs,
        `Installing the ${adapter.target} plugin`
      );
      pluginChanged = true;
    } else if (!initial.plugin_enabled) {
      yield* runRequired(
        adapter,
        adapter.pluginEnableArgs,
        `Enabling the ${adapter.target} plugin`
      );
      pluginChanged = true;
    }

    const skillInstaller = yield* SetupSkillInstaller;
    const skillChanged =
      adapter.target === 'claude' && !initial.cli_skill_ready
        ? yield* skillInstaller.ensureClaudeSkill
        : false;

    return {
      target: adapter.target,
      available: true,
      marketplace_configured: true,
      plugin_installed: true,
      plugin_enabled: true,
      cli_skill_ready: true,
      changed: pluginChanged || skillChanged,
      plugin_changed: pluginChanged,
      skill_changed: skillChanged,
    } satisfies SetupTargetResult;
  });

export const inspectSetupTargets = Effect.all(ADAPTERS.map(inspectAdapter));

export const resolveSetupTargets = (target: SetupTarget) =>
  Effect.gen(function* () {
    if (target === 'claude' || target === 'codex') return [target] as const;
    if (target === 'all') return ['claude', 'codex'] as const;

    const statuses = yield* inspectSetupTargets;
    const detected = statuses.filter(status => status.available).map(status => status.target);
    if (detected.length === 0) {
      return yield* Effect.fail(
        new Error(
          'No supported agent host was detected. Install Claude Code or Codex, or pass `--target claude|codex` after installing it.'
        )
      );
    }
    return detected;
  });

export const installSetupTargets = (targets: ReadonlyArray<AgentHost>) =>
  Effect.forEach(targets, target => {
    const adapter = ADAPTERS.find(candidate => candidate.target === target);
    return installAdapter(adapter as SetupTargetAdapter);
  });
