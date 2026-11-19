import { Effect } from 'effect';
import { Stdin } from 'src/services/stdin';

/** Reads stdin to its end, however long that takes; for an explicit `-d -`. */
export const readStdin = Effect.gen(function* () {
  const stdin = yield* Stdin;
  return yield* stdin.readAll();
});
