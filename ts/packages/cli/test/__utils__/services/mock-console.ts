// Adapted from `effect/testing`'s `TestConsole` (vendored at
// ts/vendor/effect/packages/effect/src/testing/TestConsole.ts).
//
// `TestConsole.make` records every `Console` method invocation as a
// `{ method, parameters }` entry, then derives two views from that list:
// `logLines` (entries where `method === 'log'`) and `errorLines` (entries
// where `method === 'error'`) — verified against the vendored source, that
// literal mapping is *all* TestConsole implements; `info`/`warn`/`debug`/etc.
// are captured in the entry list but bucketed by neither accessor.
//
// This mock reuses TestConsole's entry-recording design (tag every call by
// method, derive views by filtering) but widens the two views to fit how
// `test/__utils__/services/terminal-ui-test.ts`'s `TerminalUITest` actually
// spreads Composio's decoration surface across more than two `Console`
// methods: `stdout` covers `log`/`info`/`debug` (the real-data channel,
// `ui.output()`, plus anything log-adjacent) and `stderr` covers
// `error`/`warn` (all decoration, matching this CLI's own output convention —
// see `ts/packages/cli/AGENTS.md`'s "Output Conventions" section). A single
// chronological buffer of every recorded call, regardless of method, still
// backs the pre-existing merged view that ~40 suites already assert against
// via `MockConsole.getLines()` with no `stream`.

import * as Console from 'effect/Console';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';

export interface MockConsole extends Console.Console {
  readonly getLines: (
    params?: Partial<{
      readonly stripAnsi: boolean;
      /**
       * Restricts the returned lines to one channel: `stdout` covers
       * `log`/`info`/`debug` calls (the real-data channel, `ui.output()`),
       * `stderr` covers `error`/`warn` calls (all decoration). Omit to get
       * every recorded call in chronological order, regardless of method —
       * the original, backward-compatible merged view.
       */
      readonly stream: 'stdout' | 'stderr';
    }>
  ) => Effect.Effect<ReadonlyArray<string>>;
}

// `Console.Console` is a `Context.Reference` in v4 (it replaces v3's FiberRef-backed
// console). Reusing its `.key` aliases this service into the same context slot, so
// providing `MockConsole` overrides the ambient console for anything that reads it.
export const MockConsole = Context.Service<Console.Console, MockConsole>(Console.Console.key);

type Method = keyof Console.Console;

const pattern = new RegExp(
  [
    '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
    '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PRZcf-ntqry=><~]))',
  ].join('|'),
  'g'
);

const stripAnsi = (str: string) => str.replace(pattern, '');

export const make = Effect.sync(() => {
  // v4's `Console.Console` interface methods are plain synchronous `void`-returning
  // calls (the effectful wrappers live at the `Console` module level), so the mock
  // buffers into local mutable arrays instead of an `Effect`-hosted `Ref`.

  // Every recorded call, tagged with the method that produced it — mirrors
  // `TestConsole.make`'s `entries` array and backs the `stdout`/`stderr` views.
  const entries: Array<{ readonly method: Method; readonly parameters: ReadonlyArray<any> }> = [];
  // Every recorded call's arguments, flattened in call order regardless of
  // method — backs the original merged view (`getLines()` with no `stream`).
  const allLines: Array<string> = [];

  const record =
    (method: Method) =>
    (...parameters: ReadonlyArray<any>): void => {
      entries.push({ method, parameters });
      allLines.push(...parameters);
    };

  const linesForMethods = (methods: ReadonlySet<Method>) =>
    entries.filter(entry => methods.has(entry.method)).flatMap(entry => entry.parameters);

  const stdoutMethods = new Set<Method>(['log', 'info', 'debug']);
  const stderrMethods = new Set<Method>(['error', 'warn']);

  const getLines: MockConsole['getLines'] = (params = {}) =>
    Effect.sync(() => {
      const source =
        params.stream === 'stdout'
          ? linesForMethods(stdoutMethods)
          : params.stream === 'stderr'
            ? linesForMethods(stderrMethods)
            : allLines;
      return params.stripAnsi || false ? source.map(stripAnsi) : [...source];
    });

  return MockConsole.of({
    getLines,
    clear: record('clear'),
    log: record('log'),
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
    assert: record('assert'),
    count: record('count'),
    countReset: record('countReset'),
    debug: record('debug'),
    dir: record('dir'),
    dirxml: record('dirxml'),
    group: record('group'),
    groupCollapsed: record('groupCollapsed'),
    groupEnd: record('groupEnd'),
    table: record('table'),
    time: record('time'),
    timeEnd: record('timeEnd'),
    timeLog: record('timeLog'),
    trace: record('trace'),
  });
});

export const getLines = (
  params?: Partial<{
    readonly stripAnsi?: boolean;
    readonly stream?: 'stdout' | 'stderr';
  }>
): Effect.Effect<ReadonlyArray<string>> =>
  Console.consoleWith(console => (console as MockConsole).getLines(params));
