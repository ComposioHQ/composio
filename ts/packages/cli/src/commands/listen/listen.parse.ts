import { Effect, Predicate, Result } from 'effect';
import { commandInputError } from 'src/commands/errors';
import { parseJsonRecord } from 'src/utils/parse-json';

const invalidOptionValue = commandInputError('listen');

export const parseCreateParams = (raw: string) =>
  parseJsonRecord(raw).pipe(
    Result.mapError(error =>
      invalidOptionValue(
        error.reason === 'not-a-record'
          ? "Expected --params to be an object, e.g. -p '{ trigger_config: { ... } }'."
          : "Invalid --params input. Provide JSON or a JS-style object literal, e.g. -p '{ trigger_config: { ... } }'.",
        '--params'
      )
    )
  );

export const parseStreamPath = (expression: string) =>
  Effect.gen(function* () {
    const trimmed = expression.trim();
    const pathTokens: Array<string | number> = [];
    // An empty --stream streams the whole event.
    if (trimmed.length === 0) return pathTokens;
    if (!trimmed.startsWith('.')) {
      return yield* Effect.fail(
        invalidOptionValue(
          'Expected --stream to contain a jq-like path starting with "."',
          '--stream'
        )
      );
    }

    const tokenPattern = /(?:\.([A-Za-z0-9_-]+))|(?:\[(\d+)\])/g;
    let lastIndex = 0;

    for (const match of trimmed.matchAll(tokenPattern)) {
      if ((match.index ?? -1) !== lastIndex) {
        return yield* Effect.fail(
          invalidOptionValue(
            'Unsupported --stream expression. Use a jq-like path such as ".foo.bar" or ".items[0].id".',
            '--stream'
          )
        );
      }

      if (match[1]) pathTokens.push(match[1]);
      if (match[2]) pathTokens.push(Number(match[2]));
      lastIndex += match[0].length;
    }

    if (lastIndex !== trimmed.length) {
      return yield* Effect.fail(
        invalidOptionValue(
          'Unsupported --stream expression. Use a jq-like path such as ".foo.bar" or ".items[0].id".',
          '--stream'
        )
      );
    }

    return pathTokens;
  });

export const applyStreamPath = (
  value: unknown,
  pathTokens: ReadonlyArray<string | number>
): unknown => {
  let current = value;
  for (const token of pathTokens) {
    if (typeof token === 'number') {
      if (!Array.isArray(current) || token < 0 || token >= current.length) {
        return undefined;
      }
      current = current[token];
      continue;
    }

    if (!Predicate.isObject(current)) {
      return undefined;
    }

    current = current[token];
  }

  return current;
};

const TIMEOUT_UNITS_MS: Record<string, number> = {
  ms: 1,
  millisecond: 1,
  milliseconds: 1,
  s: 1_000,
  sec: 1_000,
  secs: 1_000,
  second: 1_000,
  seconds: 1_000,
  m: 60_000,
  min: 60_000,
  mins: 60_000,
  minute: 60_000,
  minutes: 60_000,
  h: 3_600_000,
  hr: 3_600_000,
  hrs: 3_600_000,
  hour: 3_600_000,
  hours: 3_600_000,
  d: 86_400_000,
  day: 86_400_000,
  days: 86_400_000,
};

export const parseTimeoutMs = (value: string) =>
  Effect.gen(function* () {
    const trimmed = value.trim().toLowerCase();
    const match = /^(\d+(?:\.\d+)?)\s*([a-z]+)$/.exec(trimmed);
    const amount = Number(match?.[1]);
    const unit = match?.[2];
    const unitMs = unit === undefined ? undefined : TIMEOUT_UNITS_MS[unit];
    if (!match || !Number.isFinite(amount) || amount <= 0 || unitMs === undefined) {
      return yield* Effect.fail(
        invalidOptionValue(
          'Invalid --timeout value. Use a duration such as "30s", "5m", "1hr", or "1day".',
          '--timeout'
        )
      );
    }

    return Math.round(amount * unitMs);
  });
