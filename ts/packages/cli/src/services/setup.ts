import { Command } from '@effect/platform';
import { Effect } from 'effect';
import { CommandRunner, type CommandResult } from './command-runner';
import { SetupSkillInstaller } from './setup-skill-installer';

export const SETUP_TARGETS = ['auto', 'claude', 'codex', 'all'] as const;
export type SetupTarget = (typeof SETUP_TARGETS)[number];
export type AgentHost = Exclude<SetupTarget, 'auto' | 'all'>;

const CLAUDE_PLUGIN_MARKETPLACE = {
  name: 'composio',
  source: 'https://github.com/ComposioHQ/composio-plugin-cc.git',
  plugin: 'composio@composio',
} as const;

const CODEX_PLUGIN_MARKETPLACE = {
  name: 'composio',
  source: 'https://github.com/ComposioHQ/composio-plugin-openai.git',
  plugin: 'composio@composio',
} as const;

interface SetupTargetStatus {
  readonly target: AgentHost;
  readonly available: boolean;
  readonly marketplace_configured: boolean;
  readonly plugin_installed: boolean;
  readonly plugin_enabled: boolean;
  /** Whether this host can load the authenticated composio-cli skill. */
  readonly cli_skill_ready: boolean;
}

interface SetupTargetResult extends SetupTargetStatus {
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
  readonly marketplaceRecordsKey?: string;
  readonly pluginRecordsKey?: string;
  readonly pluginScope?: string;
  readonly marketplaceRemoveCommand: string;
  readonly skillSource: 'bundled' | 'standalone';
}

interface InspectedSetupTarget extends SetupTargetStatus {
  readonly marketplace_conflict: boolean;
}

const ADAPTERS: Readonly<Record<AgentHost, SetupTargetAdapter>> = {
  claude: {
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
    pluginEnableArgs: ['plugin', 'enable', CLAUDE_PLUGIN_MARKETPLACE.plugin, '--scope', 'user'],
    pluginScope: 'user',
    marketplaceRemoveCommand: 'claude plugin marketplace remove composio --scope user',
    skillSource: 'standalone',
  },
  codex: {
    target: 'codex',
    executable: 'codex',
    marketplace: CODEX_PLUGIN_MARKETPLACE,
    marketplaceListArgs: ['plugin', 'marketplace', 'list', '--json'],
    pluginListArgs: ['plugin', 'list', '--json'],
    marketplaceAddArgs: ['plugin', 'marketplace', 'add', CODEX_PLUGIN_MARKETPLACE.source, '--json'],
    pluginInstallArgs: ['plugin', 'add', CODEX_PLUGIN_MARKETPLACE.plugin, '--json'],
    // Codex has no separate enable command. Re-adding is its native install/repair path.
    pluginEnableArgs: ['plugin', 'add', CODEX_PLUGIN_MARKETPLACE.plugin, '--json'],
    marketplaceRecordsKey: 'marketplaces',
    pluginRecordsKey: 'installed',
    marketplaceRemoveCommand: 'codex plugin marketplace remove composio --json',
    skillSource: 'bundled',
  },
};

const ADAPTER_LIST = Object.values(ADAPTERS);
const SETUP_COMMAND_TIMEOUT = '2 minutes';

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  asRecord(value) !== undefined;

const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
};

const recordsFrom = (
  value: unknown,
  key?: string
): ReadonlyArray<Record<string, unknown>> | undefined => {
  let selected = value;
  if (key) {
    const record = asRecord(value);
    if (!record) return undefined;
    selected = record[key];
  }
  if (!Array.isArray(selected) || !selected.every(isRecord)) return undefined;
  return selected;
};

const readString = (
  record: Record<string, unknown> | undefined,
  key: string
): string | undefined => {
  const value = record?.[key];
  if (typeof value !== 'string') return undefined;
  return value;
};

const firstString = (...values: ReadonlyArray<unknown>): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string') return value;
  }
  return undefined;
};

