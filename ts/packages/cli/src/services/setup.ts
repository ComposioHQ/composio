import { Command } from '@effect/platform';
import { Data, Effect } from 'effect';
import semver from 'semver';
import { trackCliEventEffect } from 'src/analytics/dispatch';
import { getPluginLifecycleSucceededEvent } from 'src/analytics/events';
import { APP_VERSION } from 'src/constants';
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
  readonly pluginUninstallArgs: ReadonlyArray<string>;
  readonly inspectionHelpArgs: ReadonlyArray<ReadonlyArray<string>>;
  readonly marketplaceRecordsKey?: string;
  readonly pluginRecordsKey?: string;
  readonly pluginScope?: string;
  readonly marketplaceRemoveCommand: string;
  readonly skillSource: 'bundled' | 'standalone';
}

export interface InspectedSetupTarget extends SetupTargetStatus {
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
    pluginUninstallArgs: [
      'plugin',
      'uninstall',
      CLAUDE_PLUGIN_MARKETPLACE.plugin,
      '--scope',
      'user',
      '--yes',
    ],
    inspectionHelpArgs: [
      ['plugin', 'marketplace', 'list', '--help'],
      ['plugin', 'list', '--help'],
    ],
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
    pluginUninstallArgs: ['plugin', 'remove', CODEX_PLUGIN_MARKETPLACE.plugin, '--json'],
    inspectionHelpArgs: [
      ['plugin', 'marketplace', 'list', '--help'],
      ['plugin', 'list', '--help'],
    ],
    marketplaceRecordsKey: 'marketplaces',
    pluginRecordsKey: 'installed',
    marketplaceRemoveCommand: 'codex plugin marketplace remove composio --json',
    skillSource: 'bundled',
  },
};

const ADAPTER_LIST = Object.values(ADAPTERS);
const SETUP_COMMAND_TIMEOUT = '2 minutes';
const MINIMUM_CODEX_SETUP_VERSION = '0.139.0';

export class SetupCommandError extends Data.TaggedError('services/SetupCommandError')<{
  readonly message: string;
  readonly operation: 'setup' | 'uninstall';
}> {}

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

const commandText = (executable: string, args: ReadonlyArray<string>) =>
  [executable, ...args].join(' ');

const capture = (executable: string, args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const runner = yield* CommandRunner;
    return yield* runner.capture(Command.make(executable, ...args)).pipe(
      Effect.timeoutFail({
        duration: SETUP_COMMAND_TIMEOUT,
        onTimeout: () =>
          new Error(
            `The \`${commandText(executable, args)}\` command timed out after ${SETUP_COMMAND_TIMEOUT}.`
          ),
      })
    );
  });

