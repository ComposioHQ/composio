import { describe, expect, it } from '@effect/vitest';
import cliPackageJson from '../../../package.json' with { type: 'json' };
import {
  buildCliReleaseVersionDefineArgs,
  extractCliReleaseVersion,
} from 'src/utils/cli-release-version';

describe('CLI release version authority', () => {
  it('uses a non-release development sentinel', () => {
    expect(cliPackageJson.version).toBe('0.0.0-development');
  });

  it('derives the exact GitHub release version', () => {
    expect(extractCliReleaseVersion('@composio/cli@0.2.33-beta.322')).toBe('0.2.33-beta.322');
    expect(extractCliReleaseVersion('@composio/core@0.2.33')).toBeUndefined();
    expect(buildCliReleaseVersionDefineArgs('@composio/cli@0.2.33-beta.322')).toEqual([
      '--define',
      '__COMPOSIO_CLI_RELEASE_VERSION__="0.2.33-beta.322"',
    ]);
  });
});
