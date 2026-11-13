import { Writable } from 'node:stream';
import { Effect, Layer } from 'effect';
import { makeTerminalUI, TerminalUI } from 'src/services/terminal-ui';

/** A redirected stream; with `readerClosed`, every write fails with EPIPE, as after `| head`. */
const capture = (readerClosed = false) => {
  const chunks: Array<string> = [];
  const stream = Object.assign(
    new Writable({
      write(chunk, _encoding, callback) {
        if (readerClosed) {
          callback(Object.assign(new Error('EPIPE: broken pipe, write'), { code: 'EPIPE' }));
          return;
        }
        chunks.push(String(chunk));
        callback();
      },
    }),
    { isTTY: false }
  );
  return { stream, text: () => chunks.join('') };
};

/**
 * The real `TerminalUI` with stdin, stdout and stderr all redirected, as under a script, CI or
 * an agent: `ui.log.*` decoration is dropped and only `ui.output` and `ui.error` are written.
 * Unlike `terminalUITestImpl`, which prints decoration through `Console`, it shows what such a
 * caller actually sees.
 */
export const redirectedTerminalUI = (options?: {
  /** Runs after a `log.warn` is logged — a signal that code behind the warn has run. */
  readonly onWarn?: (message: string) => void;
  /** The reader of stdout went away before the first write (`… | head -0`). */
  readonly stdoutReaderClosed?: boolean;
}) => {
  const stdout = capture(options?.stdoutReaderClosed);
  const stderr = capture();
  const ui = makeTerminalUI({
    stdin: { isTTY: false },
    stdout: stdout.stream,
    stderr: stderr.stream,
  });
  const onWarn = options?.onWarn;
  const terminal =
    onWarn === undefined
      ? ui
      : TerminalUI.of({
          ...ui,
          log: {
            ...ui.log,
            warn: message =>
              Effect.andThen(
                ui.log.warn(message),
                Effect.sync(() => onWarn(message))
              ),
          },
        });
  return { layer: Layer.succeed(TerminalUI, terminal), stdout: stdout.text, stderr: stderr.text };
};
