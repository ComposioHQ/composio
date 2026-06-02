import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveBundledBinary } from './bundled-binaries';
import { detectCliPlatform, formatSupportedPlatforms, supportsCliPlatform } from './platform';
import { readLocalToolsMeta, type LocalToolsMetaOptions } from './meta';
import { localToolkitDeclarations, normalizeLocalToolSlug } from './registry';
import type {
  LocalBundledBinaryRef,
  LocalCliPlatform,
  LocalCommandInvocation,
  LocalMcpServerSpec,
  LocalToolkitDeclaration,
  LocalToolDeclaration,
  LocalToolExecution,
} from './types';

export type LocalReadinessStatus =
  | 'ready'
  | 'unsupported'
  | 'disabled'
  | 'missing'
  | 'not_implemented'
  | 'unknown';

export interface LocalCommandReadiness {
  readonly command: string;
  readonly args?: ReadonlyArray<string>;
  readonly found: boolean;
  readonly path?: string;
}

export interface LocalToolReadiness {
  readonly finalSlug: string;
  readonly slug: string;
  readonly name: string;
  readonly toolkitSlug: string;
  readonly executionKind: LocalToolExecution['kind'];
  readonly platforms: ReadonlyArray<LocalCliPlatform>;
  readonly supported: boolean;
  readonly status: LocalReadinessStatus;
  readonly command?: LocalCommandReadiness;
  readonly messages: ReadonlyArray<string>;
  readonly hints: ReadonlyArray<string>;
}

export interface LocalToolkitReadiness {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly platforms: ReadonlyArray<LocalCliPlatform>;
  readonly supported: boolean;
  readonly status: LocalReadinessStatus;
  readonly source?: LocalToolkitDeclaration['source'];
  readonly setup?: LocalToolkitDeclaration['setup'];
  readonly tools: ReadonlyArray<LocalToolReadiness>;
  readonly messages: ReadonlyArray<string>;
  readonly hints: ReadonlyArray<string>;
}

export interface LocalToolsReadinessReport {
  readonly currentPlatform: LocalCliPlatform;
  readonly toolkits: ReadonlyArray<LocalToolkitReadiness>;
}

const toolkitMatchesFilter = (
  toolkit: LocalToolkitDeclaration,
  requestedToolkits?: ReadonlyArray<string>
): boolean => {
  if (!requestedToolkits || requestedToolkits.length === 0) return true;
  const requested = new Set(requestedToolkits.map(slug => slug.toLowerCase()));
  return requested.has(toolkit.slug.toLowerCase());
};

const statusPriority: Record<LocalReadinessStatus, number> = {
  ready: 0,
  unknown: 1,
  not_implemented: 2,
  missing: 3,
  disabled: 4,
  unsupported: 5,
};

const aggregateStatus = (statuses: ReadonlyArray<LocalReadinessStatus>): LocalReadinessStatus => {
  if (statuses.length === 0) return 'unknown';
  return statuses.reduce((current, next) =>
    statusPriority[next] > statusPriority[current] ? next : current
  );
};

const resolveValue = <T>(
  value: T | ((input: Record<string, unknown>) => T),
  input: Record<string, unknown> = {}
): T =>
  typeof value === 'function' ? (value as (input: Record<string, unknown>) => T)(input) : value;

const splitPathEntries = (pathValue: string | undefined): ReadonlyArray<string> =>
  (pathValue ?? '')
    .split(path.delimiter)
    .map(entry => entry.trim())
    .filter(Boolean);

const hasPathSeparator = (command: string): boolean =>
  command.includes('/') || command.includes('\\');

const executableCandidates = (command: string): ReadonlyArray<string> => {
  if (process.platform !== 'win32') return [command];
  const extensions = (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM')
    .split(';')
    .map(ext => ext.trim())
    .filter(Boolean);
  if (extensions.some(ext => command.toUpperCase().endsWith(ext.toUpperCase()))) return [command];
  return extensions.map(ext => `${command}${ext}`);
};

const canExecute = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
};

