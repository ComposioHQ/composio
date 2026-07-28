import { Command, CommandExecutor, FileSystem, Path } from '@effect/platform';
import { BunContext } from '@effect/platform-bun';
import {
  Cause,
  Config,
  ConfigProvider,
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
import { hasEnvPrefix } from 'src/services/master-detector';

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

// Caller-agent detection scans the whole environment for agent-specific
// prefixes (OPENCLAW_*, CLAUDE_*, CODEX_*). effect/Config can only read named
// keys, so this module keeps a single raw-env boundary, mirroring the
// node-os.ts precedent.
// eslint-disable-next-line eslint-js/no-restricted-syntax -- Sole raw-env boundary of this module: prefix scanning needs the full environment map, which effect/Config cannot enumerate.
const rawProcessEnv: NodeJS.ProcessEnv = process.env;

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

const detectCallerAgentFromEnv = (env: NodeJS.ProcessEnv): NativeUiCallerAgent | undefined => {
  const explicit = normalizeCallerAgent(env.COMPOSIO_CALLER_AGENT ?? env.COMPOSIO_AGENT);
  if (explicit) return explicit;

  if (hasEnvPrefix(env, 'OPENCLAW_')) return 'openclaw';
  if (hasEnvPrefix(env, 'CLAUDE_')) return 'claude';
  if (hasEnvPrefix(env, 'CODEX_')) return 'codex';

  return undefined;
};

export const detectNativeUiCallerAgentEffect = (
  env: NodeJS.ProcessEnv = rawProcessEnv
): Effect.Effect<NativeUiCallerAgent, never, CommandExecutor.CommandExecutor> =>
  Effect.gen(function* () {
    const fromEnv = detectCallerAgentFromEnv(env);
    if (fromEnv !== undefined) return fromEnv;

    return (yield* detectCallerAgentFromProcessTree) ?? 'composio';
  });

export const detectNativeUiCallerAgent = (
  env: NodeJS.ProcessEnv = rawProcessEnv
): Promise<NativeUiCallerAgent> =>
  Effect.runPromise(Effect.provide(detectNativeUiCallerAgentEffect(env), BunContext.layer));

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
