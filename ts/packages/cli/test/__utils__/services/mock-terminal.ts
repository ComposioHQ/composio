// DO NOT MODIFY THIS FILE.
// Copied from https://github.com/Effect-TS/effect/blob/4f2107548fa64c21a8643b7b0efcd556cd16d4b9/packages/cli/test/services/MockTerminal.ts

import type * as Terminal from '@effect/platform/Terminal';
import * as Array from 'effect/Array';
import * as Console from 'effect/Console';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Mailbox from 'effect/Mailbox';
import * as Option from 'effect/Option';

// =============================================================================
// Models
// =============================================================================

export interface MockTerminal extends Terminal.Terminal {
  readonly inputText: (text: string) => Effect.Effect<void>;
  readonly inputKey: (
    key: string,
    modifiers?: Partial<MockTerminal.Modifiers>
  ) => Effect.Effect<void>;
}

export declare namespace MockTerminal {
  export interface Modifiers {
    readonly ctrl: boolean;
    readonly meta: boolean;
    readonly shift: boolean;
  }
}

// =============================================================================
// Context
// =============================================================================

export const MockTerminal = Context.GenericTag<Terminal.Terminal, MockTerminal>(
  '@effect/platform/Terminal'
);

// =============================================================================
// Constructors
// =============================================================================

export const make = Effect.gen(function* () {
  const queue = yield* Effect.acquireRelease(Mailbox.make<Terminal.UserInput>(), _ => _.shutdown);

  const inputText: MockTerminal['inputText'] = (text: string) => {
    const inputs = Array.map(text.split(''), key => toUserInput(key));
    return queue.offerAll(inputs).pipe(Effect.asVoid);
  };

  const inputKey: MockTerminal['inputKey'] = (
    key: string,
    modifiers?: Partial<MockTerminal.Modifiers>
  ) => {
    const input = toUserInput(key, modifiers);
    return shouldQuit(input) ? queue.end : queue.offer(input).pipe(Effect.asVoid);
  };

  const display: MockTerminal['display'] = input => Console.log(input);

  const readInput: MockTerminal['readInput'] = Effect.succeed(queue);

  return MockTerminal.of({
    columns: Effect.succeed(80),
    rows: Effect.succeed(24),
    isTTY: Effect.succeed(true),
    display,
    readInput,
    readLine: Effect.succeed(''),
    inputKey,
    inputText,
  });
});

// =============================================================================
// Layer
// =============================================================================

export const layer = Layer.scoped(MockTerminal, make);

// =============================================================================
// Accessors
// =============================================================================

export const { columns, readInput, readLine } = Effect.serviceConstants(MockTerminal);
export const { inputKey, inputText } = Effect.serviceFunctions(MockTerminal);

// =============================================================================
// Utilities
// =============================================================================

const shouldQuit = (input: Terminal.UserInput): boolean =>
  input.key.ctrl && (input.key.name === 'c' || input.key.name === 'd');

const toUserInput = (
  key: string,
  modifiers: Partial<MockTerminal.Modifiers> = {}
): Terminal.UserInput => {
  const { ctrl = false, meta = false, shift = false } = modifiers;
  return {
    input: Option.some(key),
    key: { name: key, ctrl, meta, shift },
  };
};