const isCommandNotFound = (error: unknown): boolean => {
  if (error === null || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  return record._tag === 'SystemError' && record.reason === 'NotFound';
};

const captureOptional = (executable: string, args: ReadonlyArray<string>) =>
  capture(executable, args).pipe(
    Effect.catchIf(isCommandNotFound, () => Effect.succeed<CommandResult | undefined>(undefined))
  );

const targetLabel = (target: AgentHost): string => (target === 'claude' ? 'Claude Code' : 'Codex');

const hostUpdateCommand = (adapter: SetupTargetAdapter): string => `${adapter.executable} update`;

const unsupportedInspectionMessage = (adapter: SetupTargetAdapter) => {
  if (adapter.target === 'codex') {
    return `This Codex installation does not support safe automatic plugin inspection. Composio setup requires Codex ${MINIMUM_CODEX_SETUP_VERSION} or newer with JSON plugin inspection. Run \`codex update\`, then rerun this command.`;
  }
  return 'This Claude Code installation does not support safe automatic plugin inspection. Composio setup requires JSON plugin inspection. Run `claude update`, then rerun this command.';
};

const compactCommandDetail = (value: string): string | undefined => {
  const firstLine = value
    .split(/\r?\n/u)
    .map(line => line.trim())
    .find(Boolean);
  if (!firstLine) return undefined;
  return firstLine.length > 300 ? `${firstLine.slice(0, 297)}...` : firstLine;
};

const commandResultDetail = (result: CommandResult): string => {
  const detail = compactCommandDetail(result.stderr) ?? compactCommandDetail(result.stdout);
  return detail ?? `exit ${result.exitCode}`;
};

const capabilityCheckFailureMessage = (
  adapter: SetupTargetAdapter,
  command: string,
  detail: string
) => {
  const normalizedDetail = detail.trim().replace(/[.]+$/u, '');
  return `Composio could not verify plugin support for ${targetLabel(adapter.target)} because \`${command}\` failed: ${normalizedDetail}. Run \`${hostUpdateCommand(adapter)}\`, then rerun this command.`;
};

const supportsInspection = (adapter: SetupTargetAdapter, versionOutput?: string) =>
  Effect.gen(function* () {
    if (adapter.target === 'codex') {
      const version = versionOutput?.match(/\b\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\b/)?.[0];
      if (!version || !semver.valid(version) || semver.lt(version, MINIMUM_CODEX_SETUP_VERSION)) {
        return { supported: false, reason: unsupportedInspectionMessage(adapter) };
      }
    }

    for (const args of adapter.inspectionHelpArgs) {
      const command = commandText(adapter.executable, args);
      const result = yield* capture(adapter.executable, args).pipe(
        Effect.mapError(
          error => new Error(capabilityCheckFailureMessage(adapter, command, errorMessage(error)))
        )
      );
      if (result.exitCode !== 0) {
        return {
          supported: false,
          reason: capabilityCheckFailureMessage(adapter, command, commandResultDetail(result)),
        };
      }
      const help = `${result.stdout}\n${result.stderr}`;
      if (!/^\s*--json\b/m.test(help)) {
        return { supported: false, reason: unsupportedInspectionMessage(adapter) };
      }
    }
    return { supported: true };
  });

const detectAdapter = (adapter: SetupTargetAdapter) =>
  Effect.gen(function* () {
    const versionArgs = ['--version'] as const;
    const versionCommand = commandText(adapter.executable, versionArgs);
    const captureResult = yield* captureOptional(adapter.executable, versionArgs).pipe(
      Effect.map(result => ({ result }) as const),
      Effect.catchAll(error => Effect.succeed({ error } as const))
    );
    if ('error' in captureResult) {
      return {
        available: true,
        supported: false,
        unsupportedReason: capabilityCheckFailureMessage(
          adapter,
          versionCommand,
          errorMessage(captureResult.error)
        ),
      };
    }
    const { result } = captureResult;
    if (!result) return { available: false, supported: false };
    if (result.exitCode === 127) return { available: false, supported: false };
    if (result.exitCode !== 0) {
      return {
        available: true,
        supported: false,
        unsupportedReason: capabilityCheckFailureMessage(
          adapter,
          versionCommand,
          commandResultDetail(result)
        ),
      };
    }

    const version = result.stdout.trim() || result.stderr.trim();
    const support = yield* supportsInspection(adapter, version).pipe(
      Effect.catchAll(error =>
        Effect.succeed({ supported: false, reason: errorMessage(error) } as const)
      )
    );
    return version
      ? {
          available: true,
          supported: support.supported,
          version,
          ...(support.supported ? {} : { unsupportedReason: support.reason }),
        }
      : {
          available: true,
          supported: support.supported,
          ...(support.supported ? {} : { unsupportedReason: support.reason }),
        };
  });

const commandFailureSuffix = (result: CommandResult): string => {
  return `: ${commandResultDetail(result)}`;
};

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

type SetupOperation = 'setup' | 'uninstall';

const setupCommand = (adapter: SetupTargetAdapter, operation: SetupOperation): string =>
  `composio setup${operation === 'uninstall' ? ' --uninstall' : ''} --target ${adapter.target}`;

const recoveryHint = (adapter: SetupTargetAdapter, operation: SetupOperation): string =>
  `Run \`${setupCommand(adapter, operation)}\` again. If the problem persists, run \`${hostUpdateCommand(adapter)}\` and retry.`;

const captureInspection = (
  adapter: SetupTargetAdapter,
  args: ReadonlyArray<string>,
  operation: string,
  setupOperation: SetupOperation
) =>
  capture(adapter.executable, args).pipe(
    Effect.mapError(
      error =>
        new Error(
          `Failed to inspect ${targetLabel(adapter.target)} ${operation}: ${errorMessage(error)}. ${recoveryHint(adapter, setupOperation)}`
        )
    )
  );

const requireInspection = <T>(
  adapter: SetupTargetAdapter,
  operation: string,
  result: CommandResult,
  parse: (output: string) => T | undefined,
  setupOperation: SetupOperation
) => {
  if (result.exitCode !== 0) {
    return Effect.fail(
      new Error(
        `Failed to inspect ${targetLabel(adapter.target)} ${operation}${commandFailureSuffix(result)}. ${recoveryHint(adapter, setupOperation)}`
      )
    );
  }
  const inspected = parse(result.stdout);
  if (!inspected) {
    return Effect.fail(
      new Error(
        `${targetLabel(adapter.target)} returned invalid JSON while inspecting ${operation}. ${recoveryHint(adapter, setupOperation)}`
      )
    );
  }
  return Effect.succeed(inspected);
};

const inspectAdapter = (
  adapter: SetupTargetAdapter,
  knownDetection?: {
    readonly available: boolean;
    readonly supported: boolean;
    readonly version?: string;
  },
  setupOperation: SetupOperation = 'setup'
) =>
  Effect.gen(function* () {
    const skillInstaller = yield* SetupSkillInstaller;
    const detection = knownDetection ?? (yield* detectAdapter(adapter));
    if (!detection.available) {
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

    if (!detection.supported) {
      return yield* Effect.fail(new Error(unsupportedInspectionMessage(adapter)));
    }

    const [marketplaces, plugins] = yield* Effect.all([
      captureInspection(adapter, adapter.marketplaceListArgs, 'marketplaces', setupOperation),
      captureInspection(adapter, adapter.pluginListArgs, 'plugins', setupOperation),
    ]);
    const plugin = yield* requireInspection(
      adapter,
      'plugins',
      plugins,
      output => pluginState(adapter, output),
      setupOperation
    );
    const pluginReady = plugin.installed && plugin.enabled;
    const marketplace = yield* requireInspection(
      adapter,
      'marketplaces',
      marketplaces,
      output => marketplaceState(adapter, output),
      setupOperation
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

export const isSetupPluginReady = (status: SetupTargetStatus): boolean =>
  status.available &&
  status.marketplace_configured &&
  status.plugin_installed &&
  status.plugin_enabled;

export const isSetupReady = (status: SetupTargetStatus): boolean =>
  isSetupPluginReady(status) && status.cli_skill_ready;

const runRequired = (
  adapter: SetupTargetAdapter,
  args: ReadonlyArray<string>,
  operation: string,
  setupOperation: SetupOperation
) =>
  Effect.gen(function* () {
    const runner = yield* CommandRunner;
    const result = yield* runner.capture(Command.make(adapter.executable, ...args)).pipe(
      Effect.timeoutFail({
        duration: SETUP_COMMAND_TIMEOUT,
        onTimeout: () => new Error(`${operation} timed out after ${SETUP_COMMAND_TIMEOUT}.`),
      }),
      Effect.mapError(
        error =>
          new Error(
            `${operation} failed: ${errorMessage(error)}. ${recoveryHint(adapter, setupOperation)}`
          )
      )
    );
    if (result.exitCode !== 0) {
      return yield* Effect.fail(
        new Error(
          `${operation} failed${commandFailureSuffix(result)}. ${recoveryHint(adapter, setupOperation)}`
        )
      );
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
      yield* runRequired(adapter, step.args, step.operation, 'setup');
    }
    const pluginChanged = steps.length > 0;

    const skillInstaller = yield* SetupSkillInstaller;
    let skillChanged = false;
    if (adapter.skillSource === 'standalone' && !initial.cli_skill_ready) {
      skillChanged = yield* skillInstaller.ensureClaudeSkill.pipe(
        Effect.mapError(
          error =>
            new Error(
              `Installing the Claude Code CLI skill failed: ${errorMessage(error)}. ${recoveryHint(adapter, 'setup')}`
            )
        )
      );
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

const uninstallAdapter = (adapter: SetupTargetAdapter, initial: InspectedSetupTarget) =>
  Effect.gen(function* () {
    let pluginChanged = false;
    if (initial.plugin_installed) {
      yield* runRequired(
        adapter,
        adapter.pluginUninstallArgs,
        `Uninstalling the ${adapter.target} plugin`,
        'uninstall'
      );
      pluginChanged = true;
    }

    const skillInstaller = yield* SetupSkillInstaller;
    let skillChanged = false;
    if (adapter.skillSource === 'standalone') {
      skillChanged = yield* skillInstaller.removeClaudeSkill.pipe(
        Effect.mapError(
          error =>
            new Error(
              `Removing the Claude Code CLI skill failed: ${errorMessage(error)}. ${recoveryHint(adapter, 'uninstall')}`
            )
        )
      );
    }

    const final = yield* inspectAdapter(adapter, undefined, 'uninstall');
    if (final.plugin_installed) {
      return yield* Effect.fail(
        new Error(
          `Uninstall commands completed, but ${adapter.target} still reports the Composio plugin as installed. Rerun \`composio setup --uninstall --target ${adapter.target}\` or inspect the native ${adapter.target} plugin configuration.`
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

export interface SetupTargetDetection {
  readonly target: AgentHost;
  readonly available: boolean;
  readonly supported: boolean;
  readonly version?: string;
  readonly unsupportedReason?: string;
}

export const detectSetupTargets = (target: SetupTarget) =>
  Effect.gen(function* () {
    const targets = FIXED_TARGETS[target] ?? ADAPTER_LIST.map(adapter => adapter.target);
    return yield* Effect.all(
      targets.map(target =>
        detectAdapter(ADAPTERS[target]).pipe(
          Effect.map((detection): SetupTargetDetection => ({ target, ...detection }))
        )
      )
    );
  });

export const inspectSetupTargets = (
  detections: ReadonlyArray<SetupTargetDetection>,
  options: {
    readonly allowMarketplaceConflict?: boolean;
    readonly operation?: SetupOperation;
  } = {}
) =>
  Effect.gen(function* () {
    const inspected = yield* Effect.forEach(
      detections.filter(detection => detection.available && detection.supported),
      detection =>
        inspectAdapter(ADAPTERS[detection.target], detection, options.operation ?? 'setup')
    );
    if (!options.allowMarketplaceConflict) {
      yield* Effect.forEach(inspected, status =>
        validateInitialState(ADAPTERS[status.target], status)
      );
    }
    return inspected;
  });

export const installSetupTargets = (inspected: ReadonlyArray<InspectedSetupTarget>) =>
  Effect.gen(function* () {
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
      if (result.plugin_changed) {
        const action = !status.plugin_installed
          ? 'installed'
          : !status.plugin_enabled
            ? 'enabled'
            : 'configured';
        yield* trackCliEventEffect(
          getPluginLifecycleSucceededEvent({
            operation: 'setup',
            target: result.target,
            action,
            cliVersion: APP_VERSION,
          })
        );
      }
      completed.push(result);
    }
    return completed;
  });

export const uninstallSetupTargets = (inspected: ReadonlyArray<InspectedSetupTarget>) =>
  Effect.gen(function* () {
    const completed: SetupTargetResult[] = [];
    for (const status of inspected) {
      const result = yield* uninstallAdapter(ADAPTERS[status.target], status).pipe(
        Effect.mapError(error => {
          if (completed.length === 0) return error;
          const targets = completed.map(item => item.target).join(', ');
          return new Error(
            `Uninstall completed for ${targets} before a later target failed: ${errorMessage(error)}`
          );
        })
      );
      if (result.plugin_changed) {
        yield* trackCliEventEffect(
          getPluginLifecycleSucceededEvent({
            operation: 'uninstall',
            target: result.target,
            action: 'uninstalled',
            cliVersion: APP_VERSION,
          })
        );
      }
      completed.push(result);
    }
    return completed;
  });
