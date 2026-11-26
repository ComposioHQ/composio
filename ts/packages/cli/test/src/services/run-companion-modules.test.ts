import { describe, expect, it } from '@effect/vitest';
import {
  RUN_COMPANION_LEGACY_PLACEHOLDER_RELATIVE_PATHS,
  RUN_COMPANION_MODULE_BASENAMES,
  RUN_COMPANION_MODULE_FILENAMES,
} from 'src/services/run-companion-modules';

describe('run-companion-modules', () => {
  it('pins the legacy placeholder list to the ten paths released clients require', () => {
    expect(RUN_COMPANION_LEGACY_PLACEHOLDER_RELATIVE_PATHS).toEqual([
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

  // Released clients check an upgrade archive for these paths, and manifest-aware ones install
  // what the manifest lists, so the list stays even though the executable loads none of them.
  it('pins the retired companion paths released clients check upgrade archives for', () => {
    expect(RUN_COMPANION_MODULE_BASENAMES).toEqual(['run-helpers-runtime', 'generation-runtime']);
  });

  it('keeps the legacy placeholders out of the companion list', () => {
    expect(
      RUN_COMPANION_MODULE_FILENAMES.filter(fileName =>
        RUN_COMPANION_LEGACY_PLACEHOLDER_RELATIVE_PATHS.includes(fileName)
      )
    ).toEqual([]);
  });
});
