import process from 'node:process';
import * as p from '@clack/prompts';
import { Context, Effect, Exit, Layer } from 'effect';
import { canRenderTerminalDecoration, isInteractiveTerminal } from 'src/utils/stdio';

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
  readonly output: (data: string, options?: { readonly force?: boolean }) => Effect.Effect<void>;

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
   * In non-interactive mode (piped), returns `defaultValue` (defaults to `true`).
   */
  readonly confirm: (
    message: string,
    options?: { readonly defaultValue?: boolean }
  ) => Effect.Effect<boolean>;

  /**
   * Present a single-select list to the user.
   * In non-interactive mode (piped), returns the first option's value.
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
// TerminalUILive — production layer using @clack/prompts
// ---------------------------------------------------------------------------

/**
 * Whether the CLI can prompt for human input. Human-only prompts are shown only
 * when stdin/stdout/stderr are all TTYs; agent and shell pipelines get
 * non-interactive behavior.
 */
const canPrompt = isInteractiveTerminal();

/**
 * Whether the CLI can render auxiliary UI. Logs, notes, and spinners only need
 * stderr, so they can still be shown when stdin is redirected from /dev/null or
 * stdout is reserved for machine-readable JSON/data.
 */
const canDecorate = canRenderTerminalDecoration();

/** Run a decoration side-effect only when stderr is a terminal. */
function decorate(fn: () => void): void {
  if (canDecorate) fn();
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
  output: (data, options) =>
    Effect.sync(() => {
      if (options?.force || !canPrompt) {
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
    Effect.sync(() =>
      decorate(() => p.note(message, title ?? '', { format: line => line, output: process.stderr }))
    ),

  select: ((
    message: string,
    options: ReadonlyArray<{ value: unknown; label: string; hint?: string }>
  ) =>
    canPrompt
      ? Effect.promise(async () => {
          const result = await p.select({
            message,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            options: [...options] as any,
            output: process.stderr,
          });
          // p.select returns Value | symbol (symbol on cancel)
          if (typeof result === 'symbol') return options[0].value;
          return result;
        })
      : Effect.succeed(options[0].value)) as TerminalUI['select'],

  confirm: (message, options) =>
    canPrompt
      ? Effect.promise(async () => {
          const result = await p.confirm({
            message,
            initialValue: options?.defaultValue ?? true,
            output: process.stderr,
          });
          // p.confirm returns boolean | symbol (symbol on cancel)
          return typeof result === 'boolean' ? result : false;
        })
      : Effect.succeed(options?.defaultValue ?? true),

  withSpinner: (message, effect, options) =>
    canDecorate
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
    canDecorate
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
