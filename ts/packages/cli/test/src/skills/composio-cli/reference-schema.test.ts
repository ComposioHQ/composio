import { describe, expect, it } from 'vitest';
import { CLI_EXPERIMENTAL_FEATURES } from 'src/experimental-features';
import { resolveSkillBuildContext } from '../../../../skills-src/composio-cli/reference-schema';

describe('composio-cli skill build context', () => {
  it('enables multi-account guidance in stable builds', () => {
    const build = resolveSkillBuildContext('stable');

    expect(build.experimentalFeatures[CLI_EXPERIMENTAL_FEATURES.MULTI_ACCOUNT]).toBe(true);
    expect(build.experimentalFeatures[CLI_EXPERIMENTAL_FEATURES.LISTEN]).toBe(false);
  });
});