export const findExecutableOnPath = async (command: string): Promise<string | undefined> => {
  const trimmed = command.trim();
  if (!trimmed) return undefined;

  if (path.isAbsolute(trimmed) || hasPathSeparator(trimmed)) {
    for (const candidate of executableCandidates(trimmed)) {
      if (await canExecute(candidate)) return candidate;
    }
    return undefined;
  }

  for (const pathEntry of splitPathEntries(process.env.PATH)) {
    for (const candidate of executableCandidates(path.join(pathEntry, trimmed))) {
      if (await canExecute(candidate)) return candidate;
    }
  }

  return undefined;
};

const getToolkitMeta = (
  meta: Awaited<ReturnType<typeof readLocalToolsMeta>>,
  toolkitSlug: string
) => meta.toolkits[toolkitSlug.toLowerCase()] ?? meta.toolkits[toolkitSlug];

const getToolMeta = (meta: Awaited<ReturnType<typeof readLocalToolsMeta>>, finalSlug: string) =>
  meta.tools[finalSlug.toUpperCase()] ?? meta.tools[finalSlug];

const isBundledBinaryRef = (value: unknown): value is LocalBundledBinaryRef =>
  typeof value === 'object' &&
  value !== null &&
  'bundledBinary' in value &&
  typeof (value as { bundledBinary?: unknown }).bundledBinary === 'string';

const resolveCommandSpec = async (
  execution: Extract<LocalToolExecution, { kind: 'command' }>,
  params: {
    readonly toolkit: LocalToolkitDeclaration;
    readonly currentPlatform: LocalCliPlatform;
    readonly commandOverride?: string;
  }
): Promise<LocalCommandInvocation> => {
  const commandValue = resolveValue(execution.command);
  const invocation: LocalCommandInvocation =
    typeof commandValue === 'string'
      ? { command: commandValue }
      : isBundledBinaryRef(commandValue)
        ? await (async () => {
            const resolved = await resolveBundledBinary(params.toolkit, commandValue, {
              currentPlatform: params.currentPlatform,
            });
            return {
              command: resolved?.exists
                ? resolved.path
                : (commandValue.fallbackCommand ?? resolved?.path ?? commandValue.bundledBinary),
            };
          })()
        : commandValue;
  return {
    ...invocation,
    command: params.commandOverride ?? invocation.command,
    args: invocation.args ?? (execution.args ? resolveValue(execution.args) : undefined),
  };
};

const resolveMcpServer = (
  execution: Extract<LocalToolExecution, { kind: 'mcp' }>
): LocalMcpServerSpec => resolveValue(execution.server);

const setupHintsForToolkit = (toolkit: LocalToolkitDeclaration): ReadonlyArray<string> => [
  ...(toolkit.setup?.install ? [toolkit.setup.install] : []),
  ...(toolkit.setup?.commandOverrides ?? []),
  ...(toolkit.setup?.notes ?? []),
];

const checkCommand = async (
  command: string,
  args?: ReadonlyArray<string>
): Promise<LocalCommandReadiness> => {
  const executablePath = await findExecutableOnPath(command);
  return {
    command,
    ...(args ? { args } : {}),
    found: executablePath !== undefined,
    ...(executablePath ? { path: executablePath } : {}),
  };
};

