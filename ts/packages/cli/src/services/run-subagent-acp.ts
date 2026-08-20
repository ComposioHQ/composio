import { createRequire } from 'node:module';
import type { Readable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';
import { Command, FileSystem, Path } from '@effect/platform';
import { BunContext } from '@effect/platform-bun';
import { Cause, Config, Data, Effect, Exit, Layer, Option, Predicate, Queue, Stream } from 'effect';
import type { MasterKind } from 'src/services/master-detector';
import { NodeOs } from 'src/services/node-os';
import {
  codexAcpBinaryTargetFor,
  hasInstalledRunCompanionModules,
  resolveRunCompanionAssetPath,
  resolveRunCompanionModulePath,
  RUN_COMPANION_SHARED_STATIC_ASSET_RELATIVE_PATHS,
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

type LegacySetSessionModelConnection = {
  readonly unstable_setSessionModel?: (params: {
    readonly sessionId: string;
    readonly modelId: string;
  }) => Promise<unknown>;
};

type AcpAdapterCommand = {
  readonly cmd: readonly [string, ...ReadonlyArray<string>];
  readonly env?: Readonly<Record<string, string>>;
  readonly source: 'shipped' | 'bundled' | 'which' | 'npx';
};

// This module is bundled as a standalone `composio run` companion module, so it
// provides its own platform layers instead of assuming the CLI runtime.
const RunSubAgentAcpLive = Layer.mergeAll(BunContext.layer, NodeOs.Default);

const getLegacySetSessionModel = (
  connection: unknown
): LegacySetSessionModelConnection['unstable_setSessionModel'] => {
  if (!Predicate.hasProperty(connection, 'unstable_setSessionModel')) {
    return undefined;
  }
  const method = connection.unstable_setSessionModel;
  return Predicate.isFunction(method) ? async params => method.call(connection, params) : undefined;
};

export const readableStreamFromNode = (input: Readable): ReadableStream<Uint8Array> => {
  let cleanup = () => undefined;

  return new ReadableStream<Uint8Array>({
    start: controller => {
      const onData = (chunk: Buffer | string) => {
        controller.enqueue(
          typeof chunk === 'string' ? new TextEncoder().encode(chunk) : Uint8Array.from(chunk)
        );
        if ((controller.desiredSize ?? 1) <= 0) {
          input.pause();
        }
      };
      const onEnd = () => {
        cleanup();
        controller.close();
      };
      const onError = (error: Error) => {
        cleanup();
        controller.error(error);
      };
      cleanup = () => {
        input.off('data', onData);
        input.off('end', onEnd);
        input.off('error', onError);
      };
      input.on('data', onData);
      input.once('end', onEnd);
      input.once('error', onError);
    },
    pull: () => {
      input.resume();
    },
    cancel: reason => {
      cleanup();
      input.destroy(reason instanceof Error ? reason : undefined);
    },
  });
};

// Bridges the ACP connection's outgoing ndjson writes into an Effect Queue that
// a forked fiber drains into the child's stdin Sink. A bounded queue keeps the
// child's stdin backpressure visible to the ACP writer, and shutting the queue
// down on close/abort ends the stdin stream (EOF) for the child.
const writableStreamFromQueue = (queue: Queue.Queue<Uint8Array>): WritableStream<Uint8Array> =>
  new WritableStream<Uint8Array>({
    write: chunk => Effect.runPromise(Effect.asVoid(Queue.offer(queue, chunk))),
    close: () => Effect.runPromise(Queue.shutdown(queue)),
    abort: () => Effect.runPromise(Queue.shutdown(queue)),
  });

/**
 * The ACP adapter assets are the lazy tier of the companion install: `composio
 * run` no longer requires them at startup, so this is the first place that can
 * observe them missing. When a packaged install has lost them, say so with the
 * fix instead of silently falling through to an npx download or a 404 from the
 * startup repair path.
 */
export class MissingAcpAdapterAssetsError extends Data.TaggedError(
  'services/MissingAcpAdapterAssetsError'
)<{
  readonly message: string;
  readonly target: InvokeAgentTarget;
  readonly missingRelativePaths: ReadonlyArray<string>;
  readonly installDirectory: string;
}> {
  // The error crosses into the user's script as a rejection, so it reports its
  // own name rather than the internal `services/`-prefixed tag.
  override readonly name = 'MissingAcpAdapterAssetsError';
}

type ShippedAdapterAsset = {
  /** Absolute path to the adapter shipped with this install, when present. */
  readonly resolvedPath: string | null;
  /**
   * Asset paths a complete install ships for this target on this host, relative
   * to the install root. Empty when this platform has no shipped adapter at all
   * (no codex-acp binary is built for it), which is not a broken install.
   */
  readonly expectedRelativePaths: ReadonlyArray<string>;
};

const resolveShippedAdapterAsset = ({
  target,
  execPath,
}: {
  target: InvokeAgentTarget;
  execPath: string;
}): Effect.Effect<ShippedAdapterAsset, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    if (target === 'claude') {
      return {
        resolvedPath: yield* resolveRunCompanionAssetPath({
          callerImportMetaUrl: import.meta.url,
          execPath,
          relativePathFromRoot: 'acp-adapters/claude-code-acp.mjs',
        }),
        // cli.js has no separate resolution step: the bundled adapter finds it
        // through import.meta.url, so name it as part of the requirement.
        expectedRelativePaths: RUN_COMPANION_SHARED_STATIC_ASSET_RELATIVE_PATHS,
      };
    }

    const binaryTarget = codexAcpBinaryTargetFor({
      platform: process.platform,
      arch: process.arch,
    });
    if (!binaryTarget) {
      return { resolvedPath: null, expectedRelativePaths: [] };
    }

    return {
      // Reject a zero-byte placeholder: a foreign-platform slot in the archive
      // can never execute, so treat it as absent and fall through.
      resolvedPath: yield* resolveRunCompanionAssetPath({
        callerImportMetaUrl: import.meta.url,
        execPath,
        relativePathFromRoot: binaryTarget.relativePath,
        requireNonEmpty: true,
      }),
      expectedRelativePaths: [binaryTarget.relativePath],
    };
  });

