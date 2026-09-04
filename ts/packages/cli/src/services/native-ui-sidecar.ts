import { Command, CommandExecutor, FileSystem, Path } from '@effect/platform';
import { BunContext } from '@effect/platform-bun';
import {
  Cause,
  Config,
  Data,
  Duration,
  Effect,
  Exit,
  Option,
  Predicate,
  Schema,
  Stream,
} from 'effect';
import {
  detectCliPlatform,
  ensureBundledBinaryExecutable,
  getLocalToolsBundleRootCandidates,
} from '@composio/cli-local-tools';
import { UNPREFIXED_CONFIG } from 'src/effects/app-config';
import { loadHostConfig } from 'src/services/config';

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

export class NativeUiBinarySetupError extends Data.TaggedError(
  'services/NativeUiBinarySetupError'
)<{
  readonly binaryPath: string;
  readonly cause: unknown;
}> {
  override get message(): string {
    return `Failed to make the native UI sidecar binary executable: ${this.binaryPath}`;
  }
}

export class NativeUiDecisionMissingError extends Data.TaggedError(
  'services/NativeUiDecisionMissingError'
)<{
  readonly binaryPath: string;
}> {
  override get message(): string {
    return 'Native permission prompt exited without a decision.';
  }
}

/**
 * Interactive permission UI (the native sidecar dialog and the browser
 * approval page) must never spawn from automated environments. The explicit
 * COMPOSIO_DISABLE_PERMISSION_UI knob wins in both directions; without it,
 * CI and Vitest runs disable the UI.
 */
export const interactivePermissionUiDisabledConfig =
  UNPREFIXED_CONFIG.INTERACTIVE_PERMISSION_UI_DISABLED;

export const isInteractivePermissionUiDisabled: Effect.Effect<boolean> = loadHostConfig(
  interactivePermissionUiDisabledConfig
);

const normalizeCallerAgent = (value?: string): NativeUiCallerAgent | undefined => {
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
): Effect.Effect<string | undefined, never, CommandExecutor.CommandExecutor> =>
  Command.make('ps', '-o', 'ppid=', '-o', 'comm=', '-p', String(pid)).pipe(
    // The child never reads interactive input: hand it an immediately-closed
    // stdin pipe (EOF), matching the previous `stdio: ['ignore', ...]` spawn.
    Command.stdin(Stream.empty),
    Command.string,
    Effect.map(output => output.trim()),
    Effect.orElseSucceed(() => undefined)
  );

const detectCallerAgentFromProcessTree: Effect.Effect<
  NativeUiCallerAgent | undefined,
  never,
  CommandExecutor.CommandExecutor
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

export type NativeUiCallerAgentSignals = Config.Config.Success<
  typeof UNPREFIXED_CONFIG.CALLER_AGENT_SIGNALS
>;

const detectCallerAgentFromSignals = (
  signals: NativeUiCallerAgentSignals
): NativeUiCallerAgent | undefined => {
  const explicit = normalizeCallerAgent(signals.explicit);
  if (explicit) return explicit;

  if (signals.openclaw) return 'openclaw';
  if (signals.claude) return 'claude';
  if (signals.codex) return 'codex';

  return undefined;
};

export const detectNativeUiCallerAgentEffect = (
  providedSignals?: NativeUiCallerAgentSignals
): Effect.Effect<NativeUiCallerAgent, never, CommandExecutor.CommandExecutor> =>
  Effect.gen(function* () {
    const signals =
      providedSignals ?? (yield* loadHostConfig(UNPREFIXED_CONFIG.CALLER_AGENT_SIGNALS));
    const fromEnv = detectCallerAgentFromSignals(signals);
    if (fromEnv !== undefined) return fromEnv;

    return (yield* detectCallerAgentFromProcessTree) ?? 'composio';
  });

export const detectNativeUiCallerAgent = (): Promise<NativeUiCallerAgent> =>
  Effect.runPromise(Effect.provide(detectNativeUiCallerAgentEffect(), BunContext.layer));

export const resolveNativeUiBinary: Effect.Effect<
  NativeUiBinaryResolution,
  never,
  FileSystem.FileSystem | Path.Path
> = Effect.gen(function* () {
  const platform = detectCliPlatform();
  if (!platform.startsWith('darwin-')) {
    return {
      _tag: 'unsupported',
      platform,
    };
  }

  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const candidates = getLocalToolsBundleRootCandidates().map(root =>
    path.join(root, NATIVE_UI_BINARY_NAME, platform, NATIVE_UI_BINARY_NAME)
  );
  const binaryPath = yield* Effect.findFirst(candidates, candidate =>
    fs.exists(candidate).pipe(Effect.orElseSucceed(() => false))
  );

  return Option.match(binaryPath, {
    onNone: (): NativeUiBinaryResolution => ({
      _tag: 'missing',
      platform,
      candidates,
    }),
    onSome: (binaryPath): NativeUiBinaryResolution => ({
      _tag: 'found',
      binaryPath,
    }),
  });
});

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

