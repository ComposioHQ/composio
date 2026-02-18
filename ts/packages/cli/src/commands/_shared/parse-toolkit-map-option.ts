import { Data, Effect, Option } from 'effect';
import { parseCsvOption } from './parse-csv-options';

export class ToolkitMapOptionParseError extends Data.TaggedError(
  'commands/ToolkitMapOptionParseError'
)<{
  readonly optionName: string;
  readonly message: string;
}> {}

function normalizeToolkitSlug(input: string): string {
  return input.trim().toLowerCase();
}

function toOptionalString(value: string | Option.Option<string> | undefined): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (value === undefined) {
    return undefined;
  }

  return Option.getOrUndefined(value);
}

export function parseToolkitMapOption(
  optionName: string,
  value: string | Option.Option<string> | undefined
): Effect.Effect<Record<string, string> | undefined, Error> {
  const input = toOptionalString(value);
  if (input === undefined) {
    return Effect.succeed(undefined);
  }

  return Effect.gen(function* () {
    const tokens = parseCsvOption(input);
    const map: Record<string, string> = {};

    for (const token of tokens) {
      const [toolkitToken, mappedId, extraToken] = token.split('<>');
      const toolkitSlug = toolkitToken?.trim();
      const valueId = mappedId?.trim();

      if (!toolkitSlug || !valueId || extraToken !== undefined) {
        return yield* Effect.fail(
          new ToolkitMapOptionParseError({
            optionName,
            message: `Invalid --${optionName} entry "${token}". Expected format: toolkit<>id (comma-separated).`,
          })
        );
      }

      map[normalizeToolkitSlug(toolkitSlug)] = valueId;
    }

    return Object.keys(map).length > 0 ? map : undefined;
  });
}
