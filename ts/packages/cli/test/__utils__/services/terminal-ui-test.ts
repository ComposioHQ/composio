import { Console, Effect, Exit, Layer } from 'effect';
import { TerminalUI } from 'src/services/terminal-ui';

/**
 * Test layer for TerminalUI that routes all output through Effect's Console.
 * Since tests use MockConsole (which intercepts Console), this ensures
 * all terminal UI output is captured deterministically — no animations,
 * no ANSI codes, no spinners.
 */
export const terminalUITestImpl = TerminalUI.of({
  capabilities: Effect.succeed({
    stdinIsTTY: false,
    stdoutIsTTY: false,
    stderrIsTTY: false,
    isInteractive: false,
    canDecorate: false,
  }),
  // `output` is the real stdout *data* channel (`ui.output()`). It uses
  // `Console.info` rather than `Console.log` deliberately: `src/commands/index.ts`'s
  // `runWithConfig` provides a Console override for most invocations that
  // redirects `.log` calls to `.error` (routing the framework's own decoration
  // rendering to stderr — see its `runWithDecorationOnStderr`). That override
  // only touches `.log`; using `.info` here keeps `ui.output()`'s test-visible
  // channel immune to it, matching production, where `ui.output()` never goes
  // through the Effect `Console` service at all and so is never affected.
  output: data => Console.info(data),
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
