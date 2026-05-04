import * as fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';
import type { MasterKind } from 'src/services/master-detector';
import {
  resolveRunCompanionAssetPath,
  resolveRunCompanionModulePath,
  RUN_CODEX_ACP_BINARY_TARGETS,
} from 'src/services/run-companion-modules';
import {
  ACP_STRUCTURED_OUTPUT_TOOL_NAME,
  AcpInvokeError,
  buildStructuredRepairPrompt,
  buildStructuredPrompt,
  buildStructuredToolPrompt,
  finalizeInvokeAgentText,
  toInvokeAgentResponse,
  unwrapStructuredOutputToolPayload,
  validateStructuredOutput,
  type HelperDebugLog,
  type InvokeAgentNormalizedOptions,
  type InvokeAgentResponse,
  type InvokeAgentTarget,
} from 'src/services/run-subagent-shared';

const resolveShippedAdapterAsset = (target: InvokeAgentTarget): string | null => {
  if (target === 'claude') {
    return resolveRunCompanionAssetPath({
      callerImportMetaUrl: import.meta.url,
      execPath: process.execPath,
      relativePathFromRoot: 'acp-adapters/claude-code-acp.mjs',
    });
  }

  const binaryTarget = RUN_CODEX_ACP_BINARY_TARGETS.find(
    candidate => candidate.platform === process.platform && candidate.arch === process.arch
  );
  if (!binaryTarget) {
    return null;
  }

  return resolveRunCompanionAssetPath({
    callerImportMetaUrl: import.meta.url,
    execPath: process.execPath,
    relativePathFromRoot: binaryTarget.relativePath,
  });
};

const resolveInstalledAdapter = (target: InvokeAgentTarget): string | null => {
  const specifier =
    target === 'claude'
      ? '@zed-industries/claude-code-acp/dist/index.js'
      : '@zed-industries/codex-acp/bin/codex-acp.js';
  try {
    const require = createRequire(import.meta.url);
    return require.resolve(specifier);
  } catch {
    return null;
  }
};

export const resolveAcpAdapterCommand = (
  target: InvokeAgentTarget
): {
  readonly cmd: ReadonlyArray<string>;
  readonly env?: Readonly<Record<string, string>>;
  readonly source: 'shipped' | 'bundled' | 'which' | 'npx';
} => {
  const binary = target === 'claude' ? 'claude-code-acp' : 'codex-acp';
  const packageName =
    target === 'claude' ? '@zed-industries/claude-code-acp' : '@zed-industries/codex-acp';

  // 1. Prefer shipped companion assets next to the CLI binary / dist bundle.
  const shipped = resolveShippedAdapterAsset(target);
  if (shipped) {
    if (target === 'codex') {
      return {
        cmd: [shipped],
        source: 'shipped',
      };
    }

    return {
      cmd: [process.execPath, shipped],
      env: {
        BUN_BE_BUN: '1',
      },
      source: 'shipped',
    };
  }

  // 2. Try the installed dependency bundle next (no npx overhead).
  const bundled = resolveInstalledAdapter(target);
  if (bundled) {
    return {
      cmd: [process.execPath, bundled],
      env: {
        BUN_BE_BUN: '1',
      },
      source: 'bundled',
    };
  }

  // 3. Check if the binary is on PATH.
  if (typeof Bun !== 'undefined' && typeof Bun.which === 'function') {
    const resolved = Bun.which(binary);
    if (resolved) {
      return {
        cmd: [resolved],
        source: 'which',
      };
    }
  }

  // 4. Fall back to npx.
  return {
    cmd: [process.platform === 'win32' ? 'npx.cmd' : 'npx', '-y', packageName],
    source: 'npx',
  };
};

const chunkFlushPattern = /[\s,.;:!?)\]}"]$/;
const structuredOutputMcpModulePath = resolveRunCompanionModulePath({
  callerImportMetaUrl: import.meta.url,
  execPath: process.execPath,
  relativeNoExtensionFromCaller: './run-subagent-output-mcp',
});

