import { describe, expect, it } from 'vitest';
import { resolveBundledBinary } from '../bundled-binaries';
import { executeLocalToolBySlug, getLocalToolInputDefinition } from '../registry';
import { peekabooToolkit } from './peekaboo';

describe('@composio/cli-local-tools Peekaboo toolkit', () => {
  it('exposes first-class schemas for Peekaboo tools', () => {
    expect(peekabooToolkit.tools.map(tool => tool.slug)).toEqual(
      expect.arrayContaining([
        'PERMISSIONS_STATUS',
        'LIST_APPS',
        'SEE',
        'IMAGE',
        'CLICK',
        'TYPE',
        'WINDOW_FOCUS',
        'APP_LAUNCH',
      ])
    );

    const seeSchema = getLocalToolInputDefinition('LOCAL_PEEKABOO_SEE');
    expect(seeSchema?.schema.properties).toHaveProperty('app');
    expect(seeSchema?.schema.properties).toHaveProperty('annotate');

    const clickSchema = getLocalToolInputDefinition('LOCAL_PEEKABOO_CLICK');
    expect(clickSchema?.schema.properties).toHaveProperty('on');
    expect(clickSchema?.schema.properties).toHaveProperty('coords');
  });

  it.runIf(process.env.COMPOSIO_REAL_LOCAL_TOOLS_TESTS === '1' && process.platform === 'darwin')(
    'resolves generated bundled Peekaboo CLI and executes version without permissions',
    async () => {
      const resolved = await resolveBundledBinary(
        peekabooToolkit,
        { bundledBinary: 'peekaboo-cli' },
        { currentPlatform: process.arch === 'x64' ? 'darwin-x64' : 'darwin-arm64' }
      );
      expect(resolved?.exists).toBe(true);

      const result = await executeLocalToolBySlug('LOCAL_PEEKABOO_VERSION', {});
      expect(result?.resultText).toContain('Peekaboo 3.0.0');
    }
  );

  it.runIf(process.env.COMPOSIO_REAL_LOCAL_TOOLS_TESTS === '1' && process.platform === 'darwin')(
    'validates against real Peekaboo permission and app-list commands',
    async () => {
      const permissions = await executeLocalToolBySlug('LOCAL_PEEKABOO_PERMISSIONS_STATUS', {});
      expect(permissions?.result).toEqual(expect.objectContaining({ success: true }));

      const apps = await executeLocalToolBySlug('LOCAL_PEEKABOO_LIST_APPS', {});
      expect(apps?.result).toEqual(
        expect.objectContaining({
          data: expect.objectContaining({ applications: expect.any(Array) }),
        })
      );
    },
    120_000
  );
});
