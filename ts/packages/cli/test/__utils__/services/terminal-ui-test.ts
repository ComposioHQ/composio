import { Console, Effect, Exit, Layer, Option } from 'effect';
import { getTerminalCapabilities, TerminalUI } from 'src/services/terminal-ui';
import type { TerminalCapabilities } from 'src/services/terminal-ui';

/**
 * Test layer for TerminalUI that routes all output through Effect's Console.
 * Since tests use MockConsole (which intercepts Console), this ensures
 * all terminal UI output is captured deterministically — no animations,
 * no ANSI codes, no spinners.
 *
 * The double honours the same three independent stream contracts as the real service, because a
 * double that ignores them cannot observe the modes that matter:
 *
 * - `output` writes only when stdout is piped or the caller passes `force`, so a test can tell
 *   "the document reached stdout" from "the document was withheld because stdout is a terminal".
 * - `log.*`, `note`, `intro` and `outro` write only when `canDecorate`, so a test that sets
 *   `stderr: false` observes the silence production would produce rather than text that only the
 *   double emits. `error` stays ungated, matching production.
 * - the TTY flags are configurable per stream, so "cannot prompt but stdout is a terminal" — the
 *   `composio onboard < /dev/null` case — is reachable at all.
 *
 * A double that hardcoded `stdout.isTTY: false` and dropped `force` made both of those invisible,
 * and a suite written against it stays green while the command prints nothing at all.
 */
export type TerminalUITestOptions = {
  /** Defaults: stdin and stdout non-TTY, stderr a TTY — decoration on, prompting off. */
  readonly tty?: {
    readonly stdin?: boolean;
    readonly stdout?: boolean;
    readonly stderr?: boolean;
  };
  /** Scripted answers for `ui.text`, consumed in order. Absent entries answer `None`. */
  readonly textAnswers?: ReadonlyArray<string>;
  /** Scripted answers for `ui.confirm`, consumed in order. Absent entries fall back to the default. */
  readonly confirmAnswers?: ReadonlyArray<boolean>;
  /**
   * Scripted answers for `ui.select` and `ui.selectOption`, by option value, consumed in order.
   * An absent entry picks the first option for `select` and answers `None` for `selectOption` —
   * each method's own production fallback, so "the user cancelled" is expressible.
   */
  readonly selectAnswers?: ReadonlyArray<unknown>;
};

export const makeTerminalUITestImpl = (options: TerminalUITestOptions = {}): TerminalUI => {
  const capabilities: TerminalCapabilities = getTerminalCapabilities({
    stdin: { isTTY: options.tty?.stdin ?? false },
    stdout: { isTTY: options.tty?.stdout ?? false },
    // stderr defaults to a TTY so decoration is visible: `canPrompt` still needs stdin, so this
    // does not turn any existing default-configured test into a prompting one.
    stderr: { isTTY: options.tty?.stderr ?? true },
  });

  const textAnswers = [...(options.textAnswers ?? [])];
  const confirmAnswers = [...(options.confirmAnswers ?? [])];
  const selectAnswers = [...(options.selectAnswers ?? [])];

  /** Production's gate, mirrored: `makeTerminalUI` wraps the same four members in `decorate`. */
  const decorate = (write: Effect.Effect<void>): Effect.Effect<void> =>
    capabilities.canDecorate ? write : Effect.void;

  return TerminalUI.of({
    capabilities: Effect.succeed(capabilities),

    // Mirrors the production rule: stdout alone decides, and `force` overrides it.
    output: (data, outputOptions) =>
      outputOptions?.force || !capabilities.stdoutIsTTY ? Console.log(data) : Effect.void,

    // Ungated, matching production: `error` writes to stderr whether or not it is a TTY.
    error: data => Console.error(data),

    intro: title => decorate(Console.log(`-- ${title} --`)),
    outro: message => decorate(Console.log(`-- ${message} --`)),

    log: {
      info: message => decorate(Console.log(message)),
      success: message => decorate(Console.log(message)),
      warn: message => decorate(Console.warn(message)),
      error: message => decorate(Console.error(message)),
      step: message => decorate(Console.log(message)),
      message: message => decorate(Console.log(message)),
    },

    note: (message, title) => decorate(Console.log(title ? `[${title}] ${message}` : message)),

    select: ((_message: string, selectOptions: ReadonlyArray<{ value: unknown }>) => {
      if (!capabilities.canPrompt) {
        return Effect.succeed(selectOptions[0]?.value);
      }
      const scripted = selectAnswers.shift();
      return Effect.succeed(scripted === undefined ? selectOptions[0]?.value : scripted);
    }) as TerminalUI['select'],

    selectOption: (() => {
      if (!capabilities.canPrompt) {
        return Effect.succeed(Option.none());
      }
      return Effect.succeed(Option.fromNullable(selectAnswers.shift()));
    }) as TerminalUI['selectOption'],

    // No default, ever — matching the production contract.
    text: () =>
      Effect.succeed(
        capabilities.canPrompt ? Option.fromNullable(textAnswers.shift()) : Option.none<string>()
      ),

    confirm: (_message, confirmOptions) => {
      if (!capabilities.canPrompt) {
        return Effect.succeed(confirmOptions?.defaultValue ?? true);
      }
      const scripted = confirmAnswers.shift();
      return Effect.succeed(scripted ?? confirmOptions?.defaultValue ?? true);
    },

    withSpinner: (message, effect, spinnerOptions) =>
      Effect.gen(function* () {
        const result = yield* effect;
        const successMsg =
          typeof spinnerOptions?.successMessage === 'function'
            ? spinnerOptions.successMessage(result)
            : (spinnerOptions?.successMessage ?? message);
        yield* Console.log(successMsg);
        return result;
      }),

    useMakeSpinner: (message, use) =>
      Effect.gen(function* () {
        let stopped = false;
        const handle = {
          message: (_msg: string) => Effect.void,
          stop: (msg?: string) =>
            Effect.gen(function* () {
              stopped = true;
              if (msg) yield* Console.log(msg);
            }),
          error: (msg?: string) =>
            Effect.gen(function* () {
              stopped = true;
              if (msg) yield* Console.error(msg);
            }),
        };
        const exit = yield* Effect.exit(use(handle));
        if (Exit.isFailure(exit) && !stopped) {
          yield* Console.error(message);
        }
        return yield* exit;
      }),
  });
};

export const terminalUITestImpl = makeTerminalUITestImpl();

export const TerminalUITest = Layer.succeed(TerminalUI, terminalUITestImpl);

export const terminalUITestLayer = (options: TerminalUITestOptions) =>
  Layer.succeed(TerminalUI, makeTerminalUITestImpl(options));
