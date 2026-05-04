import { Effect, Option } from 'effect';
import { Stdin } from 'src/services/stdin';

export const readStdin = Effect.gen(function* () {
  const stdin = yield* Stdin;
  return yield* stdin.readAll();
});

export const readStdinIfPiped = Effect.gen(function* () {
  const stdin = yield* Stdin;
  if (stdin.isTTY()) {
    return Option.none<string>();
  }
  const data = yield* stdin.readAll();
  return Option.some(data);
});
