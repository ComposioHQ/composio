import { describe, expect, it } from 'vitest';
import {
  createLocalToolRouterExperimentalPayload,
  getLocalToolkitDeclarations,
  getLocalToolInputDefinition,
  normalizeLocalToolSlug,
} from './registry';

const findToolkit = (payload: ReturnType<typeof createLocalToolRouterExperimentalPayload>, slug: string) =>
  payload?.custom_toolkits?.find(toolkit => toolkit.slug === slug);

describe('@composio/cli-local-tools registry', () => {
  it('normalizes local tool slugs to the Tool Router LOCAL_<TOOLKIT>_<TOOL> shape', () => {
    expect(normalizeLocalToolSlug('RUN_CLI', 'BEEPER_IMESSAGE')).toBe(
      'LOCAL_BEEPER_IMESSAGE_RUN_CLI'
    );
  });

  it('filters declarations by platform', () => {
    expect(
      getLocalToolkitDeclarations({ currentPlatform: 'linux-x64' }).map(toolkit => toolkit.slug)
    ).toEqual(['CHROME_DEVTOOLS']);
    expect(
      getLocalToolkitDeclarations({ currentPlatform: 'darwin-arm64' }).map(toolkit => toolkit.slug)
    ).toEqual(['BEEPER_IMESSAGE', 'CHROME_DEVTOOLS', 'PEEKABOO']);
  });

  it('builds Tool Router custom toolkit payloads for supported local toolkits', () => {
    const payload = createLocalToolRouterExperimentalPayload({
      currentPlatform: 'darwin-arm64',
      toolkits: ['chrome_devtools'],
    });

    expect(payload?.custom_toolkits).toHaveLength(1);
    expect(findToolkit(payload, 'CHROME_DEVTOOLS')?.tools.map(tool => tool.slug)).toEqual([
      'LIST_TOOLS',
      'CALL_TOOL',
    ]);
  });

  it('exposes local input schemas for CLI --get-schema and dry-run validation', () => {
    const definition = getLocalToolInputDefinition('LOCAL_BEEPER_IMESSAGE_RUN_CLI');
    expect(definition?.version).toBe('local');
    expect(definition?.schema.properties).toHaveProperty('args');
  });
});
