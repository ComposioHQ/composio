import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as tempy from 'tempy';
import { resolveSetupSkillReleaseTag } from 'src/services/setup-skill-installer';

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
});