const missingAcpAdapterAssetsError = ({
  target,
  installDirectory,
  missingRelativePaths,
}: {
  target: InvokeAgentTarget;
  installDirectory: string;
  missingRelativePaths: ReadonlyArray<string>;
}) =>
  new MissingAcpAdapterAssetsError({
    target,
    installDirectory,
    missingRelativePaths,
    message: [
      `This Composio install cannot run a ${target} sub-agent: the ACP adapter files are missing from ${installDirectory}.`,
      ...missingRelativePaths.map(relativePath => `  - ${relativePath}`),
      `Run 'composio upgrade' to restore them, or reinstall the CLI.`,
    ].join('\n'),
  });

const resolveInstalledAdapter = (target: InvokeAgentTarget): string | null => {
  const specifier =
    target === 'claude'
      ? '@zed-industries/claude-code-acp/dist/index.js'
      : '@zed-industries/codex-acp/bin/codex-acp.js';
  const require = createRequire(import.meta.url);
  return Option.getOrNull(Option.liftThrowable(() => require.resolve(specifier))());
};

export const resolveAcpAdapterCommand = (
  target: InvokeAgentTarget,
  { execPath = process.execPath }: { readonly execPath?: string } = {}
): Effect.Effect<
  AcpAdapterCommand,
  MissingAcpAdapterAssetsError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const binary = target === 'claude' ? 'claude-code-acp' : 'codex-acp';
    const packageName =
      target === 'claude' ? '@zed-industries/claude-code-acp' : '@zed-industries/codex-acp';

    // 1. Prefer shipped companion assets next to the CLI binary / dist bundle.
    const shipped = yield* resolveShippedAdapterAsset({ target, execPath });
    if (shipped.resolvedPath) {
      if (target === 'codex') {
        return {
          cmd: [shipped.resolvedPath],
          source: 'shipped',
        } satisfies AcpAdapterCommand;
      }

      return {
        cmd: [execPath, shipped.resolvedPath],
        env: {
          BUN_BE_BUN: '1',
        },
        source: 'shipped',
      } satisfies AcpAdapterCommand;
    }

    // A packaged install ships both the companion wrappers and the adapters. If
    // the wrappers are there and the adapters are not, the install is damaged —
    // report the repair instead of quietly downloading an adapter through npx.
    // A source checkout has no wrappers next to `bun`, so it keeps falling back.
    if (
      shipped.expectedRelativePaths.length > 0 &&
      (yield* hasInstalledRunCompanionModules(execPath))
    ) {
      return yield* missingAcpAdapterAssetsError({
        target,
        installDirectory: path.dirname(execPath),
        missingRelativePaths: shipped.expectedRelativePaths,
      });
    }

    // 2. Try the installed dependency bundle next (no npx overhead).
    const bundled = resolveInstalledAdapter(target);
    if (bundled) {
      return {
        cmd: [execPath, bundled],
        env: {
          BUN_BE_BUN: '1',
        },
        source: 'bundled',
      } satisfies AcpAdapterCommand;
    }

    // 3. Check if the binary is on PATH.
    if (typeof Bun !== 'undefined' && typeof Bun.which === 'function') {
      const resolved = Bun.which(binary);
      if (resolved) {
        return {
          cmd: [resolved],
          source: 'which',
        } satisfies AcpAdapterCommand;
      }
    }

    // 4. Fall back to npx.
    return {
      cmd: [process.platform === 'win32' ? 'npx.cmd' : 'npx', '-y', packageName],
      source: 'npx',
    } satisfies AcpAdapterCommand;
  });

