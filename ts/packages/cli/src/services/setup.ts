import { Command, Error as PlatformError } from '@effect/platform';
import { Data, Effect, Either, Option, Predicate, Schema } from 'effect';
import semver from 'semver';
import { trackCliEventEffect } from 'src/analytics/dispatch';
import {
  getPluginLifecycleFailedEvent,
  getPluginLifecycleSucceededEvent,
} from 'src/analytics/events';
import { APP_VERSION } from 'src/constants';
import {
  AGENT_HOSTS,
  AGENT_HOST_LABELS,
  COMPOSIO_AGENT_PLUGIN_ID,
  type AgentHost,
} from './agent-host';
import { CommandRunner, type CommandResult } from './command-runner';
import { SetupSkillInstaller } from './setup-skill-installer';
import { cliInvocationContext } from './runtime-cli-context';

export const SETUP_TARGETS = ['auto', ...AGENT_HOSTS, 'all'] as const;
export type SetupTarget = (typeof SETUP_TARGETS)[number];
export type { AgentHost } from './agent-host';

const CLAUDE_PLUGIN_MARKETPLACE = {
  name: 'composio',
  source: 'https://github.com/ComposioHQ/composio-plugin-cc.git',
  plugin: COMPOSIO_AGENT_PLUGIN_ID,
} as const;

const CODEX_PLUGIN_MARKETPLACE = {
  name: 'composio',
  source: 'https://github.com/ComposioHQ/composio-plugin-openai.git',
  plugin: COMPOSIO_AGENT_PLUGIN_ID,
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
  readonly cause?: unknown;
}> {}

type SetupFailureStage = 'detect' | 'inspect' | 'validate' | 'mutate' | 'verify' | 'skill';

export class SetupProcessError extends Data.TaggedError('services/SetupProcessError')<{
  readonly message: string;
  readonly target: AgentHost;
  readonly stage: SetupFailureStage;
  readonly cause?: unknown;
}> {}

const setupProcessError = (params: {
  readonly adapter: SetupTargetAdapter;
  readonly stage: SetupFailureStage;
  readonly message: string;
  readonly cause?: unknown;
}) =>
  new SetupProcessError({
    message: params.message,
    target: params.adapter.target,
    stage: params.stage,
    ...(params.cause === undefined ? {} : { cause: params.cause }),
  });

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  Predicate.isRecord(value) ? value : undefined;

const decodeJsonOption = Schema.decodeUnknownOption(Schema.parseJson());

const parseJson = (value: string): unknown | undefined =>
  Option.getOrUndefined(decodeJsonOption(value));

const isRecord = Predicate.isRecord;

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
    // new URL() throws on malformed input; an unparseable repository string
    // simply normalizes to undefined.
    const parsedUrl = Either.try(() => new URL(repository));
    if (Either.isLeft(parsedUrl)) return undefined;
    const url = parsedUrl.right;
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

const capture = (
  adapter: SetupTargetAdapter,
  args: ReadonlyArray<string>,
  stage: Extract<SetupFailureStage, 'detect' | 'inspect'>
) =>
  Effect.gen(function* () {
    const runner = yield* CommandRunner;
    return yield* runner.capture(Command.make(adapter.executable, ...args)).pipe(
      Effect.timeoutFail({
        duration: SETUP_COMMAND_TIMEOUT,
        onTimeout: () =>
          setupProcessError({
            adapter,
            stage,
            message: `The \`${commandText(adapter.executable, args)}\` command timed out after ${SETUP_COMMAND_TIMEOUT}.`,
          }),
      })
    );
  });

const captureOptional = (adapter: SetupTargetAdapter, args: ReadonlyArray<string>) =>
  capture(adapter, args, 'detect').pipe(
    Effect.catchIf(Schema.is(PlatformError.SystemError), error =>
      error.reason === 'NotFound'
        ? Effect.succeed<CommandResult | undefined>(undefined)
        : Effect.fail(error)
    )
  );

const targetLabel = (target: AgentHost): string => AGENT_HOST_LABELS[target];

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
        return {
          supported: false,
          reason: unsupportedInspectionMessage(adapter),
          reasonCode: 'codex_too_old',
        } as const;
      }
    }

    for (const args of adapter.inspectionHelpArgs) {
      const command = commandText(adapter.executable, args);
      const result = yield* capture(adapter, args, 'detect').pipe(
        Effect.mapError(cause =>
          setupProcessError({
            adapter,
            stage: 'detect',
            message: capabilityCheckFailureMessage(adapter, command, errorMessage(cause)),
            cause,
          })
        )
      );
      if (result.exitCode !== 0) {
        return {
          supported: false,
          reason: capabilityCheckFailureMessage(adapter, command, commandResultDetail(result)),
          reasonCode: 'host_command_failed',
        } as const;
      }
      const help = `${result.stdout}\n${result.stderr}`;
      if (!/^\s*--json\b/m.test(help)) {
        return {
          supported: false,
          reason: unsupportedInspectionMessage(adapter),
          reasonCode: 'no_json_inspection',
        } as const;
      }
    }
    return { supported: true } as const;
  });

