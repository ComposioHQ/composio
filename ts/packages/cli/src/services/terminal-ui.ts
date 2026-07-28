import process from 'node:process';
import type { Writable } from 'node:stream';
import * as p from '@clack/prompts';
import { Context, Effect, Exit, Layer } from 'effect';

export type TtyLikeStream = {
  readonly isTTY?: boolean;
};

export type TerminalStdio = {
  readonly stdin: TtyLikeStream;
  readonly stdout: TtyLikeStream;
  readonly stderr: TtyLikeStream;
};

/**
 * Per-stream terminal capabilities.
 *
 * The three streams are independent contracts, so each derived capability
 * depends only on the streams that actually serve it:
 *
 * - `canPrompt` — stdin must accept human input and stderr must display the
 *   Clack prompt. stdout is irrelevant: piping data must not change prompting
 *   or authentication behavior.
 * - `canDecorate` — decoration (spinners, logs, notes) renders on stderr, so it
 *   only needs stderr.
 * - machine output — `TerminalUI.output()` consults `stdoutIsTTY` alone.
 *
 * There is deliberately no aggregate "interactive" flag: it conflated these
 * concerns and let output routing change program behavior.
 */
export type TerminalCapabilities = {
  readonly stdinIsTTY: boolean;
  readonly stdoutIsTTY: boolean;
  readonly stderrIsTTY: boolean;
  /** Whether Clack prompts can run (`stdinIsTTY && stderrIsTTY`). */
  readonly canPrompt: boolean;
  /** Whether stderr decoration can render (`stderrIsTTY`). */
  readonly canDecorate: boolean;
};

/** Classify terminal streams without coupling callers or tests to Node globals. */
export const getTerminalCapabilities = (stdio: TerminalStdio): TerminalCapabilities => {
  const stdinIsTTY = Boolean(stdio.stdin.isTTY);
  const stdoutIsTTY = Boolean(stdio.stdout.isTTY);
  const stderrIsTTY = Boolean(stdio.stderr.isTTY);

  return {
    stdinIsTTY,
    stdoutIsTTY,
    stderrIsTTY,
    canPrompt: stdinIsTTY && stderrIsTTY,
    canDecorate: stderrIsTTY,
  };
};

// ---------------------------------------------------------------------------
// SpinnerHandle — returned by `useMakeSpinner` for manual control
// ---------------------------------------------------------------------------

export interface SpinnerHandle {
  /** Update the spinner message while it's running. */
  readonly message: (msg: string) => Effect.Effect<void>;
  /** Stop the spinner with a success message. */
  readonly stop: (msg?: string) => Effect.Effect<void>;
  /** Stop the spinner with an error message. */
  readonly error: (msg?: string) => Effect.Effect<void>;
}

// ---------------------------------------------------------------------------
// TerminalUI — Effect service for structured terminal output
// ---------------------------------------------------------------------------

export interface TerminalUI {
  /** Capabilities of the streams backing this terminal service. */
  readonly capabilities: Effect.Effect<TerminalCapabilities>;

  /**
   * Write raw data to stdout for piping and scripting.
   *
   * This is the ONLY method that writes to stdout — everything else goes to stderr.
   * When stdout is a TTY (a human is watching it), this is a no-op — the human already
   * sees the data via decoration on stderr. When stdout is redirected (pipe, subshell,
   * file), the raw value is written for machine consumption. Only stdout's own TTY
   * state participates in this decision; redirecting stdin or stderr must never make
   * data leak onto a visible stdout terminal.
   *
   * Use this for values that scripts should capture (API keys, version strings, etc.).
   */
  readonly output: (data: string, options?: { readonly force?: boolean }) => Effect.Effect<void>;

  /**
   * Write an unformatted line to stderr even when stderr is redirected.
   *
   * Use this for diagnostics and protocol metadata that must survive piping.
   * Human-facing decoration belongs in `log`, `note`, `intro`, or `outro`.
   */
  readonly error: (data: string) => Effect.Effect<void>;

