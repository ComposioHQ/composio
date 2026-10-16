import { describe, expect, it } from '@effect/vitest';
import { Cause, Effect } from 'effect';
import { generationOutcome } from 'src/effects/generation-runtime';
import {
  GenerateTypeFromJsonSchemaError,
  rehydrateGenerationError,
  SafeOutputPathError,
  TypeScriptTranspileError,
} from 'src/generation/errors';

// The companion module ships its own copy of the error classes, so what comes
// back is an instance of a class the CLI has never seen: same tag, same fields,
// same stack, but `instanceof` the CLI's class is false. This clone reproduces
// exactly that.
const foreign = <E extends Error & { readonly _tag: string }>(error: E): E => {
  const clone = Object.create(Error.prototype) as E;
  Object.getOwnPropertyNames(error).forEach(key =>
    Object.defineProperty(clone, key, Object.getOwnPropertyDescriptor(error, key)!)
  );
  // `stack` is a lazy accessor bound to the original instance; a real foreign
  // instance owns its own, so give the clone a plain copy.
  Object.defineProperty(clone, 'stack', { value: error.stack, configurable: true });
  Object.defineProperty(clone, '_tag', { value: error._tag, enumerable: true });
  return clone;
};

describe('generation-runtime', () => {
  describe('rehydrateGenerationError', () => {
    const cases = [
      new SafeOutputPathError({
        filename: '../x.ts',
        outputDir: '/out',
        resolvedPath: '/x.ts',
        message: 'escapes',
      }),
      new TypeScriptTranspileError({ message: 'compile failed', cause: 'TS1005' }),
      new GenerateTypeFromJsonSchemaError({ message: 'bad schema', cause: new Error('inner') }),
    ] as const;

    it.each(cases)(
      'rebuilds $_tag as an instance of the CLI class, keeping fields and stack',
      original => {
        const crossed = foreign(original);
        expect(crossed).not.toBeInstanceOf(original.constructor);

        const rehydrated = rehydrateGenerationError(crossed);
        expect(rehydrated).toBeInstanceOf(original.constructor);
        expect(rehydrated._tag).toBe(original._tag);
        expect(rehydrated.message).toBe(original.message);
        expect(rehydrated.stack).toBe(original.stack);
      }
    );
  });

  describe('generationOutcome', () => {
    it.effect('lifts a success outcome to the value', () =>
      Effect.gen(function* () {
        const value = yield* generationOutcome(() =>
          Promise.resolve({ _tag: 'Success' as const, value: 42 })
        );
        expect(value).toBe(42);
      })
    );

    it.effect('lifts a failure outcome to a typed failure of the CLI error class', () =>
      Effect.gen(function* () {
        const error = new TypeScriptTranspileError({ message: 'compile failed', cause: 'TS1005' });
        const failure = yield* generationOutcome(() =>
          Promise.resolve({ _tag: 'Failure' as const, error })
        ).pipe(Effect.flip);

        expect(failure).toBeInstanceOf(TypeScriptTranspileError);
        expect(failure.cause).toBe('TS1005');
      })
    );

    it.effect('keeps a rejected promise (a defect in the pipeline) as a defect', () =>
      Effect.gen(function* () {
        const boom = new Error('boom');
        const cause = yield* generationOutcome<number>(() => Promise.reject(boom)).pipe(
          Effect.sandbox,
          Effect.flip
        );

        expect(Cause.hasDies(cause)).toBe(true);
        expect(Cause.squash(cause)).toBe(boom);
      })
    );
  });
});
