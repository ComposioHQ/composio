import { describe, expect, it } from '@effect/vitest';
import { Effect, Exit } from 'effect';
import { makeSinkFailures } from 'src/commands/triggers/sink-failures';
import { TerminalUI } from 'src/services/terminal-ui';
import { redirectedTerminalUI } from 'test/__utils__/services/redirected-terminal-ui';

const recordOneFailure = (failFast: boolean) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    let stopped = false;
    const failures = makeSinkFailures({
      ui,
      failFast,
      stop: Effect.sync(() => {
        stopped = true;
      }),
      summary: count => `${count} failed`,
    });
    const exit = yield* Effect.exit(failures.record('write failed'));
    return { exit, stopped };
  }).pipe(Effect.provide(redirectedTerminalUI().layer));

describe('makeSinkFailures', () => {
  // The event must not reach a later sink, e.g. a forward after a failed --out append.
  it.effect('[Given] --fail-fast [Then] a failure stops the listener and ends the event', () =>
    Effect.gen(function* () {
      const { exit, stopped } = yield* recordOneFailure(true);

      expect(stopped).toBe(true);
      expect(Exit.hasInterrupts(exit)).toBe(true);
    })
  );

  it.effect('[Given] no --fail-fast [Then] the event goes on to its next sink', () =>
    Effect.gen(function* () {
      const { exit, stopped } = yield* recordOneFailure(false);

      expect(stopped).toBe(false);
      expect(Exit.isSuccess(exit)).toBe(true);
    })
  );

  it.effect(
    '[Given] a failure message quoting remote text [Then] its warn is one escaped line',
    () =>
      Effect.gen(function* () {
        const terminal = redirectedTerminalUI({ decoratedStderr: true });
        yield* Effect.gen(function* () {
          const failures = makeSinkFailures({
            ui: yield* TerminalUI,
            failFast: false,
            stop: Effect.void,
            summary: count => `${count} failed`,
          });
          // Formatting fixture: a BEL and CR/LF, as a remote error message could carry them.
          yield* failures.record('Forwarding failed: busy\u0007\r\nretry later');
        }).pipe(Effect.provide(terminal.layer));

        expect(terminal.stderr()).toContain(
          'Forwarding failed: busy\\u0007\\u000d\\u000aretry later'
        );
        expect(terminal.stderr()).not.toMatch(/[\u0007\r]/u);
      })
  );
});
