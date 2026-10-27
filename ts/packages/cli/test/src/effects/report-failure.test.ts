import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { reportFailure } from 'src/effects/report-failure';
import { getTerminalCapabilities, TerminalUI } from 'src/services/terminal-ui';
import { recordingNodeProcess } from 'test/__utils__/services/node-process-test';
import { redirectedTerminalUI } from 'test/__utils__/services/redirected-terminal-ui';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';

// A TerminalUI whose stderr is a TTY, recording every line with the channel it went to.
const decoratingUI = () => {
  const lines: Array<string> = [];
  const record = (channel: string) => (message: string) =>
    Effect.sync(() => {
      lines.push(`${channel}: ${message}`);
    });
  const ui = TerminalUI.of({
    ...terminalUITestImpl,
    capabilities: Effect.succeed(
      getTerminalCapabilities({
        stdin: { isTTY: true },
        stdout: { isTTY: true },
        stderr: { isTTY: true },
      })
    ),
    error: record('stderr'),
    log: { ...terminalUITestImpl.log, error: record('log.error'), step: record('log.step') },
  });
  return { ui, lines };
};

describe('reportFailure', () => {
  it.effect(
    '[Given] a redirected stderr [Then] prints the message and hint plainly and exits 1',
    () => {
      const terminal = redirectedTerminalUI();
      const proc = recordingNodeProcess();
      return Effect.gen(function* () {
        const ui = yield* TerminalUI;

        yield* reportFailure(ui, 'Failed to fetch toolkit "gmail".', 'Browse available toolkits');

        expect(terminal.stderr()).toBe(
          'Failed to fetch toolkit "gmail".\nBrowse available toolkits\n'
        );
        expect(terminal.stdout()).toBe('');
        expect(proc.exitCode()).toBe(1);
      }).pipe(Effect.provide(terminal.layer), Effect.provide(proc.layer));
    }
  );

  it.effect('[Given] no hint [Then] prints only the message', () => {
    const terminal = redirectedTerminalUI();
    const proc = recordingNodeProcess();
    return Effect.gen(function* () {
      const ui = yield* TerminalUI;

      yield* reportFailure(ui, 'The link response is incomplete.');

      expect(terminal.stderr()).toBe('The link response is incomplete.\n');
      expect(proc.exitCode()).toBe(1);
    }).pipe(Effect.provide(terminal.layer), Effect.provide(proc.layer));
  });

  it.effect('[Given] a terminal [Then] renders a decorated error and step, once', () => {
    const { ui, lines } = decoratingUI();
    const proc = recordingNodeProcess();
    return Effect.gen(function* () {
      yield* reportFailure(ui, 'Failed to fetch toolkit "gmail".', 'Browse available toolkits');

      expect(lines).toEqual([
        'log.error: Failed to fetch toolkit "gmail".',
        'log.step: Browse available toolkits',
      ]);
      expect(proc.exitCode()).toBe(1);
    }).pipe(Effect.provide(proc.layer));
  });
});
