import * as z from 'zod/v3';

import type { Decorations, IssueSink, StringFormat, WholeSchemaGuard, ZodBackend } from './types';
import {
  applyObjectPolicy,
  buildTuple,
  composeGuards,
  run,
  withPath,
  RFC3339_TIME,
} from './shared';

type S = z.ZodTypeAny;

type GuardedDef = z.ZodTypeDef & { wholeSchemaGuard?: WholeSchemaGuard };
type ZodSchemaClass = {
  new (def: z.ZodTypeDef): z.ZodTypeAny;
  prototype: z.ZodTypeAny;
};

const guardedSchemaClasses = new WeakMap<ZodSchemaClass, ZodSchemaClass>();

/**
 * A subclass of the parsed schema's own class that checks the source value
 * against the guard before parsing it. Keeping the class, rather than wrapping
 * it in a pipeline, keeps the schema's kind: a guarded object is still a
 * `ZodObject` with a `shape`, which is what zod-to-json-schema and the MCP SDK
 * need to emit a root `type: "object"` for LLM tool parameters. The guard lives
 * on `_def`, so copies such as `.describe()` keep it.
 */
const guardedSchemaClass = (Base: ZodSchemaClass): ZodSchemaClass => {
  const cached = guardedSchemaClasses.get(Base);
  if (cached) {
    return cached;
  }

  const parseAsBase = Base.prototype._parse;
  class Guarded extends Base {
    override _parse(input: z.ParseInput): z.ParseReturnType<unknown> {
      const failure = (this._def as GuardedDef).wholeSchemaGuard?.(input.data);
      if (failure === undefined) {
        return parseAsBase.call(this, input);
      }
      z.addIssueToContext(this._getOrReturnCtx(input), {
        code: z.ZodIssueCode.custom,
        message: failure,
      });
      return z.DIRTY(input.data);
    }
  }
  guardedSchemaClasses.set(Base, Guarded);
  // Guarding an already guarded schema reuses its class and composes guards.
  guardedSchemaClasses.set(Guarded, Guarded);
  return Guarded;
};

const attachGuard = (schema: S, guard: WholeSchemaGuard): S => {
  // Validate the source value before defaults and other Zod transforms run.
  // Otherwise a missing required field can be synthesized and incorrectly
  // appear valid to the JSON Schema interpreter.
  const wholeSchemaGuard = composeGuards(guard, (schema._def as GuardedDef).wholeSchemaGuard);

  const Guarded = guardedSchemaClass(schema.constructor as ZodSchemaClass);
  return new Guarded({ ...schema._def, wholeSchemaGuard } as GuardedDef);
};

/** Issues raised through the refinement context; Zod prefixes the context path itself. */
const sink = (ctx: z.RefinementCtx): IssueSink => ({
  custom(message, options) {
    ctx.addIssue({
      ...withPath(options?.path),
      code: z.ZodIssueCode.custom,
      message,
      ...(options?.params === undefined ? {} : { params: options.params }),
    });
  },
  unrecognizedKeys(keys, message, options) {
    ctx.addIssue({
      ...withPath(options?.path),
      code: z.ZodIssueCode.unrecognized_keys,
      keys: [...keys],
      message,
    });
  },
  invalidUnion(message, failures, options) {
    ctx.addIssue({
      ...withPath(options?.path),
      code: z.ZodIssueCode.invalid_union,
      unionErrors: failures as z.ZodError[],
      message,
    });
  },
  forward(failure) {
    for (const issue of failure.issues) {
      ctx.addIssue(issue as z.ZodIssue);
    }
  },
});

const stringFormat = (schema: S, format: StringFormat, message?: string): S => {
  const string = schema as z.ZodString;
  switch (format) {
    case 'email':
      return string.email(message);
    case 'ip':
      return string.ip(message);
    case 'ipv4':
      return string.ip({ version: 'v4', message });
    case 'ipv6':
      return string.ip({ version: 'v6', message });
    case 'uri':
      return string.url(message);
    case 'uuid':
      return string.uuid(message);
    case 'date-time':
      return string.datetime({ offset: true, message });
    case 'time':
      return string.regex(RFC3339_TIME, message ?? 'Invalid time');
    case 'date':
      return string.date(message);
    case 'duration':
      return string.duration(message);
  }
};

/** Zod v3 output: descriptions on `_def`, refinements as `ZodEffects`, the guard as a subclass. */
export const zodV3Backend: ZodBackend<S> = {
  isSchema: (value): value is S => value instanceof z.ZodType,
  isNever: schema => schema instanceof z.ZodNever,

  any: () => z.any(),
  never: () => z.never(),
  boolean: () => z.boolean(),
  null: () => z.null(),
  string: () => z.string(),
  number: () => z.number(),
  literal: value => z.literal(value),
  enum: values => z.enum(values as [string, ...string[]]),
  predicate: test => z.custom(test),

  stringFormat,
  base64: (schema, message) => (schema as z.ZodString).base64(message),
  regex: (schema, pattern, message) => (schema as z.ZodString).regex(pattern, message),

  integer: (schema, message) => (schema as z.ZodNumber).int(message),
  bound: (schema, kind, value, message) => (schema as z.ZodNumber)[kind](value, message),

  array: item => z.array(item),
  minItems: (schema, count, message) => (schema as z.ZodArray<S>).min(count, message),
  maxItems: (schema, count, message) => (schema as z.ZodArray<S>).max(count, message),
  tuple: (items, rest) => buildTuple<S>(z.tuple(items as unknown as [S]), rest),

  object: (shape, policy) => applyObjectPolicy<S>(z.object(shape), policy),
  record: value => z.record(value),

  union: options => z.union(options as unknown as [S, S]),
  intersection: (left, right) => z.intersection(left, right),

  optional: schema => schema.optional(),
  nullable: schema => schema.nullable(),
  withDefault: (schema, value) => schema.default(value),
  readonly: schema => schema.readonly(),
  decorate: (schema, decorations: Decorations) =>
    decorations.description === undefined ? schema : schema.describe(decorations.description),

  refine: (schema, test, message) => schema.refine(test, { message }),
  superRefine: (schema, check) => schema.superRefine((value, ctx) => check(value, sink(ctx))),
  rewrite: (schema, fn) => schema.transform((value, ctx) => fn(value, sink(ctx))),

  run,
  attachGuard,
};