const collectToolCallPaths = (value: unknown, results: Set<string>, parentKey?: string): void => {
  if (typeof value === 'string') {
    const key = parentKey?.toLowerCase() ?? '';
    if (
      key === 'path' ||
      key === 'file_path' ||
      key === 'directory' ||
      key.endsWith('_path') ||
      key.endsWith('_directory')
    ) {
      results.add(value);
    } else if (key === 'command' || key === 'cmd') {
      for (const candidatePath of extractPathsFromCommandText(value)) {
        results.add(candidatePath);
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    const key = parentKey?.toLowerCase() ?? '';
    if (
      key === 'paths' ||
      key === 'directories' ||
      key.endsWith('_paths') ||
      key.endsWith('_directories')
    ) {
      for (const entry of value) {
        if (typeof entry === 'string') {
          results.add(entry);
        }
      }
      return;
    }

    for (const entry of value) {
      collectToolCallPaths(entry, results);
    }
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    collectToolCallPaths(nestedValue, results, key);
  }
};

const extractPathsFromCommandText = (command: string): ReadonlyArray<string> => {
  const results = new Set<string>();
  const matches = command.matchAll(/(^|[\s"'`])((?:~\/|\/)[^\s"'`|&;<>]+)/g);
  for (const match of matches) {
    const rawPath = match[2]?.trim();
    if (!rawPath) {
      continue;
    }

    results.add(rawPath.startsWith('~/') ? path.join(os.homedir(), rawPath.slice(2)) : rawPath);
  }

  return [...results];
};

const extractToolCallPaths = (
  toolCall: Pick<acp.RequestPermissionRequest, 'toolCall'>['toolCall']
): ReadonlyArray<string> => {
  const paths = new Set<string>();
  for (const location of toolCall.locations ?? []) {
    if (typeof location.path === 'string' && location.path.length > 0) {
      paths.add(location.path);
    }
  }

  collectToolCallPaths(toolCall.rawInput, paths);
  if (typeof toolCall.title === 'string') {
    for (const candidatePath of extractPathsFromCommandText(toolCall.title)) {
      paths.add(candidatePath);
    }
  }
  return [...paths];
};

export const selectPermissionOutcome = (
  params: Pick<acp.RequestPermissionRequest, 'options' | 'toolCall'>,
  _allowedReadRoots: ReadonlyArray<string> = []
): acp.RequestPermissionResponse => {
  const allowOnce =
    params.options.find(option => option.kind === 'allow_always') ??
    params.options.find(option => option.kind === 'allow_once');
  const rejectOption =
    params.options.find(option => option.kind === 'reject_once') ??
    params.options.find(option => option.kind === 'reject_always');

  // Intentionally permissive for `composio run` experimental_subAgent sessions. The user is
  // explicitly opting into local tool access, so prefer broad ACP approval over
  // heuristic rejections that strand the agent mid-task.
  if (allowOnce) {
    return {
      outcome: {
        outcome: 'selected',
        optionId: allowOnce.optionId,
      },
    };
  }

  if (rejectOption) {
    return {
      outcome: {
        outcome: 'selected',
        optionId: rejectOption.optionId,
      },
    };
  }

  return {
    outcome: {
      outcome: 'cancelled',
    },
  };
};

export class BufferedChunkLogger {
  private buffer = '';

  constructor(
    private readonly step: 'subAgent.acp.message' | 'subAgent.acp.thought',
    private readonly helperDebugLog: HelperDebugLog
  ) {}

  push(text: string): void {
    this.buffer += text;
    this.flushCompletedLines();
    this.flushWhenReadable();
  }

  flush(): void {
    this.emit(this.buffer);
    this.buffer = '';
  }

  private flushCompletedLines(): void {
    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex);
      this.emit(line);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      newlineIndex = this.buffer.indexOf('\n');
    }
  }

  private flushWhenReadable(): void {
    if (this.buffer.length < 48) {
      return;
    }

    if (!chunkFlushPattern.test(this.buffer)) {
      return;
    }

    this.emit(this.buffer);
    this.buffer = '';
  }

  private emit(text: string): void {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return;
    }

    this.helperDebugLog(this.step, {
      text: normalized,
    });
  }
}

class RunSubAgentClient {
  private readonly textChunks: string[] = [];
  private readonly messageLogger: BufferedChunkLogger;
  private readonly thoughtLogger: BufferedChunkLogger;

  constructor(
    private readonly helperDebugLog: HelperDebugLog,
    private readonly allowedReadRoots: ReadonlyArray<string>
  ) {
    this.messageLogger = new BufferedChunkLogger('subAgent.acp.message', helperDebugLog);
    this.thoughtLogger = new BufferedChunkLogger('subAgent.acp.thought', helperDebugLog);
  }

  async requestPermission(
    params: acp.RequestPermissionRequest
  ): Promise<acp.RequestPermissionResponse> {
    const requestedPaths = extractToolCallPaths(params.toolCall);
    const decision = selectPermissionOutcome(params, this.allowedReadRoots);
    this.helperDebugLog('subAgent.acp.permission', {
      toolCallId: params.toolCall.toolCallId,
      title: params.toolCall.title ?? null,
      kind: params.toolCall.kind ?? null,
      locations: params.toolCall.locations?.map(location => location.path) ?? [],
      requestedPaths,
      allowedReadRoots: this.allowedReadRoots,
      selectedOptionId: decision.outcome.outcome === 'selected' ? decision.outcome.optionId : null,
      options: params.options.map(option => option.kind),
    });

    return decision;
  }

  async sessionUpdate(params: acp.SessionNotification): Promise<void> {
    const update = params.update;
    if (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text') {
      this.textChunks.push(update.content.text);
      this.messageLogger.push(update.content.text);
      return;
    }

    if (update.sessionUpdate === 'agent_thought_chunk' && update.content.type === 'text') {
      this.thoughtLogger.push(update.content.text);
      return;
    }

    if (update.sessionUpdate === 'tool_call') {
      this.helperDebugLog('subAgent.acp.tool_call', {
        title: update.title,
        kind: update.kind ?? null,
        status: update.status ?? null,
        locations: update.locations?.map(location => location.path) ?? [],
      });
      return;
    }

    if (update.sessionUpdate === 'tool_call_update') {
      this.helperDebugLog('subAgent.acp.tool_call_update', {
        toolCallId: update.toolCallId,
        title: update.title ?? null,
        kind: update.kind ?? null,
        status: update.status ?? null,
        locations: update.locations?.map(location => location.path) ?? [],
        rawOutput: update.rawOutput ?? null,
      });
      return;
    }

    if (update.sessionUpdate === 'plan') {
      this.helperDebugLog('subAgent.acp.plan', {
        entries: update.entries.map(entry => ({
          status: entry.status,
          priority: entry.priority ?? null,
          content: entry.content,
        })),
      });
      return;
    }

    this.helperDebugLog('subAgent.acp.update', {
      type: update.sessionUpdate,
    });
  }

  getText(): string {
    this.messageLogger.flush();
    this.thoughtLogger.flush();
    return this.textChunks.join('');
  }
}

const createFallbackError = (
  code: ConstructorParameters<typeof AcpInvokeError>[0],
  message: string,
  cause?: unknown
): AcpInvokeError => new AcpInvokeError(code, message, cause === undefined ? undefined : { cause });

type StructuredOutputMcpContext = {
  readonly mcpServer: acp.McpServerStdio;
  readonly resultFilePath: string;
  readonly cleanup: () => void;
};

export const createStructuredOutputMcpContext = ({
  options,
  helperDebugLog,
}: {
  options: InvokeAgentNormalizedOptions;
  helperDebugLog: HelperDebugLog;
}): StructuredOutputMcpContext | null => {
  if (!options.structuredSchema) {
    return null;
  }

  let tempDirectory: string | null = null;
  try {
    // Keep this on an OS temp dir for now. Repointing MCP schema/result files into
    // session artifacts needs a broader bundling + run-companion test pass so we
    // don't break structured sub-agent output in packaged CLI builds.
    tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-subagent-output-mcp-'));
    const schemaFilePath = path.join(tempDirectory, 'schema.json');
    const resultFilePath = path.join(tempDirectory, 'result.json');
    fs.writeFileSync(schemaFilePath, JSON.stringify(options.structuredSchema), 'utf8');

    helperDebugLog('subAgent.acp.structured_output_tool', {
      modulePath: structuredOutputMcpModulePath,
      schemaFilePath,
      resultFilePath,
    });

    return {
      mcpServer: {
        name: 'composio-structured-output',
        command: process.execPath,
        args: [
          structuredOutputMcpModulePath,
          '--schema-file',
          schemaFilePath,
          '--result-file',
          resultFilePath,
        ],
        env: [
          {
            name: 'BUN_BE_BUN',
            value: '1',
          },
        ],
      },
      resultFilePath,
      cleanup: () => {
        if (tempDirectory) {
          fs.rmSync(tempDirectory, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    if (tempDirectory) {
      fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
    helperDebugLog('subAgent.acp.structured_output_tool_failed', {
      error: error instanceof Error ? error.message : String(error),
      modulePath: structuredOutputMcpModulePath,
    });
    return null;
  }
};

const maybeReadStructuredOutputFromTool = ({
  context,
  options,
  helperDebugLog,
}: {
  context: StructuredOutputMcpContext | null;
  options: InvokeAgentNormalizedOptions;
  helperDebugLog: HelperDebugLog;
}): unknown | undefined => {
  if (!context || !options.structuredSchema || !fs.existsSync(context.resultFilePath)) {
    return undefined;
  }

  try {
    const rawPayload = JSON.parse(fs.readFileSync(context.resultFilePath, 'utf8')) as unknown;
    const parsed = unwrapStructuredOutputToolPayload(rawPayload, options.structuredSchema);
    helperDebugLog('subAgent.acp.structured_output_tool_result', {
      resultFilePath: context.resultFilePath,
    });
    return validateStructuredOutput(parsed, options);
  } catch (error) {
    helperDebugLog('subAgent.acp.structured_output_tool_result_failed', {
      resultFilePath: context.resultFilePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
};

export const invokeAcpSubAgent = async ({
  prompt,
  options,
  master,
  target,
  allowedReadRoots,
  helperDebugLog,
}: {
  prompt: string;
  options: InvokeAgentNormalizedOptions;
  master: MasterKind;
  target: InvokeAgentTarget;
  allowedReadRoots: ReadonlyArray<string>;
  helperDebugLog: HelperDebugLog;
}): Promise<InvokeAgentResponse> => {
  const structuredOutputMcp = createStructuredOutputMcpContext({
    options,
    helperDebugLog,
  });
  const resolved = resolveAcpAdapterCommand(target);
  helperDebugLog('subAgent.acp.resolve', {
    target,
    source: resolved.source,
    command: resolved.cmd[0],
    args: resolved.cmd.slice(1),
  });

  const { CLAUDECODE: _, ...childEnv } = process.env;
  const child = spawn(resolved.cmd[0]!, resolved.cmd.slice(1), {
    cwd: process.cwd(),
    env: resolved.env
      ? {
          ...childEnv,
          ...resolved.env,
        }
      : childEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', chunk => {
    stderr += chunk;
  });

  const closePromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    }
  );

  if (!child.stdin || !child.stdout) {
    child.kill();
    throw createFallbackError('spawn_failed', `Failed to spawn ${target} ACP adapter.`);
  }

  const client = new RunSubAgentClient(helperDebugLog, [
    ...new Set(allowedReadRoots.map(root => path.resolve(root))),
  ]);
  const stream = acp.ndJsonStream(
    Writable.toWeb(child.stdin) as unknown as WritableStream<Uint8Array>,
    Readable.toWeb(child.stdout) as unknown as ReadableStream<Uint8Array>
  );
  const connection = new acp.ClientSideConnection(() => client, stream);

  try {
    const initialized = await connection
      .initialize({
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {},
      })
      .catch(error => {
        throw createFallbackError(
          'initialize_failed',
          `${target} ACP initialize failed${stderr.trim() ? `: ${stderr.trim()}` : ''}`,
          error
        );
      });

    helperDebugLog('subAgent.acp.initialized', {
      target,
      protocolVersion: initialized.protocolVersion,
    });

    const session = await connection
      .newSession({
        cwd: process.cwd(),
        mcpServers: structuredOutputMcp ? [structuredOutputMcp.mcpServer] : [],
      })
      .catch(error => {
        throw createFallbackError(
          'session_failed',
          `${target} ACP session creation failed${stderr.trim() ? `: ${stderr.trim()}` : ''}`,
          error
        );
      });

    helperDebugLog('subAgent.acp.session', {
      target,
      sessionId: session.sessionId,
    });

    if (typeof options.model === 'string' && options.model.trim().length > 0) {
      try {
        await connection.unstable_setSessionModel({
          sessionId: session.sessionId,
          modelId: options.model.trim(),
        });
        helperDebugLog('subAgent.acp.model', {
          target,
          model: options.model.trim(),
          applied: true,
        });
      } catch (error) {
        helperDebugLog('subAgent.acp.model', {
          target,
          model: options.model.trim(),
          applied: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const promptText =
      options.structuredSchema && structuredOutputMcp
        ? buildStructuredToolPrompt(
            prompt,
            options.structuredSchema,
            ACP_STRUCTURED_OUTPUT_TOOL_NAME
          )
        : buildStructuredPrompt(prompt, options.structuredSchema);
    const runPrompt = async (promptText: string) =>
      connection
        .prompt({
          sessionId: session.sessionId,
          prompt: [{ type: 'text', text: promptText }],
        })
        .catch(error => {
          if (connection.signal.aborted) {
            throw createFallbackError(
              'connection_closed',
              `${target} ACP connection closed before prompt completion${stderr.trim() ? `: ${stderr.trim()}` : ''}`,
              error
            );
          }
          throw createFallbackError(
            'prompt_failed',
            `${target} ACP prompt failed${stderr.trim() ? `: ${stderr.trim()}` : ''}`,
            error
          );
        });

    const response = await runPrompt(promptText);

    if (response.stopReason === 'cancelled') {
      throw createFallbackError(
        'prompt_failed',
        `${target} ACP prompt was cancelled${stderr.trim() ? `: ${stderr.trim()}` : ''}`
      );
    }

    const structuredOutput = maybeReadStructuredOutputFromTool({
      context: structuredOutputMcp,
      options,
      helperDebugLog,
    });
    if (structuredOutput !== undefined) {
      return toInvokeAgentResponse(master, target, {
        result: null,
        structuredOutput,
      });
    }

    let payload: Pick<InvokeAgentResponse, 'result' | 'structuredOutput'>;
    try {
      payload = finalizeInvokeAgentText(client.getText(), options);
    } catch (error) {
      if (!options.structuredSchema) {
        throw error;
      }

      helperDebugLog('subAgent.acp.structured_repair', {
        target,
        reason: error instanceof Error ? error.message : String(error),
      });

      const repairResponse = await runPrompt(
        buildStructuredRepairPrompt(
          options.structuredSchema,
          structuredOutputMcp ? ACP_STRUCTURED_OUTPUT_TOOL_NAME : undefined
        )
      );

      if (repairResponse.stopReason === 'cancelled') {
        throw createFallbackError(
          'prompt_failed',
          `${target} ACP repair prompt was cancelled${stderr.trim() ? `: ${stderr.trim()}` : ''}`
        );
      }

      const repairedStructuredOutput = maybeReadStructuredOutputFromTool({
        context: structuredOutputMcp,
        options,
        helperDebugLog,
      });
      if (repairedStructuredOutput !== undefined) {
        return toInvokeAgentResponse(master, target, {
          result: null,
          structuredOutput: repairedStructuredOutput,
        });
      }

      payload = finalizeInvokeAgentText(client.getText(), options);
    }

    return toInvokeAgentResponse(master, target, payload);
  } finally {
    structuredOutputMcp?.cleanup();
    child.kill();
    await Promise.race([
      closePromise.catch(() => undefined),
      new Promise(resolve => setTimeout(resolve, 200)),
    ]);
    if (!child.killed) {
      child.kill('SIGKILL');
    }
  }
};
