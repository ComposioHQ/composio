import process from 'node:process';
import * as p from '@clack/prompts';
import { Context, Effect, Exit, Layer } from 'effect';

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
  /**
   * Write raw data to stdout for piping and scripting.
   *
   * This is the ONLY method that writes to stdout — everything else goes to stderr.
   * When stdout is a TTY (interactive terminal), this is a no-op — the human already
   * sees the data via decoration on stderr. When stdout is redirected (pipe, subshell,
   * file), the raw value is written for machine consumption.
   *
   * Use this for values that scripts should capture (API keys, version strings, etc.).
   */
  readonly output: (data: string) => Effect.Effect<void>;

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
// TerminalUILive — production layer using @clack/prompts
// ---------------------------------------------------------------------------

/**
 * Whether the CLI is running interactively (stdout is a TTY).
 * When piped (stdout is NOT a TTY), all decoration is suppressed and only
 * `output()` writes raw data to stdout for machine consumption.
 */
const isInteractive = !!process.stdout.isTTY;

/** Run a decoration side-effect only in interactive mode. */
function decorate(fn: () => void): void {
  if (isInteractive) fn();
}

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

/** No-op spinner handle used when decoration is suppressed (piped mode). */
const silentSpinnerHandle: SpinnerHandle = {
  message: () => Effect.void,
  stop: () => Effect.void,
  error: () => Effect.void,
};

const makeLive: TerminalUI = {
  output: data =>
    Effect.sync(() => {
      if (!isInteractive) {
        process.stdout.write(`${data}\n`);
      }
    }),

  intro: title => Effect.sync(() => decorate(() => p.intro(title, { output: process.stderr }))),
  outro: message => Effect.sync(() => decorate(() => p.outro(message, { output: process.stderr }))),

  log: {
    info: message =>
      Effect.sync(() => decorate(() => p.log.info(message, { output: process.stderr }))),
    success: message =>
      Effect.sync(() => decorate(() => p.log.success(message, { output: process.stderr }))),
    warn: message =>
      Effect.sync(() => decorate(() => p.log.warn(message, { output: process.stderr }))),
    error: message =>
      Effect.sync(() => decorate(() => p.log.error(message, { output: process.stderr }))),
    step: message =>
      Effect.sync(() => decorate(() => p.log.step(message, { output: process.stderr }))),
    message: message =>
      Effect.sync(() => decorate(() => p.log.message(message, { output: process.stderr }))),
  },

  note: (message, title) =>
    Effect.sync(() => decorate(() => p.note(message, title ?? '', { output: process.stderr }))),

  withSpinner: (message, effect, options) =>
    isInteractive
      ? Effect.acquireUseRelease(
          Effect.sync(() => {
            const s = p.spinner({ output: process.stderr });
            s.start(message);
            return s;
          }),
          () => effect,
          (s, exit) =>
            Effect.sync(() => {
              if (Exit.isSuccess(exit)) {
                const successMsg =
                  typeof options?.successMessage === 'function'
                    ? options.successMessage(exit.value)
                    : (options?.successMessage ?? message);
                s.stop(successMsg);
              } else {
                s.error(options?.errorMessage ?? message);
              }
            })
        )
      : effect,

  useMakeSpinner: (message, use) =>
    isInteractive
      ? Effect.acquireUseRelease(
          Effect.sync(() => {
            const s = p.spinner({ output: process.stderr });
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
        )
      : use(silentSpinnerHandle),
};

export const TerminalUILive = Layer.succeed(TerminalUI, makeLive);
