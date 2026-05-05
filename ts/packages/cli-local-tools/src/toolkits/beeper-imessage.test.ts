import { describe, expect, it } from 'vitest';
import { resolveBundledBinary } from '../bundled-binaries';
import { executeLocalToolBySlug, getLocalToolInputDefinition } from '../registry';
import { beeperImessageToolkit } from './beeper-imessage';

describe('@composio/cli-local-tools Beeper iMessage toolkit', () => {
  it('exposes first-class schemas for Beeper iMessage tools', () => {
    expect(beeperImessageToolkit.tools.map(tool => tool.slug)).toEqual(
      expect.arrayContaining(['LIST_THREADS', 'FIND_THREAD', 'SEND_MESSAGE', 'AUTHORIZE'])
    );

    const sendSchema = getLocalToolInputDefinition('LOCAL_BEEPER_IMESSAGE_SEND_MESSAGE');
    expect(sendSchema?.schema.properties).toHaveProperty('threadId');
    expect(sendSchema?.schema.properties).toHaveProperty('text');
    expect(sendSchema?.schema.properties).toHaveProperty('verifySent');

    const listSchema = getLocalToolInputDefinition('LOCAL_BEEPER_IMESSAGE_LIST_THREADS');
    expect(listSchema?.schema.properties).toHaveProperty('compact');
    expect(listSchema?.schema.properties).toHaveProperty('resolveContactNames');

    const reactSchema = getLocalToolInputDefinition('LOCAL_BEEPER_IMESSAGE_REACT_TO_MESSAGE');
    expect(reactSchema?.schema.properties).toHaveProperty('prepareTranscript');
  });

  it.runIf(process.env.COMPOSIO_REAL_LOCAL_TOOLS_TESTS === '1' && process.platform === 'darwin')(
    'resolves generated bundled imessage-cli and executes the bootstrap-free version command',
    async () => {
      const resolved = await resolveBundledBinary(
        beeperImessageToolkit,
        { bundledBinary: 'beeper-imessage-cli' },
        { currentPlatform: process.arch === 'x64' ? 'darwin-x64' : 'darwin-arm64' }
      );
      expect(resolved?.exists).toBe(true);

      const result = await executeLocalToolBySlug('LOCAL_BEEPER_IMESSAGE_VERSION', {});
      expect(result?.resultText).toContain('platform-imessage 0.21.0');
    }
  );
});
