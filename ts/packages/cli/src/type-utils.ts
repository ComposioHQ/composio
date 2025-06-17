import type { Command } from '@effect/cli';

export type GetCmdParams<T> =
  T extends Command.Command<infer _Name extends string, unknown, unknown, infer P> ? P : never;
