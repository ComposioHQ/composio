import { execFileSync, spawn } from 'node:child_process';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  detectCliPlatform,
  ensureBundledBinaryExecutable,
  getLocalToolsBundleRootCandidates,
} from '@composio/cli-local-tools';

const NATIVE_UI_BINARY_NAME = 'composio-native-ui';

export type NativeUiPermissionDecision = 'allow_once' | 'allow_session' | 'deny' | 'dismissed';
export type NativeUiCallerAgent = 'claude' | 'codex' | 'openclaw' | 'composio';

export type NativeUiBinaryResolution =
  | {
      readonly _tag: 'found';
      readonly binaryPath: string;
    }
  | {
      readonly _tag: 'missing';
      readonly platform: string;
      readonly candidates: ReadonlyArray<string>;
    }
  | {
      readonly _tag: 'unsupported';
      readonly platform: string;
    };

interface NativeUiDecisionPayload {
  readonly decision?: NativeUiPermissionDecision;
}

const hasEnvPrefix = (env: NodeJS.ProcessEnv, prefix: string): boolean =>
  Object.keys(env).some(key => key.startsWith(prefix));

const normalizeCallerAgent = (value?: string): NativeUiCallerAgent | undefined => {
  const normalized = value?.toLowerCase().replace(/[^a-z]/g, '');
  if (normalized === 'claude' || normalized === 'codex' || normalized === 'openclaw') {
    return normalized;
  }
  return undefined;
};

const detectCallerAgentFromProcessTree = (): NativeUiCallerAgent | undefined => {
  if (process.platform === 'win32') return undefined;

  let pid = process.ppid;
  for (let depth = 0; depth < 8 && pid > 1; depth += 1) {
    try {
      const output = execFileSync('ps', ['-o', 'ppid=', '-o', 'comm=', '-p', String(pid)], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (!output) return undefined;

      const match = output.match(/^(\d+)\s+(.+)$/);
      if (!match) return undefined;

      const command = match[2]?.toLowerCase() ?? '';
      if (command.includes('openclaw') || command.includes('open-claw')) return 'openclaw';
      if (command.includes('claude')) return 'claude';
      if (command.includes('codex')) return 'codex';

      pid = Number(match[1]);
    } catch {
      return undefined;
    }
  }

  return undefined;
};

export const detectNativeUiCallerAgent = (
  env: NodeJS.ProcessEnv = process.env
): NativeUiCallerAgent => {
  const explicit = normalizeCallerAgent(env.COMPOSIO_CALLER_AGENT ?? env.COMPOSIO_AGENT);
  if (explicit) return explicit;

  if (hasEnvPrefix(env, 'OPENCLAW_')) return 'openclaw';
  if (hasEnvPrefix(env, 'CLAUDE_')) return 'claude';
  if (hasEnvPrefix(env, 'CODEX_')) return 'codex';

  return detectCallerAgentFromProcessTree() ?? 'composio';
};

export const resolveNativeUiBinary = (): NativeUiBinaryResolution => {
  const platform = detectCliPlatform();
  if (!platform.startsWith('darwin-')) {
    return {
      _tag: 'unsupported',
      platform,
    };
  }

  const candidates = getLocalToolsBundleRootCandidates().map(root =>
    path.join(root, NATIVE_UI_BINARY_NAME, platform, NATIVE_UI_BINARY_NAME)
  );
  const binaryPath = candidates.find(candidate => fsSync.existsSync(candidate));

  return binaryPath
    ? {
        _tag: 'found',
        binaryPath,
      }
    : {
        _tag: 'missing',
        platform,
        candidates,
      };
};

const parseDecisionPayload = (raw: string): NativeUiPermissionDecision | undefined => {
  const payload = JSON.parse(raw) as NativeUiDecisionPayload;
  const decision = payload.decision;
  return decision === 'allow_once' ||
    decision === 'allow_session' ||
    decision === 'deny' ||
    decision === 'dismissed'
    ? decision
    : undefined;
};

export const requestNativeUiPermissionDecision = async (params: {
  readonly toolSlug: string;
  readonly accountLabel?: string;
  readonly timeoutSeconds?: number;
}): Promise<NativeUiPermissionDecision | undefined> => {
  const resolved = resolveNativeUiBinary();
  if (resolved._tag !== 'found') return undefined;

  await ensureBundledBinaryExecutable(resolved.binaryPath);

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'composio-native-ui-decision-'));
  const callbackFile = path.join(tempDir, 'decision.json');
  const timeoutSeconds = params.timeoutSeconds ?? 30;

  try {
    return await new Promise<NativeUiPermissionDecision>((resolve, reject) => {
      const args = [
        '--tool',
        params.toolSlug,
        '--account',
        params.accountLabel ?? 'default connection',
        '--caller-agent',
        detectNativeUiCallerAgent(),
        '--subtitle',
        'Composio CLI is requesting permission to execute this tool.',
        '--callback-file',
        callbackFile,
        '--timeout',
        String(timeoutSeconds),
      ];

      const child = spawn(resolved.binaryPath, args, {
        detached: false,
        stdio: 'ignore',
      });

      const timeout = setTimeout(
        () => {
          child.kill();
          resolve('dismissed');
        },
        (timeoutSeconds + 5) * 1000
      );

      child.on('error', error => {
        clearTimeout(timeout);
        reject(error);
      });

      child.on('exit', async code => {
        clearTimeout(timeout);
        try {
          const raw = await fs.readFile(callbackFile, 'utf8');
          const decision = parseDecisionPayload(raw);
          if (decision) {
            resolve(decision);
            return;
          }
        } catch {
          // If the sidecar exits without writing a callback file, treat a non-zero
          // exit as a dismissal. A zero exit without a callback is unexpected.
        }

        if (code === 0) {
          reject(new Error('Native permission prompt exited without a decision.'));
        } else {
          resolve('dismissed');
        }
      });
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};
