import { FileSystem, Path } from '@effect/platform';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { describe, expect, it } from 'vitest';
import { Effect, Layer } from 'effect';
import * as tempy from 'tempy';
import { discoverSkillRoots } from 'src/effects/discover-skill-roots';

const TestPlatform = Layer.mergeAll(BunFileSystem.layer, BunPath.layer);

const runPlatform = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  Effect.runPromise(effect.pipe(Effect.provide(TestPlatform)));

const expectRootsExactlyOnce = (actual: ReadonlyArray<string>, expected: ReadonlyArray<string>) => {
  expect(actual).toEqual(expected);
  expect(new Set(actual).size).toBe(actual.length);
};

describe('config experimental skill discovery', () => {
  it('discovers only the canonical skill root', () =>
    runPlatform(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const home = tempy.temporaryDirectory();
        const canonicalRoot = path.join(home, '.agents', 'skills');
        yield* fs.makeDirectory(path.join(canonicalRoot, 'composio-cli'), { recursive: true });

        expectRootsExactlyOnce(yield* discoverSkillRoots(home), [canonicalRoot]);
      })
    ));

  it('discovers canonical and real Claude skill copies', () =>
    runPlatform(
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
    ));

  it('deduplicates a Claude symlink to the canonical skill', () =>
    runPlatform(
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
    ));

  it('ignores a broken Claude symlink and keeps the canonical fallback', () =>
    runPlatform(
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
    ));

  it('uses the canonical fallback when neither skill root exists', () =>
    runPlatform(
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const home = tempy.temporaryDirectory();
        const canonicalRoot = path.join(home, '.agents', 'skills');

        expectRootsExactlyOnce(yield* discoverSkillRoots(home), [canonicalRoot]);
      })
    ));

  it('keeps an external symlink target and the canonical fallback once each', () =>
    runPlatform(
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
    ));
});