type DialogExit =
  | {
      readonly _tag: 'exited';
      // undefined when the dialog was terminated by a signal, which the
      // previous 'exit' handler saw as `code === null` (treated as non-zero).
      readonly exitCode: number | undefined;
    }
  | {
      readonly _tag: 'timedOut';
    };

const requestNativeUiPermissionDecisionEffect = (params: {
  readonly toolSlug: string;
  readonly accountLabel?: string;
  readonly timeoutSeconds?: number;
}) =>
  Effect.gen(function* () {
    if (yield* isInteractivePermissionUiDisabled) return undefined;

    const resolved = yield* resolveNativeUiBinary;
    if (!Predicate.isTagged(resolved, 'found')) return undefined;

    yield* Effect.tryPromise({
      try: () => ensureBundledBinaryExecutable(resolved.binaryPath),
      catch: cause => new NativeUiBinarySetupError({ binaryPath: resolved.binaryPath, cause }),
    });

    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    // Removed when the surrounding scope closes, replacing the try/finally rm.
    const tempDir = yield* fs.makeTempDirectoryScoped({
      prefix: 'composio-native-ui-decision-',
    });
    const callbackFile = path.join(tempDir, 'decision.json');
    const timeoutSeconds = params.timeoutSeconds ?? 30;
    const callerAgent = yield* detectNativeUiCallerAgentEffect();

    const args = [
      '--tool',
      params.toolSlug,
      '--account',
      params.accountLabel ?? 'default connection',
      '--caller-agent',
      callerAgent,
      '--subtitle',
      'Approve once, allow for 1 hour, or deny.',
      '--allow-session-label',
      'Allow for 1 hr',
      '--callback-file',
      callbackFile,
      '--timeout',
      String(timeoutSeconds),
    ];

    const child = yield* Command.start(
      // The dialog never reads interactive input: hand it an immediately-closed
      // stdin pipe (EOF), matching the previous `stdio: 'ignore'` spawn.
      Command.make(resolved.binaryPath, ...args).pipe(Command.stdin(Stream.empty))
    );

    // The previous spawn ignored the dialog's output entirely; drain the pipes
    // so the dialog can never block on a full pipe buffer.
    yield* Effect.fork(Effect.ignore(Stream.runDrain(child.stdout)));
    yield* Effect.fork(Effect.ignore(Stream.runDrain(child.stderr)));

    const dialogExit = yield* child.exitCode.pipe(
      Effect.map((exitCode): DialogExit => ({ _tag: 'exited', exitCode })),
      // exitCode fails when the dialog was terminated by a signal; fold it into
      // the signal-termination shape instead of surfacing a PlatformError.
      Effect.orElseSucceed((): DialogExit => ({ _tag: 'exited', exitCode: undefined })),
      Effect.timeoutTo({
        duration: Duration.seconds(timeoutSeconds + 5),
        onSuccess: (exit: DialogExit) => exit,
        onTimeout: (): DialogExit => ({ _tag: 'timedOut' }),
      })
    );

    // SIGKILL rather than leaving the scope finalizer's SIGTERM to clean up:
    // the finalizer awaits the child's exit, so a dialog that ignored SIGTERM
    // would stall this permission gate instead of resolving as dismissed.
    if (dialogExit._tag === 'timedOut') {
      yield* Effect.ignore(child.kill('SIGKILL'));
      return 'dismissed';
    }

    // If the sidecar exits without writing a callback file, treat a non-zero
    // exit as a dismissal. A zero exit without a callback is unexpected.
    const decision = yield* fs.readFileString(callbackFile).pipe(
      Effect.map(parseDecisionPayload),
      Effect.orElseSucceed(() => undefined)
    );
    if (decision !== undefined) return decision;

    if (dialogExit.exitCode === 0) {
      return yield* new NativeUiDecisionMissingError({ binaryPath: resolved.binaryPath });
    }
    return 'dismissed';
  }).pipe(Effect.scoped);

export const requestNativeUiPermissionDecision = async (params: {
  readonly toolSlug: string;
  readonly accountLabel?: string;
  readonly timeoutSeconds?: number;
}): Promise<NativeUiPermissionDecision | undefined> => {
  const exit = await Effect.runPromiseExit(
    Effect.provide(requestNativeUiPermissionDecisionEffect(params), BunContext.layer)
  );
  if (Exit.isSuccess(exit)) return exit.value;

  // Surface the original error instance (callers recover from any rejection),
  // not a FiberFailure wrapper.
  throw Cause.squash(exit.cause);
};
