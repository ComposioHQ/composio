// Inspired from https://github.com/Effect-TS/effect/blob/a2d57c9ac596445009ca12859b78e00e5d89b936/packages/cli/test/services/MockConsole.ts.

import * as Array from 'effect/Array';
import * as Console from 'effect/Console';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Ref from 'effect/Ref';

export interface MockConsole extends Console.Console {
  readonly getLines: (
    params?: Partial<{
      readonly stripAnsi: boolean;
    }>
  ) => Effect.Effect<ReadonlyArray<string>>;
}

export const MockConsole = Context.GenericTag<Console.Console, MockConsole>('effect/Console');
const pattern = new RegExp(
  [
    '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
    '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PRZcf-ntqry=><~]))',
  ].join('|'),
  'g'
);

const stripAnsi = (str: string) => str.replace(pattern, '');

export const make = Effect.gen(function* () {
  const lines = yield* Ref.make(Array.empty<string>());

  const getLines: MockConsole['getLines'] = (params = {}) =>
    Ref.get(lines).pipe(
      Effect.map(lines => (params.stripAnsi || false ? Array.map(lines, stripAnsi) : lines))
    );

  const log: MockConsole['log'] = (...args) => {
    return Ref.update(lines, Array.appendAll(args));
  };

  const info: MockConsole['info'] = (...args) => {
    return Ref.update(lines, Array.appendAll(args));
  };

  const warn: MockConsole['warn'] = (...args) => {
    return Ref.update(lines, Array.appendAll(args));
  };

  const error: MockConsole['error'] = (...args) => {
    return Ref.update(lines, Array.appendAll(args));
  };

  const clear: MockConsole['clear'] = Ref.update(lines, Array.empty);

  return MockConsole.of({
    [Console.TypeId]: Console.TypeId,
    clear,
    getLines,
    log,
    info,
    warn,
    error,
    unsafe: globalThis.console,
    assert: () => Effect.void,
    count: () => Effect.void,
    countReset: () => Effect.void,
    debug: () => Effect.void,
    dir: () => Effect.void,
    dirxml: () => Effect.void,
    group: () => Effect.void,
    groupEnd: Effect.void,
    table: () => Effect.void,
    time: () => Effect.void,
    timeEnd: () => Effect.void,
    timeLog: () => Effect.void,
    trace: () => Effect.void,
  });
});

export const effect = Effect.gen(function* () {
  yield* Effect.addFinalizer(() => Console.clear);
  return yield* make;
});

export const layer = Layer.scoped(MockConsole, effect);

export const getLines = (
  params?: Partial<{
    readonly stripAnsi?: boolean;
  }>
): Effect.Effect<ReadonlyArray<string>> =>
  Effect.consoleWith(_console => (_console as MockConsole).getLines(params));
