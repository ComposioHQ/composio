import * as BunServices from '@effect/platform-bun/BunServices';
import { Config, Effect, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
import { UNPREFIXED_CONFIG } from 'src/effects/app-config';
import { loadHostConfig } from 'src/services/config';

export type PermissionCallerAgent = 'claude' | 'codex' | 'openclaw' | 'composio';

/**
 * The browser approval page must never open from automated environments. The
 * explicit COMPOSIO_DISABLE_PERMISSION_UI knob wins in both directions; without
 * it, CI and Vitest runs disable the UI.
 */
export const interactivePermissionUiDisabledConfig =
  UNPREFIXED_CONFIG.INTERACTIVE_PERMISSION_UI_DISABLED;

export const isInteractivePermissionUiDisabled: Effect.Effect<boolean> = loadHostConfig(
  interactivePermissionUiDisabledConfig
);

// Enhanced controls are not offered on Intel Macs (#3421).
export const isEnhancedControlsPlatformSupported = (): boolean =>
  !(process.platform === 'darwin' && process.arch === 'x64');

const normalizeCallerAgent = (value?: string): PermissionCallerAgent | undefined => {
  const normalized = value?.toLowerCase().replace(/[^a-z]/g, '');
  if (normalized === 'claude' || normalized === 'codex' || normalized === 'openclaw') {
    return normalized;
  }
  return undefined;
};

const PS_TREE_MAX_DEPTH = 8;

// Mirrors the former execFileSync('ps', ...) lookup: any spawn failure (or a
// non-zero exit, which leaves stdout empty) resolves to undefined.
const psParentEntry = (
  pid: number
): Effect.Effect<string | undefined, never, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.scoped(
    Effect.gen(function* () {
      // The child never reads interactive input: hand it an immediately-closed
      // stdin pipe (EOF), matching the previous `stdio: ['ignore', ...]` spawn.
      const handle = yield* ChildProcess.make(
        'ps',
        ['-o', 'ppid=', '-o', 'comm=', '-p', String(pid)],
        { stdin: Stream.empty, extendEnv: true }
      );
      const output = yield* Stream.mkString(Stream.decodeText(handle.stdout));
      return output.trim();
    })
  ).pipe(Effect.orElseSucceed(() => undefined));

const detectCallerAgentFromProcessTree: Effect.Effect<
  PermissionCallerAgent | undefined,
  never,
  ChildProcessSpawner.ChildProcessSpawner
> = Effect.gen(function* () {
  if (process.platform === 'win32') return undefined;

  let pid = process.ppid;
  for (let depth = 0; depth < PS_TREE_MAX_DEPTH && pid > 1; depth += 1) {
    const output = yield* psParentEntry(pid);
    if (output === undefined || output === '') return undefined;

    const match = output.match(/^(\d+)\s+(.+)$/);
    if (!match) return undefined;

    const command = match[2]?.toLowerCase() ?? '';
    if (command.includes('openclaw') || command.includes('open-claw')) return 'openclaw';
    if (command.includes('claude')) return 'claude';
    if (command.includes('codex')) return 'codex';

    pid = Number(match[1]);
  }

  return undefined;
});

export type PermissionCallerAgentSignals = Config.Success<
  typeof UNPREFIXED_CONFIG.CALLER_AGENT_SIGNALS
>;

const detectCallerAgentFromSignals = (
  signals: PermissionCallerAgentSignals
): PermissionCallerAgent | undefined => {
  const explicit = normalizeCallerAgent(signals.explicit);
  if (explicit) return explicit;

  if (signals.openclaw) return 'openclaw';
  if (signals.claude) return 'claude';
  if (signals.codex) return 'codex';

  return undefined;
};

export const detectPermissionCallerAgentEffect = (
  providedSignals?: PermissionCallerAgentSignals
): Effect.Effect<PermissionCallerAgent, never, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function* () {
    const signals =
      providedSignals ?? (yield* loadHostConfig(UNPREFIXED_CONFIG.CALLER_AGENT_SIGNALS));
    const fromEnv = detectCallerAgentFromSignals(signals);
    if (fromEnv !== undefined) return fromEnv;

    return (yield* detectCallerAgentFromProcessTree) ?? 'composio';
  });

export const detectPermissionCallerAgent = (): Promise<PermissionCallerAgent> =>
  Effect.runPromise(Effect.provide(detectPermissionCallerAgentEffect(), BunServices.layer));
