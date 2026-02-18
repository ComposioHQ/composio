import { Data, Effect, Option } from 'effect';

export class InvalidBooleanOptionError extends Data.TaggedError(
  'commands/InvalidBooleanOptionError'
)<{
  readonly optionName: string;
  readonly message: string;
}> {}

function toOptionalString(value: string | Option.Option<string> | undefined): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (value === undefined) {
    return undefined;
  }

  return Option.getOrUndefined(value);
}

const TRUE_VALUES = new Set(['true', '1']);
const FALSE_VALUES = new Set(['false', '0']);

export function parseBooleanOption(
  optionName: string,
  value: string | Option.Option<string> | undefined
): Effect.Effect<boolean | undefined, Error> {
  const input = toOptionalString(value);
  if (input === undefined) {
    return Effect.succeed(undefined);
  }

  const normalized = input.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) {
    return Effect.succeed(true);
  }
  if (FALSE_VALUES.has(normalized)) {
    return Effect.succeed(false);
  }

  return Effect.fail(
    new InvalidBooleanOptionError({
      optionName,
      message: `Invalid --${optionName} value "${input}". Expected one of: true, false, 1, 0.`,
    })
  );
}
