import { FileSystem, Path } from '@effect/platform';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { ValidationError } from '@effect/cli';
import { describe, expect, it, layer } from '@effect/vitest';
import { Cause, Effect, Exit, Layer } from 'effect';
import * as tempy from 'tempy';
import { discoverSkillRoots } from 'src/effects/discover-skill-roots';
import { cli, MockConsole, TestLive } from 'test/__utils__';

const TestPlatform = Layer.mergeAll(BunFileSystem.layer, BunPath.layer);

const providePlatform = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(TestPlatform));

const expectRootsExactlyOnce = (actual: ReadonlyArray<string>, expected: ReadonlyArray<string>) => {
  expect(actual).toEqual(expected);
  expect(new Set(actual).size).toBe(actual.length);
};

describe('config experimental skill discovery', () => {
  it.effect('discovers only the canonical skill root', () =>
    providePlatform(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const home = tempy.temporaryDirectory();
        const canonicalRoot = path.join(home, '.agents', 'skills');
        yield* fs.makeDirectory(path.join(canonicalRoot, 'composio-cli'), { recursive: true });

        expectRootsExactlyOnce(yield* discoverSkillRoots(home), [canonicalRoot]);
      })
    )
  );

  it.effect('discovers canonical and real Claude skill copies', () =>
    providePlatform(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const home = tempy.temporaryDirectory();
        const canonicalRoot = path.join(home, '.agents', 'skills');
        const claudeRoot = path.join(home, '.claude', 'skills');
        yield* fs.makeDirectory(path.join(canonicalRoot, 'composio-cli'), { recursive: true });
        yield* fs.makeDirectory(path.join(claudeRoot, 'composio-cli'), { recursive: true });

        expectRootsExactlyOnce(yield* discoverSkillRoots(home), [canonicalRoot, claudeRoot]);
      })
    )
  );

  it.effect('deduplicates a Claude symlink to the canonical skill', () =>
    providePlatform(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const home = tempy.temporaryDirectory();
        const canonicalRoot = path.join(home, '.agents', 'skills');
        const canonicalSkill = path.join(canonicalRoot, 'composio-cli');
        const claudeSkill = path.join(home, '.claude', 'skills', 'composio-cli');
        yield* fs.makeDirectory(canonicalSkill, { recursive: true });
        yield* fs.makeDirectory(path.dirname(claudeSkill), { recursive: true });
        yield* fs.symlink(path.relative(path.dirname(claudeSkill), canonicalSkill), claudeSkill);

        expectRootsExactlyOnce(yield* discoverSkillRoots(home), [canonicalRoot]);
      })
    )
  );

  it.effect('ignores a broken Claude symlink and keeps the canonical fallback', () =>
    providePlatform(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const home = tempy.temporaryDirectory();
        const canonicalRoot = path.join(home, '.agents', 'skills');
        const claudeSkill = path.join(home, '.claude', 'skills', 'composio-cli');
        yield* fs.makeDirectory(path.dirname(claudeSkill), { recursive: true });
        yield* fs.symlink('../missing-composio-cli', claudeSkill);

        expectRootsExactlyOnce(yield* discoverSkillRoots(home), [canonicalRoot]);
      })
    )
  );

  it.effect('uses the canonical fallback when neither skill root exists', () =>
    providePlatform(
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const home = tempy.temporaryDirectory();
        const canonicalRoot = path.join(home, '.agents', 'skills');

        expectRootsExactlyOnce(yield* discoverSkillRoots(home), [canonicalRoot]);
      })
    )
  );

  it.effect('keeps an external symlink target and the canonical fallback once each', () =>
    providePlatform(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const home = tempy.temporaryDirectory();
        const canonicalRoot = path.join(home, '.agents', 'skills');
        const externalRoot = path.join(home, 'shared-skills');
        const externalSkill = path.join(externalRoot, 'composio-cli');
        const claudeSkill = path.join(home, '.claude', 'skills', 'composio-cli');
        yield* fs.makeDirectory(externalSkill, { recursive: true });
        yield* fs.makeDirectory(path.dirname(claudeSkill), { recursive: true });
        yield* fs.symlink(path.relative(path.dirname(claudeSkill), externalSkill), claudeSkill);

        expectRootsExactlyOnce(yield* discoverSkillRoots(home), [externalRoot, canonicalRoot]);
      })
    )
  );
});

layer(TestLive())('config experimental state validation', it => {
  it.scoped('reports an invalid state through Effect CLI validation', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(cli(['config', 'experimental', 'local_tools', 'sometimes']));

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const failure = Cause.squash(exit.cause);
        expect(
          ValidationError.isValidationError(failure) && ValidationError.isInvalidValue(failure)
        ).toBe(true);
      }
      expect((yield* MockConsole.getLines()).join('\n')).toContain(
        'Invalid state "sometimes". Use "on" or "off".'
      );
    })
  );
});