const chunkFlushPattern = /[\s,.;:!?)\]}"]$/;
const resolveStructuredOutputMcpModulePath = resolveRunCompanionModulePath({
  callerImportMetaUrl: import.meta.url,
  execPath: process.execPath,
  relativeNoExtensionFromCaller: './run-subagent-output-mcp',
});

const collectToolCallPaths = (
  value: unknown,
  results: Set<string>,
  pathApi: Path.Path,
  homedir: string,
  parentKey?: string
): void => {
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
      for (const candidatePath of extractPathsFromCommandText(value, pathApi, homedir)) {
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
      collectToolCallPaths(entry, results, pathApi, homedir);
    }
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    collectToolCallPaths(nestedValue, results, pathApi, homedir, key);
  }
};

const extractPathsFromCommandText = (
  command: string,
  pathApi: Path.Path,
  homedir: string
): ReadonlyArray<string> => {
  const results = new Set<string>();
  const matches = command.matchAll(/(^|[\s"'`])((?:~\/|\/)[^\s"'`|&;<>]+)/g);
  for (const match of matches) {
    const rawPath = match[2]?.trim();
    if (!rawPath) {
      continue;
    }

    results.add(rawPath.startsWith('~/') ? pathApi.join(homedir, rawPath.slice(2)) : rawPath);
  }

  return [...results];
};

const extractToolCallPaths = (
  toolCall: Pick<acp.RequestPermissionRequest, 'toolCall'>['toolCall'],
  pathApi: Path.Path,
  homedir: string
): ReadonlyArray<string> => {
  const paths = new Set<string>();
  for (const location of toolCall.locations ?? []) {
    if (typeof location.path === 'string' && location.path.length > 0) {
      paths.add(location.path);
    }
  }

  collectToolCallPaths(toolCall.rawInput, paths, pathApi, homedir);
  if (typeof toolCall.title === 'string') {
    for (const candidatePath of extractPathsFromCommandText(toolCall.title, pathApi, homedir)) {
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
    private readonly allowedReadRoots: ReadonlyArray<string>,
    private readonly pathApi: Path.Path,
    private readonly homedir: string
  ) {
    this.messageLogger = new BufferedChunkLogger('subAgent.acp.message', helperDebugLog);
    this.thoughtLogger = new BufferedChunkLogger('subAgent.acp.thought', helperDebugLog);
  }

  async requestPermission(
    params: acp.RequestPermissionRequest
  ): Promise<acp.RequestPermissionResponse> {
    const requestedPaths = extractToolCallPaths(params.toolCall, this.pathApi, this.homedir);
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
  readonly cleanup: Effect.Effect<void>;
};

export const createStructuredOutputMcpContext = ({
  options,
  helperDebugLog,
}: {
  options: InvokeAgentNormalizedOptions;
  helperDebugLog: HelperDebugLog;
}): Effect.Effect<StructuredOutputMcpContext | null, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const structuredSchema = options.structuredSchema;
    if (!structuredSchema) {
      return null;
    }

    const fs = yield* FileSystem.FileSystem;
    const pathApi = yield* Path.Path;
    const structuredOutputMcpModulePath = yield* resolveStructuredOutputMcpModulePath;

    const build = Effect.gen(function* () {
      // Keep this on an OS temp dir for now. Repointing MCP schema/result files into
      // session artifacts needs a broader bundling + run-companion test pass so we
      // don't break structured sub-agent output in packaged CLI builds.
      const tempDirectory = yield* fs.makeTempDirectory({
        prefix: 'composio-subagent-output-mcp-',
      });
      const removeTempDirectory = Effect.ignore(
        fs.remove(tempDirectory, { recursive: true, force: true })
      );
      const schemaFilePath = pathApi.join(tempDirectory, 'schema.json');
      const resultFilePath = pathApi.join(tempDirectory, 'result.json');
      yield* Effect.try({
        try: () => JSON.stringify(structuredSchema),
        catch: error => error,
      }).pipe(
        Effect.flatMap(schemaJson => fs.writeFileString(schemaFilePath, schemaJson)),
        Effect.tapError(() => removeTempDirectory)
      );

      helperDebugLog('subAgent.acp.structured_output_tool', {
        modulePath: structuredOutputMcpModulePath,
        schemaFilePath,
        resultFilePath,
      });

      const context: StructuredOutputMcpContext = {
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
        cleanup: removeTempDirectory,
      };
      return context;
    });

    return yield* build.pipe(
      Effect.catchAll(error =>
        Effect.sync(() => {
          helperDebugLog('subAgent.acp.structured_output_tool_failed', {
            error: error instanceof Error ? error.message : String(error),
            modulePath: structuredOutputMcpModulePath,
          });
          return null;
        })
      )
    );
  });

const maybeReadStructuredOutputFromTool = ({
  context,
  options,
  helperDebugLog,
}: {
  context: StructuredOutputMcpContext | null;
  options: InvokeAgentNormalizedOptions;
  helperDebugLog: HelperDebugLog;
}): Effect.Effect<unknown, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const structuredSchema = options.structuredSchema;
    if (!context || !structuredSchema) {
      return undefined;
    }

    const fs = yield* FileSystem.FileSystem;
    const resultFileExists = yield* fs
      .exists(context.resultFilePath)
      .pipe(Effect.orElseSucceed(() => false));
    if (!resultFileExists) {
      return undefined;
    }

    const read = fs.readFileString(context.resultFilePath).pipe(
      Effect.flatMap(rawText =>
        Effect.try({
          try: () => {
            const rawPayload: unknown = JSON.parse(rawText);
            const parsed = unwrapStructuredOutputToolPayload(rawPayload, structuredSchema);
            helperDebugLog('subAgent.acp.structured_output_tool_result', {
              resultFilePath: context.resultFilePath,
            });
            return validateStructuredOutput(parsed, options);
          },
          catch: error => error,
        })
      )
    );

    return yield* read.pipe(
      Effect.catchAll(error =>
        Effect.sync<unknown>(() => {
          helperDebugLog('subAgent.acp.structured_output_tool_result_failed', {
            resultFilePath: context.resultFilePath,
            error: error instanceof Error ? error.message : String(error),
          });
          return undefined;
        })
      )
    );
  });

type InvokeAcpSubAgentParams = {
  prompt: string;
  options: InvokeAgentNormalizedOptions;
  master: MasterKind;
  target: InvokeAgentTarget;
  allowedReadRoots: ReadonlyArray<string>;
  helperDebugLog: HelperDebugLog;
};

// Turns the accumulated agent text into the final response, retrying once with
// a structured-repair prompt when a structured schema was requested and the
// first finalize attempt failed. Non-structured failures propagate unchanged.
const finalizeWithStructuredRepair = ({
  client,
  options,
  master,
  target,
  structuredOutputMcp,
  helperDebugLog,
  runPrompt,
  stderrSuffix,
}: {
  client: RunSubAgentClient;
  options: InvokeAgentNormalizedOptions;
  master: MasterKind;
  target: InvokeAgentTarget;
  structuredOutputMcp: StructuredOutputMcpContext | null;
  helperDebugLog: HelperDebugLog;
  runPrompt: (text: string) => Effect.Effect<acp.PromptResponse, AcpInvokeError>;
  stderrSuffix: () => string;
}): Effect.Effect<InvokeAgentResponse, unknown, FileSystem.FileSystem> => {
  const finalizeText = Effect.try({
    try: () => finalizeInvokeAgentText(client.getText(), options),
    catch: error => error,
  });

  return finalizeText.pipe(
    Effect.map(payload => toInvokeAgentResponse(master, target, payload)),
    Effect.catchAll(error => {
      const structuredSchema = options.structuredSchema;
      if (!structuredSchema) {
        return Effect.fail(error);
      }

      return Effect.gen(function* () {
        helperDebugLog('subAgent.acp.structured_repair', {
          target,
          reason: error instanceof Error ? error.message : String(error),
        });

        const repairResponse = yield* runPrompt(
          buildStructuredRepairPrompt(
            structuredSchema,
            structuredOutputMcp ? ACP_STRUCTURED_OUTPUT_TOOL_NAME : undefined
          )
        );

        if (repairResponse.stopReason === 'cancelled') {
          return yield* Effect.fail(
            createFallbackError(
              'prompt_failed',
              `${target} ACP repair prompt was cancelled${stderrSuffix()}`
            )
          );
        }

        const repairedStructuredOutput = yield* maybeReadStructuredOutputFromTool({
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

        const payload = yield* finalizeText;
        return toInvokeAgentResponse(master, target, payload);
      });
    })
  );
};

const invokeAcpSubAgentEffect = ({
  prompt,
  options,
  master,
  target,
  allowedReadRoots,
  helperDebugLog,
}: InvokeAcpSubAgentParams) =>
  Effect.gen(function* () {
    const pathApi = yield* Path.Path;
    const nodeOs = yield* NodeOs;

    const structuredOutputMcp = yield* createStructuredOutputMcpContext({
      options,
      helperDebugLog,
    });
    yield* Effect.addFinalizer(() =>
      structuredOutputMcp ? structuredOutputMcp.cleanup : Effect.void
    );

    const resolved = yield* resolveAcpAdapterCommand(target);
    helperDebugLog('subAgent.acp.resolve', {
      target,
      source: resolved.source,
      command: resolved.cmd[0],
      args: resolved.cmd.slice(1),
    });

    // The Claude Code CLI refuses to start when it inherits CLAUDECODE=1. The
    // platform Command executor inherits the parent environment, so the
    // variable cannot be dropped; mask it with an empty string instead —
    // falsy and distinct from the guarded "1" — only when the parent has it set.
    const claudeCode = yield* Config.option(Config.string('CLAUDECODE'));
    const childEnv: Record<string, string> = {
      ...(Option.isSome(claudeCode) ? { CLAUDECODE: '' } : {}),
      ...(resolved.env ?? {}),
    };

    const stdinQueue = yield* Queue.bounded<Uint8Array>(16);
    const [executable, ...commandArgs] = resolved.cmd;
    const command = Command.make(executable, ...commandArgs).pipe(Command.env(childEnv));

    const child = yield* Command.start(command).pipe(
      Effect.mapError(error =>
        createFallbackError('spawn_failed', `Failed to spawn ${target} ACP adapter.`, error)
      )
    );

    // Teardown parity with the previous finally block: SIGTERM the child, wait
    // for it to exit for at most 200ms, then SIGKILL it if it is still alive.
    // Registered after Command.start so it runs before the executor's own
    // scope finalizer (which would otherwise await a stubborn child forever).
    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        yield* Effect.interruptible(child.kill('SIGTERM')).pipe(
          Effect.timeout('200 millis'),
          Effect.ignore
        );
        const stillRunning = yield* child.isRunning.pipe(Effect.orElseSucceed(() => false));
        if (stillRunning) {
          yield* Effect.ignore(child.kill('SIGKILL'));
        }
      })
    );

    let stderrText = '';
    yield* Stream.runForEach(Stream.decodeText(child.stderr), text =>
      Effect.sync(() => {
        stderrText += text;
      })
    ).pipe(Effect.ignore, Effect.forkScoped);
    const stderrSuffix = () => (stderrText.trim() ? `: ${stderrText.trim()}` : '');

    yield* Stream.run(Stream.fromQueue(stdinQueue), child.stdin).pipe(
      Effect.ignore,
      Effect.forkScoped
    );

    const client = new RunSubAgentClient(
      helperDebugLog,
      [...new Set(allowedReadRoots.map(root => pathApi.resolve(root)))],
      pathApi,
      nodeOs.homedir
    );
    const stream = acp.ndJsonStream(
      writableStreamFromQueue(stdinQueue),
      Stream.toReadableStream(child.stdout)
    );
    const connection = new acp.ClientSideConnection(() => client, stream);

    const initialized = yield* Effect.tryPromise({
      try: () =>
        connection.initialize({
          protocolVersion: acp.PROTOCOL_VERSION,
          clientCapabilities: {},
        }),
      catch: error =>
        createFallbackError(
          'initialize_failed',
          `${target} ACP initialize failed${stderrSuffix()}`,
          error
        ),
    });

    helperDebugLog('subAgent.acp.initialized', {
      target,
      protocolVersion: initialized.protocolVersion,
    });

    const session = yield* Effect.tryPromise({
      try: () =>
        connection.newSession({
          cwd: process.cwd(),
          mcpServers: structuredOutputMcp ? [structuredOutputMcp.mcpServer] : [],
        }),
      catch: error =>
        createFallbackError(
          'session_failed',
          `${target} ACP session creation failed${stderrSuffix()}`,
          error
        ),
    });

    helperDebugLog('subAgent.acp.session', {
      target,
      sessionId: session.sessionId,
    });

    if (typeof options.model === 'string' && options.model.trim().length > 0) {
      const model = options.model.trim();
      const setSessionModel = getLegacySetSessionModel(connection);
      const modelFailure =
        setSessionModel === undefined
          ? 'ACP session model selection is not supported by this connection'
          : yield* Effect.tryPromise({
              try: () => setSessionModel({ sessionId: session.sessionId, modelId: model }),
              catch: error => (error instanceof Error ? error.message : String(error)),
            }).pipe(
              Effect.match({
                onSuccess: (): string | undefined => undefined,
                onFailure: message => message,
              })
            );

      helperDebugLog('subAgent.acp.model', {
        target,
        model,
        ...(modelFailure === undefined
          ? { applied: true }
          : { applied: false, error: modelFailure }),
      });
    }

    const promptText =
      options.structuredSchema && structuredOutputMcp
        ? buildStructuredToolPrompt(
            prompt,
            options.structuredSchema,
            ACP_STRUCTURED_OUTPUT_TOOL_NAME
          )
        : buildStructuredPrompt(prompt, options.structuredSchema);
    const runPrompt = (text: string) =>
      Effect.tryPromise({
        try: () =>
          connection.prompt({
            sessionId: session.sessionId,
            prompt: [{ type: 'text', text }],
          }),
        catch: error =>
          connection.signal.aborted
            ? createFallbackError(
                'connection_closed',
                `${target} ACP connection closed before prompt completion${stderrSuffix()}`,
                error
              )
            : createFallbackError(
                'prompt_failed',
                `${target} ACP prompt failed${stderrSuffix()}`,
                error
              ),
      });

    const response = yield* runPrompt(promptText);

    if (response.stopReason === 'cancelled') {
      return yield* Effect.fail(
        createFallbackError('prompt_failed', `${target} ACP prompt was cancelled${stderrSuffix()}`)
      );
    }

    const structuredOutput = yield* maybeReadStructuredOutputFromTool({
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

    return yield* finalizeWithStructuredRepair({
      client,
      options,
      master,
      target,
      structuredOutputMcp,
      helperDebugLog,
      runPrompt,
      stderrSuffix,
    });
  });

export const invokeAcpSubAgent = async (
  params: InvokeAcpSubAgentParams
): Promise<InvokeAgentResponse> => {
  const exit = await Effect.runPromiseExit(
    invokeAcpSubAgentEffect(params).pipe(Effect.scoped, Effect.provide(RunSubAgentAcpLive))
  );
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  // Surface the original error instance (callers branch on AcpInvokeError and
  // its code), not a FiberFailure wrapper.
  throw Cause.squash(exit.cause);
};
