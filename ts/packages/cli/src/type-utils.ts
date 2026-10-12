import type { Command } from 'effect/cli';

export type GetCmdParams<T> =
  T extends Command.Command<
    infer _Name extends string,
    infer P,
    infer _ContextInput,
    infer _E,
    infer _R
  >
    ? P
    : never;
