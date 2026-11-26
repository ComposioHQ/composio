/**
 * `z` inside a `composio run` script. zod cannot run inside the VM (it needs `Symbol()`), so the
 * schemas live here, in the host, and the script holds handles to them: plain data with an id and
 * the schema's method names, which the prelude turns into callable objects. A method call crosses
 * as `(id, method, args)`, and a schema inside its arguments arrives as its handle.
 *
 * What cannot cross is a function: `refine`, `transform`, `superRefine`, and `preprocess` with a
 * callback fail with a message in the prelude.
 */
import { Result } from 'effect';
import { z } from 'zod';

type Handle = { readonly __zid: number; readonly __zmethods: ReadonlyArray<string> };

/** Namespaces of zod factories, such as `z.coerce.number()`. */
const GROUPS = ['coerce', 'iso'] as const;

const methodNames = (schema: object): ReadonlyArray<string> => {
  const names = new Set<string>();
  let prototype: unknown = schema;
  while (prototype !== null && prototype !== Object.prototype && typeof prototype === 'object') {
    for (const name of Object.getOwnPropertyNames(prototype)) {
      if (name === 'constructor' || name.startsWith('_') || name.startsWith('~')) continue;
      // Some of zod's accessors throw for schemas they do not apply to.
      const value = Result.getOrUndefined(Result.try(() => Reflect.get(schema, name) as unknown));
      if (typeof value === 'function') names.add(name);
    }
    prototype = Object.getPrototypeOf(prototype);
  }
  return [...names];
};

const functionNames = (namespace: object): ReadonlyArray<string> =>
  Object.keys(namespace).filter(
    name => /^[a-z]/.test(name) && typeof Reflect.get(namespace, name) === 'function'
  );

const issuesOf = (error: z.ZodError) => error.issues.map(issue => ({ ...issue }));

export const makeZodBridge = () => {
  const schemas = new Map<number, z.ZodType>();
  let nextId = 1;

  const toHandle = (value: unknown): unknown => {
    if (value instanceof z.ZodType) {
      const id = nextId++;
      schemas.set(id, value);
      return { __zid: id, __zmethods: methodNames(value) } satisfies Handle;
    }
    return value;
  };

  const fromHandles = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(fromHandles);
    if (
      typeof value === 'object' &&
      value !== null &&
      Object.getPrototypeOf(value) === Object.prototype
    ) {
      const id: unknown = Reflect.get(value, '__zid');
      if (typeof id === 'number') return schemas.get(id);
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, fromHandles(entry)])
      );
    }
    return value;
  };

  const resolve = (
    id: number,
    method: string
  ): { readonly target: object; readonly fn: unknown } => {
    if (id !== 0) {
      const schema = schemas.get(id);
      if (!schema) throw new Error('z: this schema is no longer available.');
      return { target: schema, fn: Reflect.get(schema, method) };
    }
    const [group, name] = method.includes('.') ? method.split('.', 2) : [undefined, method];
    const target: unknown = group === undefined ? z : Reflect.get(z, group);
    if (typeof target !== 'object' || target === null || name === undefined) {
      throw new Error(`z.${method} is not available.`);
    }
    return { target, fn: Reflect.get(target, name) };
  };

  /** Calls one zod method, and answers with data: a handle, a value, or a ZodError's details. */
  const call = (id: number, method: string, args: ReadonlyArray<unknown>) =>
    Result.match(
      Result.try(() => {
        const { target, fn } = resolve(id, method);
        if (typeof fn !== 'function') throw new TypeError(`z: ${method} is not a function.`);
        return Reflect.apply(fn, target, fromHandles(args) as Array<unknown>) as unknown;
      }),
      {
        onSuccess: result => answer(method, result),
        onFailure: failure,
      }
    );

  const answer = (method: string, result: unknown) => {
    if (method === 'safeParse' && typeof result === 'object' && result !== null) {
      const parsed = result as z.ZodSafeParseResult<unknown>;
      return {
        ok: true,
        value: parsed.success
          ? { success: true, data: parsed.data }
          : {
              success: false,
              error: {
                name: 'ZodError',
                message: parsed.error.message,
                issues: issuesOf(parsed.error),
              },
            },
      };
    }
    return { ok: true, value: toHandle(result) };
  };

  const failure = (error: unknown) => {
    if (error instanceof z.ZodError) {
      return {
        ok: false,
        error: { name: 'ZodError', message: error.message, props: { issues: issuesOf(error) } },
      };
    }
    return {
      ok: false,
      error: {
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : String(error),
        props: {},
      },
    };
  };

  const keys = {
    root: functionNames(z),
    groups: Object.fromEntries(
      GROUPS.map(group => {
        const namespace: unknown = Reflect.get(z, group);
        return [
          group,
          typeof namespace === 'object' && namespace !== null ? functionNames(namespace) : [],
        ];
      })
    ),
  };

  return { keys, call };
};
