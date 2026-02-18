import { Data, Effect } from 'effect';

export class JsonOptionParseError extends Data.TaggedError('commands/JsonOptionParseError')<{
  readonly optionName: string;
  readonly message: string;
}> {}

export function parseJsonOption(optionName: string, value: string): Effect.Effect<unknown, Error> {
  return Effect.try({
    try: () => JSON.parse(value) as unknown,
    catch: error =>
      new JsonOptionParseError({
        optionName,
        message: `Failed to parse --${optionName}: ${String(error)}`,
      }),
  });
}

export function parseJsonObjectOption(
  optionName: string,
  value: string
): Effect.Effect<Record<string, unknown>, Error> {
  return parseJsonOption(optionName, value).pipe(
    Effect.flatMap(parsed => {
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return Effect.succeed(parsed as Record<string, unknown>);
      }

      return Effect.fail(
        new JsonOptionParseError({
          optionName,
          message: `Expected --${optionName} to be a JSON object`,
        })
      );
    })
  );
}
