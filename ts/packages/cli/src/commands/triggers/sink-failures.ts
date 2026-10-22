import { Deferred, Effect, FiberSet } from 'effect';
import { reportFailure } from 'src/effects/report-failure';
import type { TerminalUI } from 'src/services/terminal-ui';

/**
 * On a normal stop (`--max-events`, `--timeout`), lets the events the listener already accepted
 * finish saving or forwarding, for up to 10 seconds, so the summary counts how they ended. A
 * `--fail-fast` failure (`failed`) ends the wait early. The listener's scope then interrupts
 * whatever is still running.
 */
export const finishAcceptedEvents = (events: FiberSet.FiberSet, failed: Deferred.Deferred<void>) =>
  Effect.raceFirst(FiberSet.awaitEmpty(events), Deferred.await(failed)).pipe(
    Effect.timeoutOption('10 seconds'),
    Effect.asVoid
  );

/** `1 event`, `2 events`. */
export const eventCount = (count: number) => `${count} event${count === 1 ? '' : 's'}`;

/**
 * Counts the events a listener sink (saved payloads, an output file, a forwarding URL) failed to
 * take. One failure never fails the listener on its own: `record` logs a warn, and with
 * `--fail-fast` it also runs `stop` and ends the event, so no later sink takes it. `report`
 * sums the count up on stderr when the listener stops, as a plain line because piped callers
 * see none of the `ui.log.*` decoration; with `--fail-fast` it goes through `reportFailure` and
 * the CLI exits 1.
 */
export const makeSinkFailures = (params: {
  readonly ui: TerminalUI;
  readonly failFast: boolean;
  readonly stop: Effect.Effect<void>;
  /** The summary line, e.g. `2 events failed to write while listening.` */
  readonly summary: (count: number) => string;
}) => {
  let count = 0;
  return {
    record: (message: string) =>
      Effect.gen(function* () {
        count += 1;
        yield* params.ui.log.warn(message);
        if (params.failFast) {
          yield* params.stop;
          return yield* Effect.interrupt;
        }
      }),
    report: Effect.suspend(() => {
      if (count === 0) {
        return Effect.void;
      }
      const summary = params.summary(count);
      return params.failFast ? reportFailure(params.ui, summary) : params.ui.error(summary);
    }),
  };
};
