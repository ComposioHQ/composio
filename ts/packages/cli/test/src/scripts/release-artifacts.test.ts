import { describe, expect, it } from 'vitest';

import { RUN_COMPANION_MODULE_FILENAMES } from '../../../src/services/run-companion-modules';
import { archiveCompanionEntries } from '../../../scripts/_release-artifacts';

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
