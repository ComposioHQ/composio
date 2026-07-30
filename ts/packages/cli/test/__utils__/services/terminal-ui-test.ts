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
 * - the TTY flags are configurable per stream, so "cannot prompt but stdout is a terminal" — the
 *   `composio onboard < /dev/null` case — is reachable at all.
 *
 * A double that hardcoded `stdout.isTTY: false` and dropped `force` made both of those invisible,
 * and a suite written against it stays green while the command prints nothing at all.
 */
export type TerminalUITestOptions = {
  readonly tty?: {
    readonly stdin?: boolean;
    readonly stdout?: boolean;
    readonly stderr?: boolean;
  };
  /** Scripted answers for `ui.text`, consumed in order. Absent entries answer `None`. */
  readonly textAnswers?: ReadonlyArray<string>;
  /** Scripted answers for `ui.confirm`, consumed in order. Absent entries fall back to the default. */
  readonly confirmAnswers?: ReadonlyArray<boolean>;
  /** Scripted answers for `ui.select`, by option value. Absent entries pick the first option. */
  readonly selectAnswers?: ReadonlyArray<unknown>;
};

export const makeTerminalUITestImpl = (options: TerminalUITestOptions = {}): TerminalUI => {
  const capabilities: TerminalCapabilities = getTerminalCapabilities({
    stdin: { isTTY: options.tty?.stdin ?? false },
    stdout: { isTTY: options.tty?.stdout ?? false },
    stderr: { isTTY: options.tty?.stderr ?? false },
  });

  const textAnswers = [...(options.textAnswers ?? [])];
  const confirmAnswers = [...(options.confirmAnswers ?? [])];
  const selectAnswers = [...(options.selectAnswers ?? [])];

  return TerminalUI.of({
    capabilities: Effect.succeed(capabilities),

    // Mirrors the production rule: stdout alone decides, and `force` overrides it.
    output: (data, outputOptions) =>
      outputOptions?.force || !capabilities.stdoutIsTTY ? Console.log(data) : Effect.void,

    error: data => Console.error(data),

    intro: title => Console.log(`-- ${title} --`),
    outro: message => Console.log(`-- ${message} --`),

    log: {
      info: message => Console.log(message),
      success: message => Console.log(message),
      warn: message => Console.warn(message),
      error: message => Console.error(message),
      step: message => Console.log(message),
      message: message => Console.log(message),
    },

    note: (message, title) => Console.log(title ? `[${title}] ${message}` : message),

    select: ((_message: string, selectOptions: ReadonlyArray<{ value: unknown }>) => {
      if (!capabilities.canPrompt) {
        return Effect.succeed(selectOptions[0]?.value);
      }
      const scripted = selectAnswers.shift();
      return Effect.succeed(scripted === undefined ? selectOptions[0]?.value : scripted);
    }) as TerminalUI['select'],

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
