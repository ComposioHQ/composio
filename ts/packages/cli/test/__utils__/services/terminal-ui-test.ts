import { Console, Effect, Exit, Layer } from 'effect';
import { getTerminalCapabilities, TerminalUI } from 'src/services/terminal-ui';

/**
 * Test layer for TerminalUI that routes all output through Effect's Console.
 * Since tests use MockConsole (which intercepts Console), this ensures
 * all terminal UI output is captured deterministically — no animations,
 * no ANSI codes, no spinners.
 */
export const terminalUITestImpl = TerminalUI.of({
  capabilities: Effect.succeed(
    getTerminalCapabilities({
      stdin: { isTTY: false },
      stdout: { isTTY: false },
      stderr: { isTTY: false },
    })
  ),
  output: data => Console.log(data),
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

  select: (_message, options) => Effect.succeed(options[0].value),

  confirm: (_message, options) => Effect.succeed(options?.defaultValue ?? true),

  withSpinner: (message, effect, options) =>
    Effect.gen(function* () {
      const result = yield* effect;
      const successMsg =
        typeof options?.successMessage === 'function'
          ? options.successMessage(result)
          : (options?.successMessage ?? message);
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

export const TerminalUITest = Layer.succeed(TerminalUI, terminalUITestImpl);
