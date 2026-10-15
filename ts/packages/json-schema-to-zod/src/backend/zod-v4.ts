import * as z from 'zod/v4';

import type {
  Decorations,
  IssueSink,
  ObjectPolicy,
  RunFailure,
  RunResult,
  StringFormat,
  WholeSchemaGuard,
  ZodBackend,
} from './types';

type S = z.ZodType;

type Payload = { value: unknown; issues: unknown[] };
type RunContext = { readonly direction?: 'forward' | 'backward' };
type RunFn = (payload: Payload, ctx: RunContext) => Payload | Promise<Payload>;
type SchemaDef = Record<string, unknown>;
type InstrumentedDef = SchemaDef & { wholeSchemaGuard?: WholeSchemaGuard };
type SchemaConstructor = { new (def: SchemaDef): S };
type Internals = {
  def: InstrumentedDef;
  constr: SchemaConstructor;
  run: RunFn;
};

const internals = (schema: S): Internals => (schema as unknown as { _zod: Internals })._zod;

const isUnmergeable = (error: unknown): error is Error =>
  error instanceof Error && error.message.startsWith('Unmergable intersection');

const instrumentedClasses = new WeakMap<SchemaConstructor, SchemaConstructor>();
const baseClasses = new WeakMap<SchemaConstructor, SchemaConstructor>();

/**
 * A constructor that builds the schema with its own class and then wraps its
 * `_zod.run`. Zod's `clone()` calls `new inst._zod.constr(def)`, so pointing
 * `constr` at this wrapper keeps the behavior through `.describe()`,
 * `.meta()`, `.check()`, and the clones frameworks make. The schema keeps
 * its class: a guarded object is still a `ZodObject` with a `shape`.
 *
 * The wrapper reads its configuration from the definition on every run:
 * `wholeSchemaGuard` checks the source value before the base parse, and an
 * intersection turns the exception zod throws for values its branches
 * cannot merge into an issue, as v3 reports it.
 */
const instrumentedClass = (Base: SchemaConstructor): SchemaConstructor => {
  const cached = instrumentedClasses.get(Base);
  if (cached) {
    return cached;
  }

  function Instrumented(def: SchemaDef): S {
    const inst = new Base(def);
    const zod = internals(inst);
    zod.constr = Instrumented as unknown as SchemaConstructor;
    const runAsBase = zod.run;
    zod.run = (payload, ctx) => {
      const guard = zod.def.wholeSchemaGuard;
      if (guard !== undefined && ctx.direction !== 'backward') {
        const failure = guard(payload.value);
        if (failure !== undefined) {
          payload.issues.push({
            code: 'custom',
            message: failure,
            input: payload.value,
            inst,
            path: [],
          });
          return payload;
        }
      }
      if (zod.def.type !== 'intersection') {
        return runAsBase(payload, ctx);
      }
      try {
        return runAsBase(payload, ctx);
      } catch (error) {
        if (!isUnmergeable(error)) {
          throw error;
        }
        payload.issues.push({
          code: 'custom',
          message: error.message,
          input: payload.value,
          inst,
          path: [],
        });
        return payload;
      }
    };
    return inst;
  }

  const constructor = Instrumented as unknown as SchemaConstructor;
  instrumentedClasses.set(Base, constructor);
  instrumentedClasses.set(constructor, constructor);
  baseClasses.set(constructor, Base);
  return constructor;
};

/** `schema` rebuilt through the instrumented constructor with `def`, keeping its registry metadata. */
const rebuild = (schema: S, def: InstrumentedDef): S => {
  const zod = internals(schema);
  const Base = baseClasses.get(zod.constr) ?? zod.constr;
  const rebuilt = new (instrumentedClass(Base))(def);
  const meta = z.globalRegistry.get(schema);
  if (meta) {
    z.globalRegistry.add(rebuilt, meta);
  }
  return rebuilt;
};

const attachGuard = (schema: S, guard: WholeSchemaGuard): S => {
  const zod = internals(schema);
  const innerGuard = zod.def.wholeSchemaGuard;
  const wholeSchemaGuard: WholeSchemaGuard = innerGuard
    ? value => guard(value) ?? innerGuard(value)
    : guard;
  return rebuild(schema, z.core.util.mergeDefs(zod.def, { wholeSchemaGuard }) as InstrumentedDef);
};

const intersection = (left: S, right: S): S => {
  const schema = z.intersection(left, right);
  return rebuild(schema, internals(schema).def);
};

/** Wrappers carry the inner description, as every v3 wrapper does through its `_def`. */
const carryDescription = (inner: S, wrapper: S): S => {
  const description = z.globalRegistry.get(inner)?.description;
  if (description !== undefined) {
    z.globalRegistry.add(wrapper, { description });
  }
  return wrapper;
};

const withPath = (path: ReadonlyArray<string | number> | undefined) =>
  path === undefined ? {} : { path: [...path] };

type RawIssue = Record<string, unknown>;

