import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import type { MasterKind } from 'src/services/master-detector';
import {
  finalizeInvokeAgentText,
  parseJson,
  toInvokeAgentResponse,
  type HelperDebugLog,
  type InvokeAgentNormalizedOptions,
  type InvokeAgentResponse,
  type InvokeAgentTarget,
} from 'src/services/run-subagent-shared';

const runExternalCommandText = async (
  cmd: ReadonlyArray<string>,
  helperDebugLog: HelperDebugLog
) => {
  helperDebugLog('agent.spawn', { command: cmd[0], args: cmd.slice(1) });

  const child = spawn(cmd[0]!, cmd.slice(1), {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data', chunk => stdoutChunks.push(chunk));
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', chunk => stderrChunks.push(chunk));

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => resolve(code ?? 0));
  });

  const stdout = stdoutChunks.join('');
  const stderr = stderrChunks.join('');

  if (exitCode !== 0) {
    const details = stderr.trim() || stdout.trim();
    const suffix = details ? `: ${details}` : '';
    helperDebugLog('agent.error', {
      command: cmd[0],
      exitCode,
      stderr: stderr.trim() || undefined,
    });
    throw new Error(`${cmd[0]} failed with exit code ${exitCode}${suffix}`);
  }

  helperDebugLog('agent.done', {
    command: cmd[0],
    exitCode,
    stdoutBytes: stdout.length,
    stderrBytes: stderr.length,
  });
  return { stdout, stderr, exitCode };
};

const invokeClaudeLegacy = async (
  prompt: string,
  options: InvokeAgentNormalizedOptions,
  master: MasterKind,
  helperDebugLog: HelperDebugLog
): Promise<InvokeAgentResponse> => {
  helperDebugLog('subAgent.prepare', {
    target: 'claude',
    transport: 'legacy',
    hasSchema: options.structuredSchema !== undefined,
  });

  const args = ['claude', '--bare', '-p', '--output-format', 'json'];
  if (typeof options.model === 'string' && options.model.trim().length > 0) {
    args.push('--model', options.model.trim());
  }
  if (options.structuredSchema !== undefined) {
    args.push('--json-schema', JSON.stringify(options.structuredSchema));
  }
  args.push(prompt);

  const result = await runExternalCommandText(args, helperDebugLog);
  const parsed = parseJson(result.stdout.trim());
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('claude returned non-JSON output in subAgent().');
  }

  const payload =
    options.structuredSchema !== undefined
      ? {
          result: null,
          structuredOutput: (parsed as { structured_output?: unknown }).structured_output ?? null,
        }
      : {
          result:
            typeof (parsed as { result?: unknown }).result === 'string'
              ? (parsed as { result: string }).result
              : null,
          structuredOutput: null,
        };

  return toInvokeAgentResponse(master, 'claude', payload);
};

const invokeCodexLegacy = async (
  prompt: string,
  options: InvokeAgentNormalizedOptions,
  master: MasterKind,
  helperDebugLog: HelperDebugLog
): Promise<InvokeAgentResponse> => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-invoke-agent-'));
  const outputPath = path.join(tempDir, 'last-message.txt');
  const args = [
    'codex',
    'exec',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '-o',
    outputPath,
  ];

  try {
    helperDebugLog('subAgent.prepare', {
      target: 'codex',
      transport: 'legacy',
      hasSchema: options.structuredSchema !== undefined,
    });

    if (typeof options.model === 'string' && options.model.trim().length > 0) {
      args.push('--model', options.model.trim());
    }

    if (options.structuredSchema !== undefined) {
      const schemaPath = path.join(tempDir, 'schema.json');
      fs.writeFileSync(schemaPath, JSON.stringify(options.structuredSchema), 'utf8');
      args.push('--output-schema', schemaPath);
    }

    args.push(prompt);
    await runExternalCommandText(args, helperDebugLog);

    const text = fs.readFileSync(outputPath, 'utf8').trim();
    if (options.structuredSchema !== undefined) {
      return toInvokeAgentResponse(master, 'codex', {
        result: null,
        structuredOutput: parseJson(text) ?? null,
      });
    }

    return toInvokeAgentResponse(master, 'codex', {
      result: text,
      structuredOutput: null,
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

export const invokeLegacySubAgent = async ({
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
  if (target === 'claude') {
    return invokeClaudeLegacy(prompt, options, master, helperDebugLog);
  }

  return invokeCodexLegacy(prompt, options, master, helperDebugLog);
};