const normalizeGitHubRepository = (value: string): string | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  let repository = trimmed;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(repository)) {
    try {
      const url = new URL(repository);
      const isCanonicalGitHubUrl =
        url.protocol === 'https:' &&
        url.hostname.toLowerCase() === 'github.com' &&
        url.port === '' &&
        url.username === '' &&
        url.password === '' &&
        url.search === '' &&
        url.hash === '';
      if (!isCanonicalGitHubUrl) return undefined;
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

const marketplaceState = (
  adapter: SetupTargetAdapter,
  output: string
): { readonly configured: boolean; readonly conflicting: boolean } | undefined => {
  const parsed = parseJson(output);
  const records = recordsFrom(parsed, adapter.marketplaceRecordsKey);
  if (!records) return undefined;
  const expected = normalizeGitHubRepository(adapter.marketplace.source);
  const sourceMatches = (record: Record<string, unknown>) => {
    const nestedSource = asRecord(record.source);
    const marketplaceSource = asRecord(record.marketplaceSource);
    const source = firstString(
      record.source,
      readString(nestedSource, 'repo'),
      readString(nestedSource, 'source'),
      readString(marketplaceSource, 'source')
    );
    const candidates = [readString(record, 'repo'), readString(record, 'url'), source];
    return candidates.some(candidate => normalizeGitHubRepository(candidate ?? '') === expected);
  };
  const configured = records.some(sourceMatches);
  const conflicting = records.some(
    record => record.name === adapter.marketplace.name && !sourceMatches(record)
  );
  return { configured, conflicting };
};

const pluginState = (
  adapter: SetupTargetAdapter,
  output: string
): { readonly installed: boolean; readonly enabled: boolean } | undefined => {
  const parsed = parseJson(output);
  const records = recordsFrom(parsed, adapter.pluginRecordsKey);
  if (!records) return undefined;
  const plugin = records.find(record => {
    const id = record.id ?? record.pluginId;
    const scopeMatches = !adapter.pluginScope || record.scope === adapter.pluginScope;
    return id === adapter.marketplace.plugin && scopeMatches;
  });
  if (!plugin || plugin.installed === false) return { installed: false, enabled: false };
  return { installed: true, enabled: plugin.enabled !== false };
};

const capture = (executable: string, args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const runner = yield* CommandRunner;
    return yield* runner.capture(Command.make(executable, ...args)).pipe(
      Effect.timeoutFail({
        duration: SETUP_COMMAND_TIMEOUT,
        onTimeout: () => new Error(`${executable} command timed out.`),
      }),
      Effect.catchAll(() => Effect.succeed<CommandResult | undefined>(undefined))
    );
  });

const isAdapterAvailable = (adapter: SetupTargetAdapter) =>
  capture(adapter.executable, ['--version']).pipe(
    Effect.map(result => result !== undefined && result.exitCode === 0)
  );

const commandFailureSuffix = (result: CommandResult): string => {
  const detail = result.stderr.trim() || result.stdout.trim();
  if (detail) return `: ${detail}`;
  return ` (exit ${result.exitCode})`;
};

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const requireInspection = <T>(
  adapter: SetupTargetAdapter,
  operation: string,
  result: CommandResult | undefined,
  parse: (output: string) => T | undefined
) => {
  if (!result) {
    return Effect.fail(new Error(`Failed to inspect ${adapter.target} ${operation}.`));
  }
  if (result.exitCode !== 0) {
    return Effect.fail(
      new Error(`Failed to inspect ${adapter.target} ${operation}${commandFailureSuffix(result)}.`)
    );
  }
  const inspected = parse(result.stdout);
  if (!inspected) {
    return Effect.fail(new Error(`${adapter.target} returned invalid JSON for ${operation}.`));
  }
  return Effect.succeed(inspected);
};

const inspectAdapter = (adapter: SetupTargetAdapter) =>
  Effect.gen(function* () {
    const skillInstaller = yield* SetupSkillInstaller;
    const available = yield* isAdapterAvailable(adapter);
    if (!available) {
      return {
        target: adapter.target,
        available: false,
        marketplace_configured: false,
        plugin_installed: false,
        plugin_enabled: false,
        cli_skill_ready: false,
        marketplace_conflict: false,
      } satisfies InspectedSetupTarget;
    }

    const [marketplaces, plugins] = yield* Effect.all([
      capture(adapter.executable, adapter.marketplaceListArgs),
      capture(adapter.executable, adapter.pluginListArgs),
    ]);
    const plugin = yield* requireInspection(adapter, 'plugins', plugins, output =>
      pluginState(adapter, output)
    );
    const pluginReady = plugin.installed && plugin.enabled;
    const marketplace = yield* requireInspection(adapter, 'marketplaces', marketplaces, output =>
      marketplaceState(adapter, output)
    );
    let cliSkillReady = pluginReady;
    if (adapter.skillSource === 'standalone') {
      cliSkillReady = yield* skillInstaller.isClaudeSkillReady;
    }
    return {
      target: adapter.target,
      available: true,
      marketplace_configured: marketplace.configured,
      plugin_installed: plugin.installed,
      plugin_enabled: plugin.enabled,
      cli_skill_ready: cliSkillReady,
      marketplace_conflict: marketplace.conflicting,
    } satisfies InspectedSetupTarget;
  });

interface SetupStep {
  readonly args: ReadonlyArray<string>;
  readonly operation: string;
}

const pluginRepairStep = (
  adapter: SetupTargetAdapter,
  status: InspectedSetupTarget
): SetupStep | undefined => {
  if (!status.marketplace_configured || !status.plugin_installed) {
    return {
      args: adapter.pluginInstallArgs,
      operation: `Installing the ${adapter.target} plugin`,
    };
  }
  if (!status.plugin_enabled) {
    return {
      args: adapter.pluginEnableArgs,
      operation: `Enabling the ${adapter.target} plugin`,
    };
  }
  return undefined;
};

const isSetupReady = (status: SetupTargetStatus): boolean =>
  status.available &&
  status.marketplace_configured &&
  status.plugin_installed &&
  status.plugin_enabled &&
  status.cli_skill_ready;

const runRequired = (adapter: SetupTargetAdapter, args: ReadonlyArray<string>, operation: string) =>
  Effect.gen(function* () {
    const runner = yield* CommandRunner;
    const result = yield* runner.capture(Command.make(adapter.executable, ...args)).pipe(
      Effect.timeoutFail({
        duration: SETUP_COMMAND_TIMEOUT,
        onTimeout: () => new Error(`${operation} timed out after ${SETUP_COMMAND_TIMEOUT}.`),
      })
    );
    if (result.exitCode !== 0) {
      return yield* Effect.fail(new Error(`${operation} failed${commandFailureSuffix(result)}`));
    }
  });

const validateInitialState = (adapter: SetupTargetAdapter, initial: InspectedSetupTarget) => {
  if (!initial.available) {
    return Effect.fail(
      new Error(
        `${adapter.executable} is not installed or not available on PATH. Install it and rerun \`composio setup --target ${adapter.target}\`.`
      )
    );
  }
  if (initial.marketplace_conflict) {
    return Effect.fail(
      new Error(
        `The ${adapter.target} marketplace named "composio" points to a different source. Run \`${adapter.marketplaceRemoveCommand}\`, then rerun \`composio setup --target ${adapter.target}\`.`
      )
    );
  }
  return Effect.void;
};

const installAdapter = (adapter: SetupTargetAdapter, initial: InspectedSetupTarget) =>
  Effect.gen(function* () {
    const steps: SetupStep[] = [];
    if (!initial.marketplace_configured) {
      steps.push({
        args: adapter.marketplaceAddArgs,
        operation: `Adding the ${adapter.target} marketplace`,
      });
    }
    const repairStep = pluginRepairStep(adapter, initial);
    if (repairStep) steps.push(repairStep);
    for (const step of steps) {
      yield* runRequired(adapter, step.args, step.operation);
    }
    const pluginChanged = steps.length > 0;

    const skillInstaller = yield* SetupSkillInstaller;
    let skillChanged = false;
    if (adapter.skillSource === 'standalone' && !initial.cli_skill_ready) {
      skillChanged = yield* skillInstaller.ensureClaudeSkill;
    }

    const final = yield* inspectAdapter(adapter);
    if (!isSetupReady(final)) {
      return yield* Effect.fail(
        new Error(
          `Setup commands completed, but ${adapter.target} did not report the Composio plugin and CLI skill as ready. Rerun \`composio setup --target ${adapter.target}\` or inspect the native ${adapter.target} plugin configuration.`
        )
      );
    }

    return {
      target: adapter.target,
      available: final.available,
      marketplace_configured: final.marketplace_configured,
      plugin_installed: final.plugin_installed,
      plugin_enabled: final.plugin_enabled,
      cli_skill_ready: final.cli_skill_ready,
      changed: pluginChanged || skillChanged,
      plugin_changed: pluginChanged,
      skill_changed: skillChanged,
    } satisfies SetupTargetResult;
  });

const FIXED_TARGETS: Readonly<Partial<Record<SetupTarget, ReadonlyArray<AgentHost>>>> = {
  claude: ['claude'],
  codex: ['codex'],
  all: ['claude', 'codex'],
};

export const resolveSetupTargets = (target: SetupTarget) =>
  Effect.gen(function* () {
    const fixedTargets = FIXED_TARGETS[target];
    if (fixedTargets) return fixedTargets;

    const statuses = yield* Effect.all(
      ADAPTER_LIST.map(adapter =>
        isAdapterAvailable(adapter).pipe(
          Effect.map(available => ({ target: adapter.target, available }))
        )
      )
    );
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
  Effect.gen(function* () {
    const inspected = yield* Effect.forEach(targets, target => inspectAdapter(ADAPTERS[target]));
    yield* Effect.forEach(inspected, status =>
      validateInitialState(ADAPTERS[status.target], status)
    );
    const completed: SetupTargetResult[] = [];
    for (const status of inspected) {
      const result = yield* installAdapter(ADAPTERS[status.target], status).pipe(
        Effect.mapError(error => {
          if (completed.length === 0) return error;
          const targets = completed.map(item => item.target).join(', ');
          return new Error(
            `Setup completed for ${targets} before a later target failed: ${errorMessage(error)}`
          );
        })
      );
      completed.push(result);
    }
    return completed;
  });