  /** Display a session start marker (e.g., `┌  title`). Writes to stderr. */
  readonly intro: (title: string) => Effect.Effect<void>;
  /** Display a session end marker (e.g., `└  message`). Writes to stderr. */
  readonly outro: (message: string) => Effect.Effect<void>;

  /** Structured log output with severity-specific symbols. */
  readonly log: {
    /** Blue info marker. */
    readonly info: (message: string) => Effect.Effect<void>;
    /** Green success marker. */
    readonly success: (message: string) => Effect.Effect<void>;
    /** Yellow warning marker. */
    readonly warn: (message: string) => Effect.Effect<void>;
    /** Red error marker. */
    readonly error: (message: string) => Effect.Effect<void>;
    /** Green step marker (for completed steps). */
    readonly step: (message: string) => Effect.Effect<void>;
    /** Generic log message with bar guide. */
    readonly message: (message: string) => Effect.Effect<void>;
  };

  /** Display a boxed note with optional title. */
  readonly note: (message: string, title?: string) => Effect.Effect<void>;

  /**
   * Wrap an Effect computation in a spinner.
   * The spinner starts before the effect runs and stops/errors on completion.
   */
  readonly withSpinner: <A, E, R>(
    message: string,
    effect: Effect.Effect<A, E, R>,
    options?: {
      readonly successMessage?: string | ((result: A) => string);
      readonly errorMessage?: string;
    }
  ) => Effect.Effect<A, E, R>;

  /**
   * Ask the user a yes/no confirmation question.
   * When prompting is unavailable, returns `defaultValue` (defaults to `true`).
   */
  readonly confirm: (
    message: string,
    options?: { readonly defaultValue?: boolean }
  ) => Effect.Effect<boolean>;

  /**
   * Present a single-select list to the user.
   * When prompting is unavailable, returns the first option's value.
   */
  readonly select: <Value>(
    message: string,
    options: ReadonlyArray<{
      readonly value: Value;
      readonly label: string;
      readonly hint?: string;
    }>
  ) => Effect.Effect<Value>;