const checkToolReadiness = async (params: {
  readonly toolkit: LocalToolkitDeclaration;
  readonly tool: LocalToolDeclaration;
  readonly currentPlatform: LocalCliPlatform;
  readonly toolkitDisabled: boolean;
  readonly commandOverride?: string;
  readonly toolDisabled: boolean;
}): Promise<LocalToolReadiness> => {
  const { toolkit, tool, currentPlatform, toolkitDisabled, commandOverride, toolDisabled } = params;
  const finalSlug = normalizeLocalToolSlug(tool.slug, toolkit.slug);
  const supported =
    supportsCliPlatform(toolkit.platforms, currentPlatform) &&
    supportsCliPlatform(tool.platforms, currentPlatform);
  const base = {
    finalSlug,
    slug: tool.slug,
    name: tool.name,
    toolkitSlug: toolkit.slug,
    executionKind: tool.execution.kind,
    platforms: tool.platforms,
    supported,
  } as const;

  if (!supported) {
    return {
      ...base,
      status: 'unsupported',
      messages: [
        `Unsupported on ${currentPlatform}; tool platforms: ${formatSupportedPlatforms(tool.platforms)}.`,
      ],
      hints: setupHintsForToolkit(toolkit),
    };
  }

  if (toolkitDisabled || toolDisabled) {
    return {
      ...base,
      status: 'disabled',
      messages: ['Disabled by ~/composio/local_tools.json metadata.'],
      hints: ['Remove disabled=true from the toolkit/tool metadata entry to re-enable it.'],
    };
  }

  if (tool.execution.kind === 'command') {
    try {
      const invocation = await resolveCommandSpec(tool.execution, {
        toolkit,
        currentPlatform,
        commandOverride,
      });
      const command = await checkCommand(invocation.command, invocation.args);
      return {
        ...base,
        status: command.found ? 'ready' : 'missing',
        command,
        messages: command.found
          ? [`Command found: ${command.path ?? command.command}.`]
          : [`Command not found on PATH: ${command.command}.`],
        hints: command.found
          ? []
          : [
              ...setupHintsForToolkit(toolkit),
              `Set ${finalSlug}.installation.command or ${toolkit.slug.toLowerCase()}.installation.command in ~/composio/local_tools.json to override the binary.`,
            ],
      };
    } catch (error) {
      return {
        ...base,
        status: 'unknown',
        messages: [
          `Could not resolve command wrapper: ${error instanceof Error ? error.message : String(error)}.`,
        ],
        hints: setupHintsForToolkit(toolkit),
      };
    }
  }

  if (tool.execution.kind === 'mcp') {
    try {
      const server = resolveMcpServer(tool.execution);
      const command = await checkCommand(server.command, server.args);
      return {
        ...base,
        status: command.found ? 'ready' : 'missing',
        command,
        messages: command.found
          ? [`MCP server launcher found: ${command.path ?? command.command}.`]
          : [`MCP server launcher not found on PATH: ${command.command}.`],
        hints: command.found ? (toolkit.setup?.notes ?? []) : setupHintsForToolkit(toolkit),
      };
    } catch (error) {
      return {
        ...base,
        status: 'unknown',
        messages: [
          `Could not resolve MCP server wrapper: ${error instanceof Error ? error.message : String(error)}.`,
        ],
        hints: setupHintsForToolkit(toolkit),
      };
    }
  }

  if (tool.execution.kind === 'ffi') {
    const library = tool.execution.library;
    const libraryPath =
      typeof library === 'string'
        ? library
        : ((await resolveBundledBinary(toolkit, library, { currentPlatform }))?.path ??
          library.fallbackCommand);
    const found = libraryPath
      ? await fs.access(libraryPath).then(
          () => true,
          () => false
        )
      : false;
    const bunAvailable = typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined';
    return {
      ...base,
      status: found ? (bunAvailable ? 'ready' : 'unknown') : 'missing',
      messages: [
        found
          ? `FFI library found: ${libraryPath}.`
          : `FFI library not found${typeof library === 'string' ? `: ${library}` : ` for bundled binary ${library.bundledBinary}`}.`,
        bunAvailable
          ? 'Bun FFI runtime is available.'
          : 'Bun FFI runtime is not available in this process; packaged CLI execution is required.',
      ],
      hints: found && bunAvailable ? [] : setupHintsForToolkit(toolkit),
    };
  }

  if (tool.execution.kind === 'native' && tool.execution.readiness) {
    const command = await checkCommand(
      commandOverride ?? tool.execution.readiness.command,
      tool.execution.readiness.args
    );
    return {
      ...base,
      status: command.found ? 'ready' : 'missing',
      command,
      messages: command.found
        ? [
            `Native wrapper prerequisite found: ${command.path ?? command.command}; app-specific runtime checks still happen at execution time.`,
          ]
        : [`Native wrapper prerequisite not found on PATH: ${command.command}.`],
      hints: command.found ? [] : setupHintsForToolkit(toolkit),
    };
  }

  if (tool.execution.kind === 'native' && toolkit.bundledBinaries?.length) {
    const bundledChecks = await Promise.all(
      toolkit.bundledBinaries.map(async binary => ({
        binary,
        resolved: await resolveBundledBinary(
          toolkit,
          { bundledBinary: binary.id },
          { currentPlatform }
        ),
      }))
    );
    const missing = bundledChecks.filter(check => check.resolved?.exists !== true);
    return {
      ...base,
      status: missing.length === 0 ? 'ready' : 'missing',
      messages:
        missing.length === 0
          ? bundledChecks.map(
              check => `Bundled local binary found: ${check.resolved?.path ?? check.binary.id}.`
            )
          : missing.map(check => `Bundled local binary not found: ${check.binary.id}.`),
      hints: missing.length === 0 ? [] : setupHintsForToolkit(toolkit),
    };
  }

  return {
    ...base,
    status: 'unknown',
    messages: ['Native local tool wrapper will self-check at execution time.'],
    hints: setupHintsForToolkit(toolkit),
  };
};

