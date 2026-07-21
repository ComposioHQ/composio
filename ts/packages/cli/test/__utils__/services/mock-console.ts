// DO NOT MODIFY THIS FILE.
// Adapted from https://github.com/Effect-TS/effect/blob/4f2107548fa64c21a8643b7b0efcd556cd16d4b9/packages/cli/test/services/MockConsole.ts

import * as Console from 'effect/Console';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';

export interface MockConsole extends Console.Console {
  readonly getLines: (
    params?: Partial<{
      readonly stripAnsi: boolean;
    }>
  ) => Effect.Effect<ReadonlyArray<string>>;
}

// `Console.Console` is a `Context.Reference` in v4 (it replaces v3's FiberRef-backed
// console). Reusing its `.key` aliases this service into the same context slot, so
// providing `MockConsole` overrides the ambient console for anything that reads it.
export const MockConsole = Context.Service<Console.Console, MockConsole>(Console.Console.key);

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
  // buffers into a local mutable array instead of an `Effect`-hosted `Ref`.
  const lines: Array<string> = [];

  const getLines: MockConsole['getLines'] = (params = {}) =>
    Effect.sync(() => (params.stripAnsi || false ? lines.map(stripAnsi) : [...lines]));

  const push = (...args: ReadonlyArray<any>): void => {
    lines.push(...args);
  };

  return MockConsole.of({
    clear: () => {},
    getLines,
    log: push,
    info: push,
    warn: push,
    error: push,
    assert: () => {},
    count: () => {},
    countReset: () => {},
    debug: () => {},
    dir: () => {},
    dirxml: () => {},
    group: () => {},
    groupCollapsed: () => {},
    groupEnd: () => {},
    table: () => {},
    time: () => {},
    timeEnd: () => {},
    timeLog: () => {},
    trace: () => {},
  });
});

export const getLines = (
  params?: Partial<{
    readonly stripAnsi?: boolean;
  }>
): Effect.Effect<ReadonlyArray<string>> =>
  Console.consoleWith(console => (console as MockConsole).getLines(params));
