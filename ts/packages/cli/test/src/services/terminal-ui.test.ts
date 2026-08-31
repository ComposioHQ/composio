import { Writable } from 'node:stream';
import { describe, expect, it, layer } from '@effect/vitest';
import { beforeEach, vi } from 'vitest';
import * as p from '@clack/prompts';
import stringWidth from 'fast-string-width';
import { Array as Arr, Data, Effect, Exit, pipe } from 'effect';
import {
  clampSpinnerMessage,
  getTerminalCapabilities,
  makeTerminalUI,
  TerminalUI,
} from 'src/services/terminal-ui';
import { TestLive, MockConsole } from 'test/__utils__';

vi.mock('@clack/prompts', async importOriginal => {
  const actual = await importOriginal<typeof import('@clack/prompts')>();
  return { ...actual, confirm: vi.fn(), select: vi.fn() };
});

class TestFailure extends Data.TaggedError('test/TestFailure')<{
  readonly message: string;
}> {}

const booleanStates = [false, true] as const;

const ttyCombinations = pipe(
  Arr.Do,
  Arr.bind('stdin', () => booleanStates),
  Arr.bind('stdout', () => booleanStates),
  Arr.bind('stderr', () => booleanStates)
);

/** An intentional Node.js Writable test double matching Clack's output contract. */
const makeSink = (isTTY: boolean) => {
  const chunks: string[] = [];
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  });
  return Object.assign(sink, { isTTY, chunks });
};

const makeStreamedUi = (tty: { stdin: boolean; stdout: boolean; stderr: boolean }) => {
  const stdout = makeSink(tty.stdout);
  const stderr = makeSink(tty.stderr);
  const ui = makeTerminalUI({ stdin: { isTTY: tty.stdin }, stdout, stderr });
  return { ui, stdout, stderr };
};

