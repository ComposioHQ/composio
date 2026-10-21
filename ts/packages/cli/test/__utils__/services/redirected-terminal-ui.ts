import { Writable } from 'node:stream';
import { Layer } from 'effect';
import { makeTerminalUI, TerminalUI } from 'src/services/terminal-ui';

const capture = () => {
  const chunks: Array<string> = [];
  const stream = Object.assign(
    new Writable({
      write(chunk, _encoding, callback) {
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
export const redirectedTerminalUI = () => {
  const stdout = capture();
  const stderr = capture();
  const ui = makeTerminalUI({
    stdin: { isTTY: false },
    stdout: stdout.stream,
    stderr: stderr.stream,
  });
  return { layer: Layer.succeed(TerminalUI, ui), stdout: stdout.text, stderr: stderr.text };
};
