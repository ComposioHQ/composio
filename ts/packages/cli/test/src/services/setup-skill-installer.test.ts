import { FileSystem, HttpClient, HttpClientResponse, Path } from '@effect/platform';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { describe, expect, layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import * as tempy from 'tempy';
import { SKILL_RELEASE_TAG_FILENAME } from 'src/effects/install-skill';
import {
  hasManagedClaudeSkill,
  isClaudeSkillCurrent,
  removeManagedClaudeSkill,
  resolveSetupSkillReleaseTag,
} from 'src/services/setup-skill-installer';

const TestHttpClient = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make(request =>
    Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response(
          JSON.stringify([
            {
              tag_name: '@composio/cli@0.2.21',
              prerelease: false,
              assets: [
                {
                  name: 'composio-skill.zip',
                  browser_download_url: 'https://example.test/composio-skill.zip',
                },
              ],
            },
          ]),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )
    )
  )
);

const TestPlatform = Layer.mergeAll(BunFileSystem.layer, BunPath.layer, TestHttpClient);

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

        expect(yield* resolveSetupSkillReleaseTag(execPath, '0.3.0')).toBe(
          '@composio/cli@0.2.20-beta.42'
        );
      })
    );

    it.effect('uses the running package fallback outside a packaged install', () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const installDir = tempy.temporaryDirectory();

        expect(yield* resolveSetupSkillReleaseTag(path.join(installDir, 'composio'), '0.3.0')).toBe(
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

    it.effect('removes the CLI-managed Claude skill and canonical copy', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const home = tempy.temporaryDirectory();
        const canonical = path.join(home, '.agents', 'skills', 'composio-cli');
        const claude = path.join(home, '.claude', 'skills', 'composio-cli');
        yield* fs.makeDirectory(canonical, { recursive: true });
        yield* fs.writeFileString(
          path.join(canonical, SKILL_RELEASE_TAG_FILENAME),
          '@composio/cli@0.3.0\n'
        );
        yield* fs.makeDirectory(path.dirname(claude), { recursive: true });
        yield* fs.symlink(path.relative(path.dirname(claude), canonical), claude);

        expect(yield* hasManagedClaudeSkill(home)).toBe(true);
        expect(yield* removeManagedClaudeSkill(home)).toBe(true);
        expect(yield* hasManagedClaudeSkill(home)).toBe(false);
        expect(yield* fs.exists(claude)).toBe(false);
        expect(yield* fs.exists(canonical)).toBe(false);
      })
    );

    it.effect('keeps the canonical skill while another agent references it', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const home = tempy.temporaryDirectory();
        const canonical = path.join(home, '.agents', 'skills', 'composio-cli');
        const claude = path.join(home, '.claude', 'skills', 'composio-cli');
        const openclaw = path.join(home, '.openclaw', 'skills', 'composio-cli');
        yield* fs.makeDirectory(canonical, { recursive: true });
        yield* fs.writeFileString(
          path.join(canonical, SKILL_RELEASE_TAG_FILENAME),
          '@composio/cli@0.3.0\n'
        );
        yield* fs.makeDirectory(path.dirname(claude), { recursive: true });
        yield* fs.makeDirectory(path.dirname(openclaw), { recursive: true });
        yield* fs.symlink(path.relative(path.dirname(claude), canonical), claude);
        yield* fs.symlink(path.relative(path.dirname(openclaw), canonical), openclaw);

        expect(yield* hasManagedClaudeSkill(home)).toBe(true);
        expect(yield* removeManagedClaudeSkill(home)).toBe(true);
        expect(yield* hasManagedClaudeSkill(home)).toBe(false);
        expect(yield* fs.exists(claude)).toBe(false);
        expect(yield* fs.exists(canonical)).toBe(true);
        expect(yield* fs.exists(openclaw)).toBe(true);
      })
    );
  });
});