export const checkLocalToolkitsReadiness = async (
  options: {
    readonly currentPlatform?: LocalCliPlatform;
    readonly toolkits?: ReadonlyArray<string>;
    readonly includeUnsupported?: boolean;
    readonly metaOptions?: LocalToolsMetaOptions;
    readonly declarations?: ReadonlyArray<LocalToolkitDeclaration>;
  } = {}
): Promise<LocalToolsReadinessReport> => {
  const currentPlatform = options.currentPlatform ?? detectCliPlatform();
  const meta = await readLocalToolsMeta(options.metaOptions);
  const toolkits = (options.declarations ?? localToolkitDeclarations).filter(toolkit =>
    toolkitMatchesFilter(toolkit, options.toolkits)
  );
  const visibleToolkits = options.includeUnsupported
    ? toolkits
    : toolkits.filter(toolkit => supportsCliPlatform(toolkit.platforms, currentPlatform));

  const reports = await Promise.all(
    visibleToolkits.map(async toolkit => {
      const toolkitMeta = getToolkitMeta(meta, toolkit.slug);
      const toolkitSupported = supportsCliPlatform(toolkit.platforms, currentPlatform);
      const toolkitDisabled = toolkitMeta?.disabled === true;
      const tools = await Promise.all(
        toolkit.tools.map(tool => {
          const finalSlug = normalizeLocalToolSlug(tool.slug, toolkit.slug);
          const toolMeta = getToolMeta(meta, finalSlug);
          return checkToolReadiness({
            toolkit,
            tool,
            currentPlatform,
            toolkitDisabled,
            toolDisabled: toolMeta?.disabled === true,
            commandOverride: toolMeta?.installation?.command ?? toolkitMeta?.installation?.command,
          });
        })
      );
      const status = toolkitSupported
        ? toolkitDisabled
          ? 'disabled'
          : aggregateStatus(tools.map(tool => tool.status))
        : 'unsupported';
      return {
        slug: toolkit.slug,
        name: toolkit.name,
        description: toolkit.description,
        platforms: toolkit.platforms,
        supported: toolkitSupported,
        status,
        source: toolkit.source,
        setup: toolkit.setup,
        tools,
        messages: toolkitSupported
          ? toolkitDisabled
            ? ['Disabled by ~/composio/local_tools.json metadata.']
            : []
          : [
              `Unsupported on ${currentPlatform}; toolkit platforms: ${formatSupportedPlatforms(toolkit.platforms)}.`,
            ],
        hints: status === 'ready' ? [] : setupHintsForToolkit(toolkit),
      } satisfies LocalToolkitReadiness;
    })
  );

  return { currentPlatform, toolkits: reports };
};