describe('TerminalUI', () => {
  it.each(ttyCombinations)(
    'derives each capability from only the streams that serve it (stdin=$stdin, stdout=$stdout, stderr=$stderr)',
    ({ stdin, stdout, stderr }) => {
      expect(
        getTerminalCapabilities({
          stdin: { isTTY: stdin },
          stdout: { isTTY: stdout },
          stderr: { isTTY: stderr },
        })
      ).toEqual({
        stdinIsTTY: stdin,
        stdoutIsTTY: stdout,
        stderrIsTTY: stderr,
        canPrompt: stdin && stderr,
        canDecorate: stderr,
      });
    }
  );

  describe('each capability is decided only by its own streams (behavior, not booleans)', () => {
    beforeEach(() => {
      vi.mocked(p.confirm).mockReset();
      vi.mocked(p.select).mockReset();
    });

    it.effect(
      'stdin redirected, stdout+stderr TTY: prompts fall back, stdout stays clean, decoration renders',
      () =>
        Effect.gen(function* () {
          const { ui, stdout, stderr } = makeStreamedUi({
            stdin: false,
            stdout: true,
            stderr: true,
          });

          const confirmed = yield* ui.confirm('proceed?', { defaultValue: false });
          expect(confirmed).toBe(false);
          expect(p.confirm).not.toHaveBeenCalled();

          const selected = yield* ui.select('pick', [
            { value: 'first', label: 'First' },
            { value: 'second', label: 'Second' },
          ]);
          expect(selected).toBe('first');
          expect(p.select).not.toHaveBeenCalled();

          yield* ui.output('{"machine":"data"}');
          expect(stdout.chunks).toEqual([]);

          yield* ui.output('forced-data', { force: true });
          expect(stdout.chunks.join('')).toContain('forced-data');

          yield* ui.log.info('stdin-redirect decoration');
          expect(stderr.chunks.join('')).toContain('stdin-redirect decoration');
        })
    );

    it.effect(
      'stdout piped, stdin+stderr TTY: prompting stays available, data emits, decoration renders',
      () =>
        Effect.gen(function* () {
          vi.mocked(p.confirm).mockResolvedValue(false);
          const { ui, stdout, stderr } = makeStreamedUi({
            stdin: true,
            stdout: false,
            stderr: true,
          });

          const confirmed = yield* ui.confirm('proceed?', { defaultValue: true });
          expect(p.confirm).toHaveBeenCalledTimes(1);
          expect(confirmed).toBe(false);

          yield* ui.output('{"machine":"data"}');
          expect(stdout.chunks.join('')).toContain('{"machine":"data"}');

          yield* ui.log.info('stdout-piped decoration');
          expect(stderr.chunks.join('')).toContain('stdout-piped decoration');
        })
    );

    it.effect(
      'stderr captured, stdin+stdout TTY: no prompts, no decoration, stdout silent unless forced',
      () =>
        Effect.gen(function* () {
          const { ui, stdout, stderr } = makeStreamedUi({
            stdin: true,
            stdout: true,
            stderr: false,
          });

          const confirmed = yield* ui.confirm('proceed?', { defaultValue: true });
          expect(confirmed).toBe(true);
          expect(p.confirm).not.toHaveBeenCalled();

          yield* ui.log.info('captured decoration');
          expect(stderr.chunks).toEqual([]);

          yield* ui.output('{"machine":"data"}');
          expect(stdout.chunks).toEqual([]);

          yield* ui.output('forced-data', { force: true });
          expect(stdout.chunks.join('')).toContain('forced-data');
        })
    );

    it.effect('all streams redirected: machine output still emits', () =>
      Effect.gen(function* () {
        const { ui, stdout, stderr } = makeStreamedUi({
          stdin: false,
          stdout: false,
          stderr: false,
        });

        yield* ui.output('{"machine":"data"}');
        expect(stdout.chunks.join('')).toContain('{"machine":"data"}');

        yield* ui.log.info('invisible decoration');
        expect(stderr.chunks).toEqual([]);
      })
    );
  });

  describe('clampSpinnerMessage keeps live spinner messages on one terminal row', () => {
    it('leaves a message that fits untouched', () => {
      expect(clampSpinnerMessage(80, 'Checking for updates')).toBe('Checking for updates');
    });

    it('truncates a message longer than the row budget with an ellipsis', () => {
      const clamped = clampSpinnerMessage(40, 'x'.repeat(100));
      expect(clamped).toBe(`${'x'.repeat(32)}…`);
      expect(clamped).toHaveLength(40 - 7);
    });

    it('collapses embedded newlines into spaces', () => {
      expect(clampSpinnerMessage(80, 'line one\nline two')).toBe('line one line two');
    });

    it('never slices a message containing ANSI escape sequences', () => {
      const colored = `\u001b[32m${'x'.repeat(100)}\u001b[0m`;
      expect(clampSpinnerMessage(40, colored)).toBe(colored);
    });

    it('measures display columns, not UTF-16 code units', () => {
      // 20 CJK characters are 20 code units but 40 display columns, so at 40
      // columns they sit under a `.length` budget of 33 and over a width one.
      // A length-based clamp would pass them through and let the frame wrap.
      const message = '\u4f60\u597d'.repeat(10);
      expect(message).toHaveLength(20);
      expect(stringWidth(message)).toBe(40);

      const clamped = clampSpinnerMessage(40, message);
      expect(clamped.endsWith('…')).toBe(true);
      expect(stringWidth(clamped)).toBeLessThanOrEqual(40 - 7);
    });

    it('measures and truncates whole grapheme clusters', () => {
      const keycap = '1\uFE0F\u20E3';
      expect(stringWidth(keycap)).toBe(2);
      expect([...keycap].reduce((width, char) => width + stringWidth(char), 0)).toBe(1);

      const clamped = clampSpinnerMessage(20, keycap.repeat(20));
      expect(clamped).toMatch(/^(?:1\uFE0F\u20E3)*…$/u);
      expect(stringWidth(clamped)).toBeLessThanOrEqual(20 - 7);
    });

    it('never cuts a surrogate pair in half', () => {
      const clamped = clampSpinnerMessage(20, '\u{1f600}'.repeat(40));
      expect(clamped).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
      expect(stringWidth(clamped)).toBeLessThanOrEqual(20 - 7);
    });

    it('degrades to the ellipsis on terminals narrower than the frame overhead', () => {
      // Below SPINNER_RENDER_OVERHEAD + 1 columns no message length fits, so the
      // budget bottoms out at one column rather than jumping back up to eight.
      expect(clampSpinnerMessage(4, 'x'.repeat(100))).toBe('…');
    });

    it('keeps the rendered frame within the row at the exact budget boundary', () => {
      const columns = 20;
      const clamped = clampSpinnerMessage(columns, 'x'.repeat(100));
      // frame (1) + two spaces (2) + message + three animated dots (3).
      expect(1 + 2 + stringWidth(clamped) + 3).toBeLessThanOrEqual(columns);
    });

    // Clack ticks every 80ms and grows its animated dots by 0.125 per tick, so
    // reaching the three dots SPINNER_RENDER_OVERHEAD reserves takes 24 ticks.
    // A shorter advance renders a frame with no dots and never exercises them.
    const TICKS_PAST_THREE_DOTS = 2000;

    const LONG_UPGRADE_MESSAGE =
      'New version available: @composio/cli@0.4.0 (current: @composio/cli@0.3.2). Downloading...';

    const narrowUi = (columns: number) => {
      const stdout = makeSink(true);
      const stderr = Object.assign(makeSink(true), { columns });
      const ui = makeTerminalUI({ stdin: { isTTY: true }, stdout, stderr });
      return { ui, stderr };
    };

    /** Every frame clack redrew, i.e. the writes that carry the clamped message. */
    const clampedFrames = (stderr: { chunks: string[] }) =>
      stderr.chunks.filter(chunk => chunk.includes('…'));

    /** Drives a real clack spinner with fake timers, then always restores them. */
    const withFakeTimers = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.acquireUseRelease(
        Effect.sync(() => vi.useFakeTimers()),
        () => effect,
        () => Effect.sync(() => vi.useRealTimers())
      );

    it.live('renders live spinner frames without wrapping in a narrow terminal', () =>
      withFakeTimers(
        Effect.gen(function* () {
          const { ui, stderr } = narrowUi(40);

          yield* ui.useMakeSpinner(LONG_UPGRADE_MESSAGE, spinner =>
            Effect.gen(function* () {
              yield* Effect.sync(() => vi.advanceTimersByTime(TICKS_PAST_THREE_DOTS));
              yield* spinner.stop('Upgrade completed!');
            })
          );

          const frames = clampedFrames(stderr);
          expect(frames.length).toBeGreaterThan(0);
          expect(frames[0]).toContain('New version available: @composio');
          // A wrapped frame is what leaks lines on every redraw tick.
          for (const frame of frames) {
            expect(frame).not.toContain('\n');
          }
        })
      )
    );

    it.live('clamps live message() updates, not just the start message', () =>
      withFakeTimers(
        Effect.gen(function* () {
          const { ui, stderr } = narrowUi(40);

          yield* ui.useMakeSpinner('Checking for updates...', spinner =>
            Effect.gen(function* () {
              // The upgrade flow drives its longest text through message(), not
              // start() — reverting the clamp there must fail this test.
              yield* spinner.message(LONG_UPGRADE_MESSAGE);
              yield* Effect.sync(() => vi.advanceTimersByTime(TICKS_PAST_THREE_DOTS));
              yield* spinner.stop('Upgrade completed!');
            })
          );

          const frames = clampedFrames(stderr);
          expect(frames.length).toBeGreaterThan(0);
          expect(frames[0]).toContain('New version available: @composio');
          for (const frame of frames) {
            expect(frame).not.toContain('\n');
          }
        })
      )
    );

    it.live('does not grow updates beyond the width Clack captured at construction', () =>
      withFakeTimers(
        Effect.gen(function* () {
          const { ui, stderr } = narrowUi(20);

          yield* ui.useMakeSpinner('Checking for updates...', spinner =>
            Effect.gen(function* () {
              stderr.columns = 80;
              yield* spinner.message(LONG_UPGRADE_MESSAGE);
              yield* Effect.sync(() => vi.advanceTimersByTime(TICKS_PAST_THREE_DOTS));
              yield* spinner.stop('Upgrade completed!');
            })
          );

          const frames = clampedFrames(stderr);
          expect(frames.length).toBeGreaterThan(0);
          expect(frames[0]).toContain('New version');
          for (const frame of frames) {
            expect(frame).not.toContain('\n');
            expect(stringWidth(frame)).toBeLessThanOrEqual(20);
          }
        })
      )
    );

    it.live('respects a terminal that narrows after spinner construction', () =>
      withFakeTimers(
        Effect.gen(function* () {
          const { ui, stderr } = narrowUi(80);

          yield* ui.useMakeSpinner('Checking for updates...', spinner =>
            Effect.gen(function* () {
              stderr.columns = 20;
              yield* spinner.message(LONG_UPGRADE_MESSAGE);
              yield* Effect.sync(() => vi.advanceTimersByTime(TICKS_PAST_THREE_DOTS));
              yield* spinner.stop('Upgrade completed!');
            })
          );

          const frames = clampedFrames(stderr);
          expect(frames.length).toBeGreaterThan(0);
          expect(frames[0]).toContain('New version');
          for (const frame of frames) {
            expect(frame).not.toContain('\n');
            expect(stringWidth(frame)).toBeLessThanOrEqual(20);
          }
        })
      )
    );

    it.live('clamps the withSpinner start message too', () =>
      withFakeTimers(
        Effect.gen(function* () {
          const { ui, stderr } = narrowUi(40);

          yield* ui.withSpinner(
            LONG_UPGRADE_MESSAGE,
            Effect.sync(() => vi.advanceTimersByTime(TICKS_PAST_THREE_DOTS))
          );

          const frames = clampedFrames(stderr);
          expect(frames.length).toBeGreaterThan(0);
          for (const frame of frames) {
            expect(frame).not.toContain('\n');
          }
        })
      )
    );
  });

  layer(TestLive())(it => {
    // -----------------------------------------------------------------------
    // Data output
    // -----------------------------------------------------------------------

    it.scoped('output writes raw data capturable by MockConsole', () =>
      Effect.gen(function* () {
        const ui = yield* TerminalUI;
        yield* ui.output('ak_test123');

        const lines = yield* MockConsole.getLines();
        expect(lines).toContain('ak_test123');
      })
    );

    it.scoped('error writes raw diagnostics capturable by MockConsole', () =>
      Effect.gen(function* () {
        const ui = yield* TerminalUI;
        yield* ui.error('diagnostic');

        const lines = yield* MockConsole.getLines();
        expect(lines).toContain('diagnostic');
      })
    );

    // -----------------------------------------------------------------------
    // Log text capture
    // -----------------------------------------------------------------------

    it.scoped('log.info writes text capturable by MockConsole', () =>
      Effect.gen(function* () {
        const ui = yield* TerminalUI;
        yield* ui.log.info('hello from info');

        const lines = yield* MockConsole.getLines();
        expect(lines).toContain('hello from info');
      })
    );

    it.scoped('log.success writes text capturable by MockConsole', () =>
      Effect.gen(function* () {
        const ui = yield* TerminalUI;
        yield* ui.log.success('operation succeeded');

        const lines = yield* MockConsole.getLines();
        expect(lines).toContain('operation succeeded');
      })
    );

    it.scoped('log.warn writes text capturable by MockConsole', () =>
      Effect.gen(function* () {
        const ui = yield* TerminalUI;
        yield* ui.log.warn('something is off');

        const lines = yield* MockConsole.getLines();
        expect(lines).toContain('something is off');
      })
    );

    it.scoped('log.error writes text capturable by MockConsole', () =>
      Effect.gen(function* () {
        const ui = yield* TerminalUI;
        yield* ui.log.error('something broke');

        const lines = yield* MockConsole.getLines();
        expect(lines).toContain('something broke');
      })
    );

    it.scoped('log.step writes text capturable by MockConsole', () =>
      Effect.gen(function* () {
        const ui = yield* TerminalUI;
        yield* ui.log.step('step completed');

        const lines = yield* MockConsole.getLines();
        expect(lines).toContain('step completed');
      })
    );

    it.scoped('note writes title and message capturable by MockConsole', () =>
      Effect.gen(function* () {
        const ui = yield* TerminalUI;
        yield* ui.note('api_key_123', 'API Key');

        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain('api_key_123');
        expect(output).toContain('API Key');
      })
    );

    it.scoped('intro and outro write text capturable by MockConsole', () =>
      Effect.gen(function* () {
        const ui = yield* TerminalUI;
        yield* ui.intro('my command');
        yield* ui.outro('all done');

        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain('my command');
        expect(output).toContain('all done');
      })
    );

    // -----------------------------------------------------------------------
    // withSpinner lifecycle
    // -----------------------------------------------------------------------

    it.scoped('withSpinner captures success message', () =>
      Effect.gen(function* () {
        const ui = yield* TerminalUI;
        const result = yield* ui.withSpinner('loading', Effect.succeed(42), {
          successMessage: 'loaded 42 items',
        });

        expect(result).toBe(42);
        const lines = yield* MockConsole.getLines();
        expect(lines).toContain('loaded 42 items');
      })
    );

    it.scoped('withSpinner propagates errors', () =>
      Effect.gen(function* () {
        const ui = yield* TerminalUI;
        const exit = yield* Effect.exit(
          ui.withSpinner('loading', Effect.fail(new TestFailure({ message: 'network error' })))
        );

        expect(Exit.isFailure(exit)).toBe(true);
      })
    );

    // -----------------------------------------------------------------------
    // useMakeSpinner — auto-cleanup on error
    // -----------------------------------------------------------------------

    it.scoped('useMakeSpinner auto-stops spinner on error', () =>
      Effect.gen(function* () {
        const ui = yield* TerminalUI;

        const exit = yield* Effect.exit(
          ui.useMakeSpinner('fetching data', _spinner =>
            Effect.fail(new TestFailure({ message: 'API returned 400' }))
          )
        );

        expect(Exit.isFailure(exit)).toBe(true);

        // The spinner error message should be captured
        const lines = yield* MockConsole.getLines();
        expect(lines).toContain('fetching data');
      })
    );

    it.scoped('useMakeSpinner does NOT double-stop if user already stopped', () =>
      Effect.gen(function* () {
        const ui = yield* TerminalUI;

        yield* ui.useMakeSpinner('processing', spinner =>
          Effect.gen(function* () {
            yield* spinner.stop('done processing');
          })
        );

        const lines = yield* MockConsole.getLines();
        // Should see the user's stop message, not the auto-cleanup
        expect(lines).toContain('done processing');
        // Should NOT see the default message as an error (which would happen with double-stop)
        expect(lines.filter(l => l === 'processing')).toHaveLength(0);
      })
    );

    it.scoped('useMakeSpinner allows message updates before stop', () =>
      Effect.gen(function* () {
        const ui = yield* TerminalUI;

        yield* ui.useMakeSpinner('starting', spinner =>
          Effect.gen(function* () {
            yield* spinner.message('step 1');
            yield* spinner.message('step 2');
            yield* spinner.stop('finished');
          })
        );

        const lines = yield* MockConsole.getLines();
        expect(lines).toContain('finished');
      })
    );

    it.scoped('useMakeSpinner returns the value from the use callback', () =>
      Effect.gen(function* () {
        const ui = yield* TerminalUI;

        const result = yield* ui.useMakeSpinner('computing', spinner =>
          Effect.gen(function* () {
            yield* spinner.stop('computed');
            return 99;
          })
        );

        expect(result).toBe(99);
      })
    );

    it.scoped(
      'useMakeSpinner does NOT double-error when callback calls spinner.error then fails',
      () =>
        Effect.gen(function* () {
          const ui = yield* TerminalUI;

          const exit = yield* Effect.exit(
            ui.useMakeSpinner('fetching', spinner =>
              Effect.gen(function* () {
                // Simulate tapError pattern: callback calls spinner.error(), then the effect fails
                yield* spinner.error('Login timed out. Please try again.');
                return yield* new TestFailure({ message: 'timed out' });
              })
            )
          );

          expect(Exit.isFailure(exit)).toBe(true);

          const lines = yield* MockConsole.getLines();
          // Should see the user's error message
          expect(lines).toContain('Login timed out. Please try again.');
          // Should NOT see the default spinner message as a second error
          expect(lines.filter(l => l === 'fetching')).toHaveLength(0);
        })
    );
  });
});
