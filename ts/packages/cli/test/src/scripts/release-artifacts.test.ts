import { describe, expect, it } from 'vitest';

import {
  RUN_COMPANION_LEGACY_PLACEHOLDER_RELATIVE_PATHS,
  RUN_COMPANION_MODULE_FILENAMES,
} from '../../../src/services/run-companion-modules';
import {
  archiveCompanionEntries,
  ARTIFACT_NAMES,
  RELEASE_ARTIFACT_TARGETS,
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

describe('RELEASE_ARTIFACT_TARGETS', () => {
  it('maps every published artifact name to a Node platform/arch pair', () => {
    expect(
      RELEASE_ARTIFACT_TARGETS.map(({ artifactName, platform, arch }) => [
        artifactName,
        `${platform}-${arch}`,
      ])
    ).toEqual([
      ['composio-darwin-aarch64', 'darwin-arm64'],
      ['composio-darwin-x64', 'darwin-x64'],
      ['composio-linux-x64', 'linux-x64'],
      ['composio-linux-aarch64', 'linux-arm64'],
    ]);
  });
});

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

  it('copies no codex-acp binary', () => {
    expect(pathsOfKind('copy').filter(relativePath => relativePath.endsWith('codex-acp'))).toEqual(
      []
    );
  });

  it('names no sub-agent bundle under services/', () => {
    expect(
      entries
        .map(entry => entry.relativePath)
        .filter(relativePath => relativePath.startsWith('services/run-subagent-'))
    ).toEqual([]);
  });

  it('names every path once', () => {
    const relativePaths = entries.map(entry => entry.relativePath);

    expect(new Set(relativePaths).size).toBe(relativePaths.length);
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
    RELEASE_ARTIFACT_TARGETS.map(({ artifactName, platform, arch }) => ({
      range,
      artifactName,
      required: requiredFor(`${platform}-${arch}`),
    }))
  );

  it.each(cases)(
    'a $range client finds every path it requires in $artifactName',
    ({ required }) => {
      expect(entryPaths).toEqual(expect.arrayContaining([...required]));
    }
  );

  // An empty wrapper has no `export * from "./services/…"` line, so the import
  // scan of a 0.2.15+ client asks for nothing beyond the wrapper itself.
  it('ships every legacy wrapper empty, so it adds no imports to follow', () => {
    expect(
      entries.filter(entry => LEGACY_WRAPPERS.includes(entry.relativePath)).map(entry => entry.kind)
    ).toEqual(['placeholder', 'placeholder', 'placeholder', 'placeholder']);
  });
});
