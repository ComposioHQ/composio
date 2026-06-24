import path from 'node:path';
import { describe, expect, it, assert } from '@effect/vitest';
import { Effect, Either } from 'effect';
import { safeOutputPath, SafeOutputPathError } from 'src/generation/safe-output-path';

describe('safeOutputPath', () => {
  it.effect(
    '[Given] a relative output directory and normal filename [Then] it returns a path in the same coordinate space',
    Effect.fn(function* () {
      const outputDir = 'generated';
      const filePath = yield* safeOutputPath(outputDir, 'gmail.ts');

      expect(filePath).toBe(path.join(outputDir, 'gmail.ts'));
      expect(path.isAbsolute(filePath)).toBe(false);
    })
  );

  it.effect(
    '[Given] an absolute generated filename [Then] it fails through the Effect error channel',
    Effect.fn(function* () {
      const result = yield* safeOutputPath('generated', path.resolve('gmail.ts')).pipe(
        Effect.either
      );

      assert(Either.isLeft(result));
      expect(result.left).toBeInstanceOf(SafeOutputPathError);
      expect(result.left.filename).toBe(path.resolve('gmail.ts'));
    })
  );

  it.effect(
    '[Given] a parent-directory generated filename [Then] it fails through the Effect error channel',
    Effect.fn(function* () {
      const result = yield* safeOutputPath('generated', '../gmail.ts').pipe(Effect.either);

      assert(Either.isLeft(result));
      expect(result.left).toBeInstanceOf(SafeOutputPathError);
      expect(result.left.filename).toBe('../gmail.ts');
    })
  );
});
