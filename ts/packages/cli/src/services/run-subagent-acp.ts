import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { Readable, Writable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';
import type { MasterKind } from 'src/services/master-detector';
import {
  AcpInvokeError,
  buildStructuredPrompt,
  finalizeInvokeAgentText,
  toInvokeAgentResponse,
  type HelperDebugLog,
  type InvokeAgentNormalizedOptions,
  type InvokeAgentResponse,
  type InvokeAgentTarget,
} from 'src/services/run-subagent-shared';

const resolveBundledAdapter = (target: InvokeAgentTarget): string | null => {
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
  readonly source: 'bundled' | 'which' | 'npx';
} => {
  const binary = target === 'claude' ? 'claude-code-acp' : 'codex-acp';
  const packageName =
    target === 'claude' ? '@zed-industries/claude-code-acp' : '@zed-industries/codex-acp';

  // 1. Try the bundled dependency first (no npx overhead)
  const bundled = resolveBundledAdapter(target);
  if (bundled) {
    return {
      cmd: [process.execPath, bundled],
      source: 'bundled',
    };
  }

  // 2. Check if the binary is on PATH
  if (typeof Bun !== 'undefined' && typeof Bun.which === 'function') {
    const resolved = Bun.which(binary);
    if (resolved) {
      return {
        cmd: [resolved],
        source: 'which',
      };
    }
  }

  // 3. Fall back to npx
  return {
    cmd: [process.platform === 'win32' ? 'npx.cmd' : 'npx', '-y', packageName],
    source: 'npx',
  };
};

class RunSubAgentClient {
  private readonly textChunks: string[] = [];

  constructor(private readonly helperDebugLog: HelperDebugLog) {}

  async requestPermission(
    params: acp.RequestPermissionRequest
  ): Promise<acp.RequestPermissionResponse> {
    this.helperDebugLog('subAgent.acp.permission', {
      toolCallId: params.toolCall.toolCallId,
      options: params.options.map(option => option.kind),
    });

    const rejectOption =
      params.options.find(option => option.kind === 'reject_once') ??
      params.options.find(option => option.kind === 'reject_always');

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
  }

  async sessionUpdate(params: acp.SessionNotification): Promise<void> {
    const update = params.update;
    if (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text') {
      this.textChunks.push(update.content.text);
      return;
    }

    this.helperDebugLog('subAgent.acp.update', {
      type: update.sessionUpdate,
    });
  }

  getText(): string {
    return this.textChunks.join('');
  }
}

const createFallbackError = (
  code: ConstructorParameters<typeof AcpInvokeError>[0],
  message: string,
  cause?: unknown
): AcpInvokeError => new AcpInvokeError(code, message, cause === undefined ? undefined : { cause });

export const invokeAcpSubAgent = async ({
  prompt,
  options,
  master,
  target,
  helperDebugLog,
}: {
  prompt: string;
  options: InvokeAgentNormalizedOptions;
  master: MasterKind;
  target: InvokeAgentTarget;
  helperDebugLog: HelperDebugLog;
}): Promise<InvokeAgentResponse> => {
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
    env: childEnv,
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

  const client = new RunSubAgentClient(helperDebugLog);
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
        mcpServers: [],
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

    const promptText = buildStructuredPrompt(prompt, options.structuredSchema);
    const response = await connection
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

    if (response.stopReason === 'cancelled') {
      throw new Error(`${target} ACP prompt was cancelled.`);
    }

    const payload = finalizeInvokeAgentText(client.getText(), options);
    return toInvokeAgentResponse(master, target, payload);
  } finally {
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
