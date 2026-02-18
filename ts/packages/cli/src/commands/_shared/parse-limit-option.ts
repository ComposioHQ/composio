import { Data, Effect } from 'effect';
import { Option } from 'effect';

export class InvalidLimitError extends Data.TaggedError('commands/InvalidLimitError')<{
  readonly message: string;
}> {}

const MAX_LIMIT = 1000;

function toOptionalString(value: string | Option.Option<string> | undefined): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (value === undefined) {
    return undefined;
  }

  return Option.getOrUndefined(value);
}

export function parseLimitOption(
  value: string | Option.Option<string> | undefined
): Effect.Effect<number | undefined, Error> {
  const input = toOptionalString(value);
  if (input === undefined) {
    return Effect.succeed(undefined);
  }

  return Effect.gen(function* () {
    const parsedLimit = Number.parseInt(input, 10);
    const isInteger = Number.isInteger(parsedLimit);

    if (!isInteger || parsedLimit <= 0 || parsedLimit > MAX_LIMIT) {
      return yield* Effect.fail(
        new InvalidLimitError({
          message: `--limit must be an integer between 1 and ${MAX_LIMIT}`,
        })
      );
    }

    return parsedLimit;
  });
}
