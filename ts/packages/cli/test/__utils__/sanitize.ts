import { pipe, Effect, String } from 'effect';
import { getVersion } from 'src/effects/version';

export const sanitize = (str: string) =>
  Effect.gen(function* () {
    const version = yield* getVersion;

    return pipe(str, String.replaceAll(version, '<VERSION>'));
  });
