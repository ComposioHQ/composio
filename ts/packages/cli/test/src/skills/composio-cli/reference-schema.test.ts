import { describe, expect, it } from 'vitest';
import { CLI_EXPERIMENTAL_FEATURES } from 'src/experimental-features';
import { resolveSkillBuildContext } from '../../../../skills-src/composio-cli/reference-schema';

describe('composio-cli skill build context', () => {
  it('keeps only genuinely experimental guidance disabled in stable builds', () => {
    const build = resolveSkillBuildContext('stable');

    expect(build.experimentalFeatures[CLI_EXPERIMENTAL_FEATURES.LISTEN]).toBe(false);
    expect(build.experimentalFeatures[CLI_EXPERIMENTAL_FEATURES.LOCAL_TOOLS]).toBe(false);
  });
});
