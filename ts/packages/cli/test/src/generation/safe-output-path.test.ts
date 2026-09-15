import path from 'node:path';
import { describe, expect, it, assert } from '@effect/vitest';
import * as BunPath from '@effect/platform-bun/BunPath';
import { Effect, Result } from 'effect';
import { safeOutputPath, SafeOutputPathError } from 'src/generation/safe-output-path';

describe('safeOutputPath', () => {
  it.effect(
    '[Given] a relative output directory and normal filename [Then] it returns a path in the same coordinate space',
    Effect.fn(function* () {
      const outputDir = 'generated';
      const filePath = yield* safeOutputPath(outputDir, 'gmail.ts');

      expect(filePath).toBe(path.join(outputDir, 'gmail.ts'));
      expect(path.isAbsolute(filePath)).toBe(false);
    }, Effect.provide(BunPath.layer))
  );

  it.effect(
    '[Given] an absolute generated filename [Then] it fails through the Effect error channel',
    Effect.fn(function* () {
      const result = yield* safeOutputPath('generated', path.resolve('gmail.ts')).pipe(
        Effect.result
      );

      assert(Result.isFailure(result));
      expect(result.failure).toBeInstanceOf(SafeOutputPathError);
      expect(result.failure.filename).toBe(path.resolve('gmail.ts'));
    }, Effect.provide(BunPath.layer))
  );

  it.effect(
    '[Given] a parent-directory generated filename [Then] it fails through the Effect error channel',
    Effect.fn(function* () {
      const result = yield* safeOutputPath('generated', '../gmail.ts').pipe(Effect.result);

      assert(Result.isFailure(result));
      expect(result.failure).toBeInstanceOf(SafeOutputPathError);
      expect(result.failure.filename).toBe('../gmail.ts');
    }, Effect.provide(BunPath.layer))
  );
});
