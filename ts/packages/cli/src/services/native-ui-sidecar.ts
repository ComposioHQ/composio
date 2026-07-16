import { execFileSync, spawn } from 'node:child_process';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Config, ConfigProvider, Effect, Option, Predicate, Schema } from 'effect';
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

const hasEnvPrefix = (env: NodeJS.ProcessEnv, prefix: string): boolean =>
  Object.keys(env).some(key => key.startsWith(prefix));

const FALSY_ENV_FLAG_VALUES: ReadonlyArray<string> = ['0', 'false', 'no', 'off'];

// Any other non-empty value counts as set (`CI=woohoo` still disables the UI)
// rather than failing config decoding the way `Config.boolean` would.
const EnvFlagFromString = Schema.transform(
  Schema.compose(Schema.Trim, Schema.Lowercase),
  Schema.Boolean,
  {
    decode: value => !FALSY_ENV_FLAG_VALUES.includes(value),
    encode: enabled => (enabled ? '1' : '0'),
    strict: true,
  }
);
const decodeEnvFlag = Schema.decodeOption(EnvFlagFromString);

// None when the variable is unset or blank, so callers can distinguish
// "not configured" from an explicit true/false.
const envFlag = (name: string): Config.Config<Option.Option<boolean>> =>
  Config.string(name).pipe(
    Config.map(value => value.trim()),
    Config.option,
    Config.map(Option.filter(value => value.length > 0)),
    Config.map(Option.flatMap(decodeEnvFlag))
  );

/**
 * Interactive permission UI (the native sidecar dialog and the browser
 * approval page) must never spawn from automated environments. The explicit
 * COMPOSIO_DISABLE_PERMISSION_UI knob wins in both directions; without it,
 * CI and Vitest runs disable the UI.
 */
export const interactivePermissionUiDisabledConfig: Config.Config<boolean> = Config.all({
  explicit: envFlag('COMPOSIO_DISABLE_PERMISSION_UI'),
  ci: envFlag('CI'),
  vitest: envFlag('VITEST'),
}).pipe(
  Config.map(({ explicit, ci, vitest }) =>
    Option.getOrElse(
      explicit,
      () => Option.getOrElse(ci, () => false) || Option.getOrElse(vitest, () => false)
    )
  )
);

// CI / VITEST / COMPOSIO_DISABLE_PERMISSION_UI are read verbatim, so load them
// through a raw env provider rather than the CLI's COMPOSIO_-prefixed one.
const environmentProvider = ConfigProvider.fromEnv();

export const isInteractivePermissionUiDisabled: Effect.Effect<boolean> = environmentProvider
  .load(interactivePermissionUiDisabledConfig)
  .pipe(Effect.orDie);

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

const NativeUiDecisionPayloadSchema = Schema.parseJson(Schema.Struct({ decision: Schema.String }));

const parseDecisionPayload = (raw: string): NativeUiPermissionDecision | undefined => {
  const decision = Option.getOrUndefined(
    Schema.decodeUnknownOption(NativeUiDecisionPayloadSchema)(raw)
  )?.decision;
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
  if (await Effect.runPromise(isInteractivePermissionUiDisabled)) return undefined;

  const resolved = resolveNativeUiBinary();
  if (!Predicate.isTagged(resolved, 'found')) return undefined;

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
        'Approve once, allow for 1 hour, or deny.',
        '--allow-session-label',
        'Allow for 1 hr',
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
