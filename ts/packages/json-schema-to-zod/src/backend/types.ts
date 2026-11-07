import type { Serializable } from '../types';

/** String formats the string parser asserts; every other `format` is an annotation. */
export const ASSERTED_STRING_FORMATS = [
  'email',
  'ip',
  'ipv4',
  'ipv6',
  'uri',
  'uuid',
  'date-time',
  'time',
  'date',
  'duration',
] as const;

export type StringFormat = (typeof ASSERTED_STRING_FORMATS)[number];

export type NumberBound = 'gt' | 'gte' | 'lt' | 'lte';

export type ObjectPolicy<S> =
  | { readonly kind: 'strict' }
  | { readonly kind: 'loose' }
  | { readonly kind: 'catchall'; readonly schema: S };

/** A failed run: the backend's own error object, which always carries `issues`. */
export type RunFailure = { readonly issues: ReadonlyArray<unknown> };

export type RunResult =
  | { readonly success: true; readonly data: unknown }
  | { readonly success: false; readonly failure: RunFailure };

/** Returns the failure message, or `undefined` when the value satisfies the schema. */
export type WholeSchemaGuard = (value: unknown) => string | undefined;

/** An issue path relative to the refined schema. */
export type RelativePath = ReadonlyArray<string | number>;

/**
 * Issues reported from inside a refinement. Paths are relative to the refined
 * schema; an omitted path means the schema's own location.
 */
export interface IssueSink {
  custom(
    message: string,
    options?: { readonly path?: RelativePath; readonly params?: Record<string, unknown> }
  ): void;
  unrecognizedKeys(
    keys: readonly string[],
    message: string,
    options?: { readonly path?: RelativePath }
  ): void;
  invalidUnion(
    message: string,
    failures: readonly RunFailure[],
    options?: { readonly path?: RelativePath }
  ): void;
  /** Re-emits every issue of a failed `run()`, keeping their relative paths. */
  forward(failure: RunFailure): void;
}

export interface Decorations {
  readonly description?: string;
  /** JSON Schema annotations to carry on the schema; ignored by backends that cannot. */
  readonly annotations?: Readonly<Record<string, Serializable>>;
}

/**
 * The Zod vocabulary one builder speaks. The JSON Schema semantics live in
 * the shared parsers, which only ever call these operations on the opaque
 * schema type `S`.
 */
export interface ZodBackend<S> {
  /** Whether a `parserOverride` result is a schema of this backend. */
  isSchema(value: unknown): value is S;
  isNever(schema: S): boolean;

  any(): S;
  never(): S;
  boolean(): S;
  null(): S;
  string(): S;
  number(): S;
  literal(value: string | number | boolean | null): S;
  enum(values: readonly [string, ...string[]]): S;
  /** A schema accepting whatever `test` admits. It must stay JSON-Schema-serializable. */
  predicate(test: (value: unknown) => boolean): S;

  stringFormat(schema: S, format: StringFormat, message?: string): S;
  base64(schema: S, message?: string): S;
  regex(schema: S, pattern: RegExp, message?: string): S;

  integer(schema: S, message?: string): S;
  bound(schema: S, kind: NumberBound, value: number, message?: string): S;

  array(item: S): S;
  minItems(schema: S, count: number, message?: string): S;
  maxItems(schema: S, count: number, message?: string): S;
  tuple(items: readonly S[], rest: S | undefined): S;

  object(shape: Readonly<Record<string, S>>, policy: ObjectPolicy<S>): S;
  record(value: S): S;

  union(options: readonly [S, S, ...S[]]): S;
  intersection(left: S, right: S): S;

  optional(schema: S): S;
  nullable(schema: S): S;
  withDefault(schema: S, value: unknown): S;
  readonly(schema: S): S;
  decorate(schema: S, decorations: Decorations): S;

  refine<T>(schema: S, test: (value: T) => boolean, message?: string): S;
  superRefine<T>(schema: S, check: (value: T, issues: IssueSink) => void): S;
  /** Replaces the parsed value; the backend keeps the schema's kind where it can. */
  rewrite<T>(schema: S, fn: (value: T, issues: IssueSink) => unknown): S;

  run(schema: S, value: unknown): RunResult;
  /** Checks the source value before the schema parses it. Composes with an existing guard: own first, then inner. */
  attachGuard(schema: S, guard: WholeSchemaGuard): S;
}