/** Issues pushed onto a check payload; the enclosing schemas prefix the path. */
const sinkFor = (push: (issue: RawIssue) => void): IssueSink => ({
  custom(message, options) {
    push({
      code: 'custom',
      message,
      ...withPath(options?.path),
      ...(options?.params === undefined ? {} : { params: options.params }),
    });
  },
  unrecognizedKeys(keys, message, options) {
    push({ code: 'unrecognized_keys', keys: [...keys], message, ...withPath(options?.path) });
  },
  invalidUnion(message, failures, options) {
    push({
      code: 'invalid_union',
      errors: failures.map(failure => [...failure.issues]),
      message,
      ...withPath(options?.path),
    });
  },
  forward(failure) {
    for (const issue of failure.issues) {
      push({ ...(issue as RawIssue) });
    }
  },
});

let ipProbes: readonly S[] | undefined;
let urlProbe: S | undefined;

const isIp = (value: string): boolean => {
  ipProbes ??= [z.ipv4(), z.ipv6()];
  return ipProbes.some(probe => probe.safeParse(value).success);
};

const isUrl = (value: string): boolean => {
  urlProbe ??= z.url();
  return urlProbe.safeParse(value).success;
};

const stringFormat = (schema: S, format: StringFormat, message?: string): S => {
  const string = schema as z.ZodString;
  switch (format) {
    case 'email':
      return string.email(message);
    case 'ip':
      // v4 has no combined check, and a refinement keeps the value untouched.
      return string.refine(isIp, message);
    case 'ipv4':
      return string.ipv4(message);
    case 'ipv6':
      return string.ipv6(message);
    case 'uri':
      // `.url()` rewrites the value it accepts; a refinement over the same
      // check keeps the input as given, as v3 does.
      return string.refine(isUrl, message);
    case 'uuid':
      // v3's uuid pattern is v4's guid: the RFC variant bits are not enforced.
      return string.guid(message);
    case 'date-time':
      return string.datetime({ offset: true, error: message });
    case 'time':
      return string.time(message);
    case 'date':
      return string.date(message);
    case 'duration':
      return string.duration(message);
  }
};

const object = (shape: Readonly<Record<string, S>>, policy: ObjectPolicy<S>): S => {
  const base = z.object(shape);
  switch (policy.kind) {
    case 'strict':
      return base.strict();
    case 'loose':
      return base.passthrough();
    case 'catchall':
      return base.catchall(policy.schema);
  }
};

const run = (schema: S, value: unknown): RunResult => {
  const result = schema.safeParse(value);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, failure: result.error as RunFailure };
};

/** Zod v4 output: metadata in the global registry, refinements as checks, the guard as a run wrapper. */
export const zodV4Backend: ZodBackend<S> = {
  id: 'zod-v4',

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
  // `z.custom()` cannot be rendered as JSON Schema; a refined `any` can.
  predicate: test => z.any().refine(test),

  stringFormat,
  base64: (schema, message) => (schema as z.ZodString).base64(message),
  regex: (schema, pattern, message) => (schema as z.ZodString).regex(pattern, message),

  // Native `.int()` is a safe-integer check that also emits ±2^53-1 bounds;
  // JSON Schema integers, v3, and Ajv accept any integral number.
  integer: (schema, message) => schema.refine(value => Number.isInteger(value), message),
  bound: (schema, kind, value, message) => (schema as z.ZodNumber)[kind](value, message),

  array: item => z.array(item),
  minItems: (schema, count, message) => (schema as z.ZodArray<S>).min(count, message),
  maxItems: (schema, count, message) => (schema as z.ZodArray<S>).max(count, message),
  tuple: (items, rest) => {
    const tuple = z.tuple(items as unknown as [S]);
    return rest === undefined ? tuple : tuple.rest(rest);
  },

  object,
  record: value => z.record(z.string(), value),

  union: options => z.union(options as unknown as [S, S]),
  intersection,

  optional: schema => carryDescription(schema, schema.optional()),
  nullable: schema => carryDescription(schema, schema.nullable()),
  // `.default()` short-circuits past the inner schema; `.prefault()` parses the default through it, as v3 does.
  withDefault: (schema, value) => carryDescription(schema, schema.prefault(value)),
  readonly: schema => carryDescription(schema, schema.readonly()),
  decorate: (schema, decorations: Decorations) =>
    decorations.description === undefined ? schema : schema.describe(decorations.description),

  refine: <T>(schema: S, test: (value: T) => boolean, message?: string) =>
    schema.refine(value => test(value as T), message),
  superRefine: <T>(schema: S, check: (value: T, issues: IssueSink) => void) =>
    schema.superRefine((value, ctx) =>
      check(
        value as T,
        sinkFor(issue => ctx.addIssue(issue as unknown as z.core.$ZodRawIssue))
      )
    ),
  // A check that replaces the payload value keeps the schema's kind, where
  // `.transform()` would produce a pipe that cannot be rendered as JSON Schema.
  rewrite: <T>(schema: S, fn: (value: T, issues: IssueSink) => unknown) =>
    schema.check(payload => {
      const sink = sinkFor(issue =>
        payload.issues.push({
          input: payload.value,
          continue: true,
          ...issue,
        } as unknown as z.core.$ZodRawIssue)
      );
      payload.value = fn(payload.value as T, sink);
    }),

  run,
  attachGuard,
};