const detectAdapter = (adapter: SetupTargetAdapter) =>
  Effect.gen(function* () {
    const versionArgs = ['--version'];
    const versionCommand = commandText(adapter.executable, versionArgs);
    return yield* captureOptional(adapter, versionArgs).pipe(
      Effect.matchEffect({
        onFailure: cause =>
          Effect.succeed({
            available: true,
            supported: false,
            unsupportedReason: capabilityCheckFailureMessage(
              adapter,
              versionCommand,
              errorMessage(cause)
            ),
            unsupportedReasonCode: 'host_command_failed' as const,
          }),
        onSuccess: result => {
          if (!result || result.exitCode === 127) {
            return Effect.succeed({ available: false, supported: false });
          }
          if (result.exitCode !== 0) {
            return Effect.succeed({
              available: true,
              supported: false,
              unsupportedReason: capabilityCheckFailureMessage(
                adapter,
                versionCommand,
                commandResultDetail(result)
              ),
              unsupportedReasonCode: 'host_command_failed' as const,
            });
          }

          const version = result.stdout.trim() || result.stderr.trim();
          return supportsInspection(adapter, version).pipe(
            Effect.match({
              onFailure: cause => ({
                supported: false as const,
                reason: errorMessage(cause),
                reasonCode: 'host_command_failed' as const,
              }),
              onSuccess: support => support,
            }),
            Effect.map(support =>
              version
                ? {
                    available: true,
                    supported: support.supported,
                    version,
                    ...(support.supported
                      ? {}
                      : {
                          unsupportedReason: support.reason,
                          unsupportedReasonCode: support.reasonCode,
                        }),
                  }
                : {
                    available: true,
                    supported: support.supported,
                    ...(support.supported
                      ? {}
                      : {
                          unsupportedReason: support.reason,
                          unsupportedReasonCode: support.reasonCode,
                        }),
                  }
            )
          );
        },
      })
    );
  });

const commandFailureSuffix = (result: CommandResult): string => {
  return `: ${commandResultDetail(result)}`;
};

const errorMessage = (error: unknown): string => {
  if (Predicate.isError(error)) return error.message;
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
  capture(adapter, args, 'inspect').pipe(
    Effect.mapError(cause =>
      setupProcessError({
        adapter,
        stage: 'inspect',
        message: `Failed to inspect ${targetLabel(adapter.target)} ${operation}: ${errorMessage(cause)}. ${recoveryHint(adapter, setupOperation)}`,
        cause,
      })
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
    return setupProcessError({
      adapter,
      stage: 'inspect',
      message: `Failed to inspect ${targetLabel(adapter.target)} ${operation}${commandFailureSuffix(result)}. ${recoveryHint(adapter, setupOperation)}`,
    });
  }
  const inspected = parse(result.stdout);
  if (!inspected) {
    return setupProcessError({
      adapter,
      stage: 'inspect',
      message: `${targetLabel(adapter.target)} returned invalid JSON while inspecting ${operation}. ${recoveryHint(adapter, setupOperation)}`,
    });
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
      return yield* setupProcessError({
        adapter,
        stage: 'inspect',
        message: unsupportedInspectionMessage(adapter),
      });
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
        onTimeout: () =>
          setupProcessError({
            adapter,
            stage: 'mutate',
            message: `${operation} timed out after ${SETUP_COMMAND_TIMEOUT}.`,
          }),
      }),
      Effect.mapError(cause =>
        setupProcessError({
          adapter,
          stage: 'mutate',
          message: `${operation} failed: ${errorMessage(cause)}. ${recoveryHint(adapter, setupOperation)}`,
          cause,
        })
      )
    );
    if (result.exitCode !== 0) {
      return yield* setupProcessError({
        adapter,
        stage: 'mutate',
        message: `${operation} failed${commandFailureSuffix(result)}. ${recoveryHint(adapter, setupOperation)}`,
      });
    }
  });

const validateInitialState = (adapter: SetupTargetAdapter, initial: InspectedSetupTarget) => {
  if (!initial.available) {
    return setupProcessError({
      adapter,
      stage: 'validate',
      message: `${adapter.executable} is not installed or not available on PATH. Install it and rerun \`composio setup --target ${adapter.target}\`.`,
    });
  }
  if (initial.marketplace_conflict) {
    return setupProcessError({
      adapter,
      stage: 'validate',
      message: `The ${adapter.target} marketplace named "composio" points to a different source. Run \`${adapter.marketplaceRemoveCommand}\`, then rerun \`composio setup --target ${adapter.target}\`.`,
    });
  }
  return Effect.void;
};

