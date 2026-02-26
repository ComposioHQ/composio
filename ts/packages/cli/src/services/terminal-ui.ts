import process from 'node:process';
import type { Writable } from 'node:stream';
import * as p from '@clack/prompts';
import { MultiSelectPrompt } from '@clack/core';
import pc from 'picocolors';
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
   * Present a multi-select list to the user.
   * In non-interactive mode (piped), returns all option values.
   */
  readonly multiSelect: <Value>(
    message: string,
    options: ReadonlyArray<{
      readonly value: Value;
      readonly label: string;
      readonly hint?: string;
    }>,
    selectOptions?: { readonly required?: boolean }
  ) => Effect.Effect<Value[]>;

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

// ---------------------------------------------------------------------------
// Custom multiselect — adds a dimmed instruction hint that disappears on submit
// ---------------------------------------------------------------------------

// Clack symbols (matching @clack/prompts internals)
const S_BAR_MS = '│';
const S_BAR_END_MS = '└';
const S_CHECKBOX_ACTIVE_MS = '◻';
const S_CHECKBOX_SELECTED_MS = '◼';
const S_CHECKBOX_INACTIVE_MS = '◻';

interface MSOption<V> {
  value: V;
  label: string;
  hint?: string;
  disabled?: boolean;
}

function clackMultiselect<V>(opts: {
  message: string;
  options: MSOption<V>[];
  required?: boolean;
  output?: Writable;
}): Promise<V[] | symbol> {
  const output = (opts.output ?? process.stdout) as Writable;
  const required = opts.required ?? true;
  const hint = pc.dim('space select, enter confirm');

  const sym = (state: string) => {
    if (state === 'cancel') return pc.red('■');
    if (state === 'submit') return pc.green('◇');
    if (state === 'error') return pc.yellow('▲');
    return pc.cyan('◆');
  };
  const bar = (state: string) => {
    if (state === 'cancel') return pc.red(S_BAR_MS);
    if (state === 'error') return pc.yellow(S_BAR_MS);
    if (state === 'submit') return pc.green(S_BAR_MS);
    return pc.cyan(S_BAR_MS);
  };

  const renderOpt = (o: MSOption<V>, mode: string) => {
    const label = o.label ?? String(o.value);
    const h = o.hint ? ` ${pc.dim(`(${o.hint})`)}` : '';
    if (mode === 'active') return `${pc.cyan(S_CHECKBOX_ACTIVE_MS)} ${label}${h}`;
    if (mode === 'selected') return `${pc.green(S_CHECKBOX_SELECTED_MS)} ${pc.dim(label)}${h}`;
    if (mode === 'active-selected') return `${pc.green(S_CHECKBOX_SELECTED_MS)} ${label}${h}`;
    if (mode === 'submitted') return pc.dim(label);
    if (mode === 'cancelled') return pc.strikethrough(pc.dim(label));
    return `${pc.dim(S_CHECKBOX_INACTIVE_MS)} ${pc.dim(label)}`;
  };

  return new MultiSelectPrompt({
    options: opts.options,
    input: process.stdin,
    output,
    required,
    validate(selected: V[] | undefined) {
      if (required && (!selected || selected.length === 0)) {
        return `Please select at least one option.\n${pc.reset(
          pc.dim(
            `Press ${pc.gray(pc.bgWhite(pc.inverse(' space ')))} to select, ` +
              `${pc.gray(pc.bgWhite(pc.inverse(' enter ')))} to submit`
          )
        )}`;
      }
      return undefined;
    },
    render() {
      const value = this.value ?? [];
      const title = `${pc.gray(S_BAR_MS)}\n${sym(this.state)}  ${pc.bold(opts.message)}\n`;

      const style = (o: MSOption<V>, active: boolean) => {
        if (o.disabled) return renderOpt(o, 'inactive');
        const sel = value.includes(o.value);
        if (active && sel) return renderOpt(o, 'active-selected');
        if (sel) return renderOpt(o, 'selected');
        return renderOpt(o, active ? 'active' : 'inactive');
      };

      switch (this.state) {
        case 'submit': {
          const text =
            this.options
              .filter(o => value.includes(o.value))
              .map(o => renderOpt(o, 'submitted'))
              .join(pc.dim(', ')) || pc.dim('none');
          return `${title}${pc.gray(S_BAR_MS)}  ${text}`;
        }
        case 'cancel': {
          const text = this.options
            .filter(o => value.includes(o.value))
            .map(o => renderOpt(o, 'cancelled'))
            .join(pc.dim(', '));
          if (!text.trim()) return `${title}${pc.gray(S_BAR_MS)}`;
          return `${title}${pc.gray(S_BAR_MS)}  ${text}\n${pc.gray(S_BAR_MS)}`;
        }
        case 'error': {
          const pfx = `${pc.yellow(S_BAR_MS)}  `;
          const lines = this.options.map((o, i) => style(o, i === this.cursor));
          const footer = this.error
            .split('\n')
            .map((ln: string, i: number) =>
              i === 0 ? `${pc.yellow(S_BAR_END_MS)}  ${pc.yellow(ln)}` : `   ${ln}`
            )
            .join('\n');
          return `${title}${pfx}${lines.join(`\n${pfx}`)}\n${footer}\n`;
        }
        default: {
          const pfx = `${pc.cyan(S_BAR_MS)}  `;
          const lines = this.options.map((o, i) => style(o, i === this.cursor));
          return `${title}${bar(this.state)}  ${hint}\n${pfx}${lines.join(`\n${pfx}`)}\n${pc.cyan(S_BAR_END_MS)}\n`;
        }
      }
    },
  }).prompt() as Promise<V[] | symbol>;
}

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
    Effect.sync(() =>
      decorate(() => p.note(message, title ?? '', { format: line => line, output: process.stderr }))
    ),

  select: ((
    message: string,
    options: ReadonlyArray<{ value: unknown; label: string; hint?: string }>
  ) =>
    isInteractive
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

  multiSelect: ((
    message: string,
    options: ReadonlyArray<{ value: unknown; label: string; hint?: string }>,
    selectOptions?: { readonly required?: boolean }
  ) =>
    isInteractive
      ? Effect.promise(async () => {
          const result = await clackMultiselect({
            message,
            options: [...options],
            required: selectOptions?.required ?? false,
            output: process.stderr,
          });
          // multiselect returns Value[] | symbol (symbol on cancel)
          if (typeof result === 'symbol') return options.map(o => o.value);
          return result;
        })
      : Effect.succeed(options.map(o => o.value))) as TerminalUI['multiSelect'],

  confirm: (message, options) =>
    isInteractive
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
