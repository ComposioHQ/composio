import semver from 'semver';
import { describe, expect, it } from 'vitest';

import {
  RUN_COMPANION_LEGACY_PLACEHOLDER_RELATIVE_PATHS,
  RUN_COMPANION_MODULE_FILENAMES,
} from '../../../src/services/run-companion-modules';
import {
  archiveCompanionEntries,
  buildReleaseManifest,
  MINIMUM_UPGRADE_FROM,
  serializeReleaseManifest,
} from '../../../scripts/_release-artifacts';

/**
 * Everything `collectExpectedRunCompanionAssetRelativePaths` yields for a fully
 * populated companions directory: the wrappers and their bundled services.
 */
const LIVE_COMPANION_RELATIVE_PATHS: ReadonlyArray<string> = [
  ...RUN_COMPANION_MODULE_FILENAMES,
  ...RUN_COMPANION_MODULE_FILENAMES.map(fileName => `services/${fileName}`),
].sort();

const LEGACY_WRAPPERS: ReadonlyArray<string> = [
  'run-subagent-shared.mjs',
  'run-subagent-acp.mjs',
  'run-subagent-legacy.mjs',
  'run-subagent-output-mcp.mjs',
];

describe('archiveCompanionEntries', () => {
  // Every archive gets the same entries, whatever platform its binary targets.
  const entries = archiveCompanionEntries(LIVE_COMPANION_RELATIVE_PATHS);

  const pathsOfKind = (kind: string): ReadonlyArray<string> =>
    entries.filter(entry => entry.kind === kind).map(entry => entry.relativePath);

  it('writes each of the ten legacy paths as a placeholder', () => {
    expect(pathsOfKind('placeholder')).toEqual([
      'run-subagent-shared.mjs',
      'run-subagent-acp.mjs',
      'run-subagent-legacy.mjs',
      'run-subagent-output-mcp.mjs',
      'acp-adapters/claude-code-acp.mjs',
      'acp-adapters/cli.js',
      'acp-adapters/codex/darwin-arm64/codex-acp',
      'acp-adapters/codex/darwin-x64/codex-acp',
      'acp-adapters/codex/linux-arm64/codex-acp',
      'acp-adapters/codex/linux-x64/codex-acp',
    ]);
  });

  it('copies the live companions and their bundles, and nothing else', () => {
    expect(pathsOfKind('copy')).toEqual([
      'generation-runtime.mjs',
      'run-helpers-runtime.mjs',
      'services/generation-runtime.mjs',
      'services/run-helpers-runtime.mjs',
    ]);
  });
});

/**
 * An already-released CLI verifies a downloaded upgrade package with its own
 * path list, by existence only. From 0.2.15 it also follows the relative `.mjs`
 * imports of each wrapper it requires. The lists below are what each range of
 * stable releases asks for, spelled out because those binaries no longer change.
 */
describe('upgrade from already-released clients', () => {
  const entries = archiveCompanionEntries(LIVE_COMPANION_RELATIVE_PATHS);
  const entryPaths = entries.map(entry => entry.relativePath);

  const clientRanges: ReadonlyArray<{
    readonly range: string;
    readonly requiredFor: (host: string) => ReadonlyArray<string>;
  }> = [
    {
      range: '0.2.12 - 0.2.14',
      requiredFor: () => LEGACY_WRAPPERS,
    },
    {
      range: '0.2.15 - 0.3.3',
      requiredFor: () => [
        'run-helpers-runtime.mjs',
        'services/run-helpers-runtime.mjs',
        ...LEGACY_WRAPPERS,
        'acp-adapters/claude-code-acp.mjs',
        'acp-adapters/cli.js',
        'acp-adapters/codex/darwin-arm64/codex-acp',
        'acp-adapters/codex/darwin-x64/codex-acp',
        'acp-adapters/codex/linux-arm64/codex-acp',
        'acp-adapters/codex/linux-x64/codex-acp',
      ],
    },
    {
      range: '0.4.0 - 0.4.2',
      requiredFor: host => [
        'run-helpers-runtime.mjs',
        'services/run-helpers-runtime.mjs',
        'generation-runtime.mjs',
        'services/generation-runtime.mjs',
        ...LEGACY_WRAPPERS,
        'acp-adapters/claude-code-acp.mjs',
        'acp-adapters/cli.js',
        `acp-adapters/codex/${host}/codex-acp`,
      ],
    },
  ];

  const cases = clientRanges.flatMap(({ range, requiredFor }) =>
    ['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64'].map(host => ({
      range,
      host,
      required: requiredFor(host),
    }))
  );

  it.each(cases)('a $range client finds every path it requires on $host', ({ required }) => {
    expect(entryPaths).toEqual(expect.arrayContaining([...required]));
  });
});

describe('buildReleaseManifest', () => {
  it('lists exactly the live companions under schema version 1', () => {
    expect(buildReleaseManifest(LIVE_COMPANION_RELATIVE_PATHS)).toEqual({
      schemaVersion: 1,
      minimumUpgradeFrom: MINIMUM_UPGRADE_FROM,
      companions: [
        'generation-runtime.mjs',
        'run-helpers-runtime.mjs',
        'services/generation-runtime.mjs',
        'services/run-helpers-runtime.mjs',
      ],
    });
  });

  it('serializes as two-space JSON with a trailing newline', () => {
    expect(serializeReleaseManifest(buildReleaseManifest(['run-helpers-runtime.mjs']))).toBe(
      [
        '{',
        '  "schemaVersion": 1,',
        `  "minimumUpgradeFrom": "${MINIMUM_UPGRADE_FROM}",`,
        '  "companions": [',
        '    "run-helpers-runtime.mjs"',
        '  ]',
        '}',
        '',
      ].join('\n')
    );
  });

  it('refuses a companion path the CLI would refuse to install', () => {
    expect(() => buildReleaseManifest(['../run-helpers-runtime.mjs'])).toThrow();
  });
});

/**
 * Clients up to 0.4.2 never read the manifest and refuse an archive missing any
 * placeholder, so the placeholders may only go once the declared minimum has
 * left those clients behind.
 */
describe('MINIMUM_UPGRADE_FROM', () => {
  it('keeps every legacy placeholder in the archive while clients up to 0.4.2 may upgrade', () => {
    const entryPaths = archiveCompanionEntries(LIVE_COMPANION_RELATIVE_PATHS).map(
      entry => entry.relativePath
    );
    const keepsPlaceholders = RUN_COMPANION_LEGACY_PLACEHOLDER_RELATIVE_PATHS.every(relativePath =>
      entryPaths.includes(relativePath)
    );

    expect(semver.gt(MINIMUM_UPGRADE_FROM, '0.4.2') || keepsPlaceholders).toBe(true);
  });

  it.each(['0.0.0-beta.0', '0.1.26', '0.6.2'])(
    'lets a %s client upgrade, since no release has dropped a required path yet',
    version => {
      expect(semver.gte(version, MINIMUM_UPGRADE_FROM)).toBe(true);
    }
  );
});
