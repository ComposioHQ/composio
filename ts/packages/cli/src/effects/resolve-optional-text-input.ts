import { Effect, FileSystem, Option } from 'effect';
import { CliError } from 'effect/cli';

import { readStdin } from 'src/effects/read-stdin';

/**
 * Resolves an input flag such as `-d`: `-` or `@-` reads stdin to its end, `@path` reads the
 * file, anything else is the value itself. No flag means no input; stdin is never read then.
 */
export const resolveExplicitTextInput = (input: Option.Option<string>) =>
  Effect.gen(function* () {
    if (Option.isNone(input)) {
      return undefined;
    }
    const value = input.value.trim();
    if (value === '-' || value === '@-') {
      return yield* readStdin;
    }
    if (value.startsWith('@')) {
      const filePath = value.slice(1).trim();
      if (!filePath) {
        return yield* Effect.fail(
          new CliError.InvalidValue({
            option: 'data',
            value,
            expected: 'a file path after "@"',
            kind: 'flag',
          })
        );
      }
      const fs = yield* FileSystem.FileSystem;
      return yield* fs.readFileString(filePath, 'utf-8');
    }
    return value;
  });
