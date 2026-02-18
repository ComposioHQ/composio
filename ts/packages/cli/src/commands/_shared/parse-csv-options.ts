import { Option } from 'effect';

function toOptionalString(value: string | Option.Option<string> | undefined): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (value === undefined) {
    return undefined;
  }

  return Option.getOrUndefined(value);
}

export function parseCsvOption(
  value: string | Option.Option<string> | undefined
): ReadonlyArray<string> {
  const input = toOptionalString(value);
  if (input === undefined) {
    return [];
  }

  return input
    .split(',')
    .map(token => token.trim())
    .filter(token => token.length > 0);
}

export function parseCsvOptionUppercase(
  value: string | Option.Option<string> | undefined
): ReadonlyArray<string> {
  return parseCsvOption(value).map(token => token.toUpperCase());
}
