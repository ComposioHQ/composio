import { FileSystem, Path } from '@effect/platform';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { describe, expect, layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import * as tempy from 'tempy';
import { SKILL_RELEASE_TAG_FILENAME } from 'src/effects/install-skill';
import {
  isClaudeSkillCurrent,
  resolveSetupSkillReleaseTag,
} from 'src/services/setup-skill-installer';

const TestPlatform = Layer.mergeAll(BunFileSystem.layer, BunPath.layer);

describe('SetupSkillInstaller', () => {
  layer(TestPlatform)(it => {
    it.effect('uses the packaged CLI release tag', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const installDir = tempy.temporaryDirectory();
        const execPath = path.join(installDir, 'composio');
        yield* fs.writeFileString(
          path.join(installDir, 'release-tag.txt'),
          '@composio/cli@0.2.20-beta.42\n'
        );

        expect(resolveSetupSkillReleaseTag(execPath, '0.3.0')).toBe('@composio/cli@0.2.20-beta.42');
      })
    );

    it.effect('falls back to the build version outside a packaged install', () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const installDir = tempy.temporaryDirectory();

        expect(resolveSetupSkillReleaseTag(path.join(installDir, 'composio'), '0.3.0')).toBe(
          '@composio/cli@0.3.0'
        );
      })
    );

    it.effect('only accepts a Claude skill installed from the running CLI release', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const home = tempy.temporaryDirectory();
        const target = path.join(home, '.claude', 'skills', 'composio-cli');
        const skillDir = path.join(home, '.agents', 'skills', 'composio-cli');
        yield* fs.makeDirectory(skillDir, { recursive: true });
        yield* fs.makeDirectory(path.dirname(target), { recursive: true });
        yield* fs.symlink(path.relative(path.dirname(target), skillDir), target);
        yield* fs.writeFileString(
          path.join(skillDir, SKILL_RELEASE_TAG_FILENAME),
          '@composio/cli@0.2.20-beta.42\n'
        );
        yield* fs.writeFileString(path.join(skillDir, 'SKILL.md'), '# composio-cli\n');

        expect(yield* isClaudeSkillCurrent(home, '@composio/cli@0.2.20-beta.42')).toBe(true);
        expect(yield* isClaudeSkillCurrent(home, '@composio/cli@0.2.20-beta.43')).toBe(false);
      })
    );

    it.effect('treats an unversioned existing Claude skill as stale', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const home = tempy.temporaryDirectory();
        yield* fs.makeDirectory(path.join(home, '.claude', 'skills', 'composio-cli'), {
          recursive: true,
        });

        expect(yield* isClaudeSkillCurrent(home, '@composio/cli@0.3.0')).toBe(false);
      })
    );

    it.effect('treats a release marker without a readable skill as stale', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const home = tempy.temporaryDirectory();
        const target = path.join(home, '.claude', 'skills', 'composio-cli');
        yield* fs.makeDirectory(target, { recursive: true });
        yield* fs.writeFileString(
          path.join(target, SKILL_RELEASE_TAG_FILENAME),
          '@composio/cli@0.3.0\n'
        );

        expect(yield* isClaudeSkillCurrent(home, '@composio/cli@0.3.0')).toBe(false);
      })
    );
  });
});
