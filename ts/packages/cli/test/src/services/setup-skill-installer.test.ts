import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BunFileSystem } from '@effect/platform-bun';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import * as tempy from 'tempy';
import { SKILL_RELEASE_TAG_FILENAME } from 'src/effects/install-skill';
import {
  isClaudeSkillCurrent,
  resolveSetupSkillReleaseTag,
} from 'src/services/setup-skill-installer';

const runIsClaudeSkillCurrent = (home: string, releaseTag: string) =>
  isClaudeSkillCurrent(home, releaseTag).pipe(
    Effect.provide(BunFileSystem.layer),
    Effect.runPromise
  );

describe('SetupSkillInstaller', () => {
  it('uses the packaged CLI release tag', () => {
    const installDir = tempy.temporaryDirectory();
    const execPath = path.join(installDir, 'composio');
    writeFileSync(path.join(installDir, 'release-tag.txt'), '@composio/cli@0.2.20-beta.42\n');

    expect(resolveSetupSkillReleaseTag(execPath, '0.3.0')).toBe('@composio/cli@0.2.20-beta.42');
  });

  it('falls back to the build version outside a packaged install', () => {
    const installDir = tempy.temporaryDirectory();

    expect(resolveSetupSkillReleaseTag(path.join(installDir, 'composio'), '0.3.0')).toBe(
      '@composio/cli@0.3.0'
    );
  });

  it('only accepts a Claude skill installed from the running CLI release', async () => {
    const home = tempy.temporaryDirectory();
    const target = path.join(home, '.claude', 'skills', 'composio-cli');
    const skillDir = path.join(home, '.agents', 'skills', 'composio-cli');
    mkdirSync(skillDir, { recursive: true });
    mkdirSync(path.dirname(target), { recursive: true });
    symlinkSync(path.relative(path.dirname(target), skillDir), target);
    writeFileSync(
      path.join(skillDir, SKILL_RELEASE_TAG_FILENAME),
      '@composio/cli@0.2.20-beta.42\n'
    );
    writeFileSync(path.join(skillDir, 'SKILL.md'), '# composio-cli\n');

    expect(await runIsClaudeSkillCurrent(home, '@composio/cli@0.2.20-beta.42')).toBe(true);
    expect(await runIsClaudeSkillCurrent(home, '@composio/cli@0.2.20-beta.43')).toBe(false);
  });

  it('treats an unversioned existing Claude skill as stale', async () => {
    const home = tempy.temporaryDirectory();
    mkdirSync(path.join(home, '.claude', 'skills', 'composio-cli'), { recursive: true });

    expect(await runIsClaudeSkillCurrent(home, '@composio/cli@0.3.0')).toBe(false);
  });

  it('treats a release marker without a readable skill as stale', async () => {
    const home = tempy.temporaryDirectory();
    const target = path.join(home, '.claude', 'skills', 'composio-cli');
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, SKILL_RELEASE_TAG_FILENAME), '@composio/cli@0.3.0\n');

    expect(await runIsClaudeSkillCurrent(home, '@composio/cli@0.3.0')).toBe(false);
  });
});
