import { Effect, FileSystem, Option } from 'effect';
import { CliError } from 'effect/unstable/cli';

import { readStdin, readStdinIfPiped } from 'src/effects/read-stdin';

type ResolveOptionalTextInputOptions = {
  readonly missingValue?: string;
};

export const resolveOptionalTextInput = (
  input: Option.Option<string>,
  options: ResolveOptionalTextInputOptions = {}
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    if (Option.isSome(input)) {
      const value = input.value.trim();
      if (value === '-') {
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
        return yield* fs.readFileString(filePath, 'utf-8');
      }
      return value;
    }

    const piped = yield* readStdinIfPiped;
    if (Option.isSome(piped)) {
      return piped.value;
    }

    return options.missingValue;
  });
