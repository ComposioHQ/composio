import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { TerminalUI } from 'src/services/terminal-ui';
import { TestLive, MockConsole } from 'test/__utils__';

describe('TerminalUI', () => {
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
          ui.withSpinner('loading', Effect.fail(new Error('network error')))
        );

        expect(exit._tag).toBe('Failure');
      })
    );

    // -----------------------------------------------------------------------
    // useMakeSpinner — auto-cleanup on error
    // -----------------------------------------------------------------------

    it.scoped('useMakeSpinner auto-stops spinner on error', () =>
      Effect.gen(function* () {
        const ui = yield* TerminalUI;

        const exit = yield* Effect.exit(
          ui.useMakeSpinner('fetching data', _spinner => Effect.fail(new Error('API returned 400')))
        );

        expect(exit._tag).toBe('Failure');

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
                return yield* Effect.fail(new Error('timed out'));
              })
            )
          );

          expect(exit._tag).toBe('Failure');

          const lines = yield* MockConsole.getLines();
          // Should see the user's error message
          expect(lines).toContain('Login timed out. Please try again.');
          // Should NOT see the default spinner message as a second error
          expect(lines.filter(l => l === 'fetching')).toHaveLength(0);
        })
    );
  });
});