  /**
   * Create a controllable spinner that is automatically stopped on error or interruption.
   * The `use` function receives a SpinnerHandle and must return an Effect.
   * On success: the caller should call `spinner.stop(...)` inside `use`.
   * On failure: the spinner is automatically stopped with an error message.
   * On interruption: the spinner is automatically cancelled.
   */
  readonly useMakeSpinner: <A, E, R>(
    message: string,
    use: (spinner: SpinnerHandle) => Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E, R>;
}

export const TerminalUI = Context.GenericTag<TerminalUI>('services/TerminalUI');

// ---------------------------------------------------------------------------
// makeTerminalUI — build a TerminalUI from explicit streams
// ---------------------------------------------------------------------------

/**
 * Intentionally a Node.js Writable rather than an Effect Sink: Clack accepts
 * Writable streams and writes to them synchronously.
 */
type TerminalWritable = TtyLikeStream & Writable;

type TerminalUIStreams = {
  readonly stdin: TtyLikeStream;
  readonly stdout: TerminalWritable;
  readonly stderr: TerminalWritable;
};

function createClackSpinnerHandle(
  s: p.SpinnerResult,
  defaultMessage: string
): { handle: SpinnerHandle; isStopped: () => boolean } {
  let stopped = false;
  return {
    handle: {
      message: (msg: string) => Effect.sync(() => s.message(msg)),
      stop: (msg?: string) =>
        Effect.sync(() => {
          stopped = true;
          s.stop(msg ?? defaultMessage);
        }),
      error: (msg?: string) =>
        Effect.sync(() => {
          stopped = true;
          s.error(msg ?? defaultMessage);
        }),
    },
    isStopped: () => stopped,
  };
}

/** No-op spinner handle used when decoration is suppressed (stderr redirected). */
const silentSpinnerHandle: SpinnerHandle = {
  message: () => Effect.void,
  stop: () => Effect.void,
  error: () => Effect.void,
};

/**
 * Build a TerminalUI backed by the given streams.
 *
 * Each stream governs exactly one concern:
 * - stdin + stderr decide prompting (`canPrompt`);
 * - stdout alone decides machine output (`output()` writes only when stdout
 *   is not a TTY, or when `force` is set);
 * - stderr alone decides decoration (`canDecorate`).
 */
export const makeTerminalUI = (streams: TerminalUIStreams): TerminalUI => {
  const capabilities = getTerminalCapabilities(streams);
  const { canPrompt, canDecorate, stdoutIsTTY } = capabilities;
  const stderr = streams.stderr;

  const decorate = (render: () => void): Effect.Effect<void> => {
    if (!canDecorate) {
      return Effect.void;
    }
    return Effect.sync(render);
  };

  return {
    capabilities: Effect.succeed(capabilities),

    output: (data, options) =>
      Effect.sync(() => {
        if (options?.force || !stdoutIsTTY) {
          streams.stdout.write(`${data}\n`);
        }
      }),

    error: data => Effect.sync(() => stderr.write(`${data}\n`)),

    intro: title => decorate(() => p.intro(title, { output: stderr })),
    outro: message => decorate(() => p.outro(message, { output: stderr })),

    log: {
      info: message => decorate(() => p.log.info(message, { output: stderr })),
      success: message => decorate(() => p.log.success(message, { output: stderr })),
      warn: message => decorate(() => p.log.warn(message, { output: stderr })),
      error: message => decorate(() => p.log.error(message, { output: stderr })),
      step: message => decorate(() => p.log.step(message, { output: stderr })),
      message: message => decorate(() => p.log.message(message, { output: stderr })),
    },

    note: (message, title) =>
      decorate(() => p.note(message, title ?? '', { format: line => line, output: stderr })),

    select: ((
      message: string,
      options: ReadonlyArray<{ value: unknown; label: string; hint?: string }>
    ) => {
      if (!canPrompt) {
        return Effect.succeed(options[0].value);
      }

      return Effect.promise(async () => {
        const result = await p.select({
          message,
          options: [...options],
          output: stderr,
        });
        // p.select returns Value | symbol (symbol on cancel)
        if (typeof result === 'symbol') return options[0].value;
        return result;
      });
    }) as TerminalUI['select'],

    confirm: (message, options) => {
      if (!canPrompt) {
        return Effect.succeed(options?.defaultValue ?? true);
      }

      return Effect.promise(async () => {
        const result = await p.confirm({
          message,
          initialValue: options?.defaultValue ?? true,
          output: stderr,
        });
        if (p.isCancel(result)) return false;
        return result;
      });
    },

    withSpinner: (message, effect, options) => {
      if (!canDecorate) {
        return effect;
      }

      return Effect.acquireUseRelease(
        Effect.sync(() => {
          const s = p.spinner({ output: stderr });
          s.start(message);
          return s;
        }),
        () => effect,
        (s, exit) =>
          Effect.sync(() => {
            if (Exit.isSuccess(exit)) {
              let successMessage = message;
              const configuredSuccessMessage = options?.successMessage;
              if (typeof configuredSuccessMessage === 'function') {
                successMessage = configuredSuccessMessage(exit.value);
              } else if (configuredSuccessMessage !== undefined) {
                successMessage = configuredSuccessMessage;
              }
              s.stop(successMessage);
            } else {
              s.error(options?.errorMessage ?? message);
            }
          })
      );
    },

    useMakeSpinner: (message, use) => {
      if (!canDecorate) {
        return use(silentSpinnerHandle);
      }

      return Effect.acquireUseRelease(
        Effect.sync(() => {
          const s = p.spinner({ output: stderr });
          s.start(message);
          const { handle, isStopped } = createClackSpinnerHandle(s, message);
          return { raw: s, handle, isStopped };
        }),
        ({ handle }) => use(handle),
        ({ raw, isStopped }, exit) =>
          Effect.sync(() => {
            // Only clean up if the spinner hasn't been stopped/errored by the callback
            if (Exit.isFailure(exit) && !isStopped()) {
              raw.error(message);
            }
          })
      );
    },
  };
};

// ---------------------------------------------------------------------------
// TerminalUILive — production layer using @clack/prompts
// ---------------------------------------------------------------------------

export const TerminalUILive = Layer.succeed(
  TerminalUI,
  makeTerminalUI({
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  })
);
