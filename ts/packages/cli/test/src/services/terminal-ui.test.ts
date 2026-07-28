import { Writable } from 'node:stream';
import { describe, expect, it, layer } from '@effect/vitest';
import { beforeEach, vi } from 'vitest';
import * as p from '@clack/prompts';
import { Array as Arr, Data, Effect, Exit, pipe } from 'effect';
import { getTerminalCapabilities, makeTerminalUI, TerminalUI } from 'src/services/terminal-ui';
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