const toSetupTargetResult = (params: {
  readonly adapter: SetupTargetAdapter;
  readonly final: InspectedSetupTarget;
  readonly pluginChanged: boolean;
  readonly skillChanged: boolean;
}): SetupTargetResult => ({
  target: params.adapter.target,
  available: params.final.available,
  marketplace_configured: params.final.marketplace_configured,
  plugin_installed: params.final.plugin_installed,
  plugin_enabled: params.final.plugin_enabled,
  cli_skill_ready: params.final.cli_skill_ready,
  changed: params.pluginChanged || params.skillChanged,
  plugin_changed: params.pluginChanged,
  skill_changed: params.skillChanged,
});

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
        Effect.mapError(cause =>
          setupProcessError({
            adapter,
            stage: 'skill',
            message: `Installing the Claude Code CLI skill failed: ${errorMessage(cause)}. ${recoveryHint(adapter, 'setup')}`,
            cause,
          })
        )
      );
    }

    const final = yield* inspectAdapter(adapter);
    if (!isSetupReady(final)) {
      return yield* setupProcessError({
        adapter,
        stage: 'verify',
        message: `Setup commands completed, but ${adapter.target} did not report the Composio plugin and CLI skill as ready. Rerun \`composio setup --target ${adapter.target}\` or inspect the native ${adapter.target} plugin configuration.`,
      });
    }

    return toSetupTargetResult({ adapter, final, pluginChanged, skillChanged });
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
        Effect.mapError(cause =>
          setupProcessError({
            adapter,
            stage: 'skill',
            message: `Removing the Claude Code CLI skill failed: ${errorMessage(cause)}. ${recoveryHint(adapter, 'uninstall')}`,
            cause,
          })
        )
      );
    }

    const final = yield* inspectAdapter(adapter, undefined, 'uninstall');
    if (final.plugin_installed) {
      return yield* setupProcessError({
        adapter,
        stage: 'verify',
        message: `Uninstall commands completed, but ${adapter.target} still reports the Composio plugin as installed. Rerun \`composio setup --uninstall --target ${adapter.target}\` or inspect the native ${adapter.target} plugin configuration.`,
      });
    }

    return toSetupTargetResult({ adapter, final, pluginChanged, skillChanged });
  });

const FIXED_TARGETS: Readonly<Partial<Record<SetupTarget, ReadonlyArray<AgentHost>>>> = {
  claude: ['claude'],
  codex: ['codex'],
  all: ['claude', 'codex'],
};

export type SetupUnsupportedReasonCode =
  'codex_too_old' | 'no_json_inspection' | 'host_command_failed' | 'unknown';

export interface SetupTargetDetection {
  readonly target: AgentHost;
  readonly available: boolean;
  readonly supported: boolean;
  readonly version?: string;
  readonly unsupportedReason?: string;
  readonly unsupportedReasonCode?: SetupUnsupportedReasonCode;
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

const runSetupTargets = <E, R>(
  inspected: ReadonlyArray<InspectedSetupTarget>,
  runAdapter: (
    adapter: SetupTargetAdapter,
    status: InspectedSetupTarget
  ) => Effect.Effect<SetupTargetResult, E, R>,
  verb: 'Setup' | 'Uninstall'
) =>
  Effect.gen(function* () {
    const operation = verb === 'Uninstall' ? 'uninstall' : 'setup';
    const phase = verb === 'Uninstall' ? 'uninstall' : 'install';
    const { invocationOrigin } = yield* cliInvocationContext;
    const completed: SetupTargetResult[] = [];
    for (const status of inspected) {
      const result = yield* runAdapter(ADAPTERS[status.target], status).pipe(
        Effect.tapError(error =>
          trackCliEventEffect(
            getPluginLifecycleFailedEvent({
              operation,
              target: status.target,
              phase,
              error,
              invocationOrigin,
              cliVersion: APP_VERSION,
            })
          )
        ),
        Effect.mapError(error => {
          if (completed.length === 0) return error;
          const targets = completed.map(item => item.target).join(', ');
          return setupProcessError({
            adapter: ADAPTERS[status.target],
            stage: 'mutate',
            message: `${verb} completed for ${targets} before a later target failed: ${errorMessage(error)}`,
            cause: error,
          });
        })
      );
      if (result.plugin_changed) {
        const action =
          operation === 'uninstall'
            ? 'uninstalled'
            : !status.plugin_installed
              ? 'installed'
              : !status.plugin_enabled
                ? 'enabled'
                : 'configured';
        yield* trackCliEventEffect(
          getPluginLifecycleSucceededEvent({
            operation,
            target: result.target,
            action,
            invocationOrigin,
            cliVersion: APP_VERSION,
          })
        );
      }
      completed.push(result);
    }
    return completed;
  });

export const installSetupTargets = (inspected: ReadonlyArray<InspectedSetupTarget>) =>
  runSetupTargets(inspected, installAdapter, 'Setup');

export const uninstallSetupTargets = (inspected: ReadonlyArray<InspectedSetupTarget>) =>
  runSetupTargets(inspected, uninstallAdapter, 'Uninstall');
