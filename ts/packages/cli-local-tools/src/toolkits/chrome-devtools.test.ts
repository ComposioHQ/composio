import { describe, expect, it } from 'vitest';
import { executeLocalToolBySlug, getLocalToolInputDefinition } from '../registry';
import { chromeDevtoolsToolkit } from './chrome-devtools';

describe('@composio/cli-local-tools Chrome DevTools toolkit', () => {
  it('exposes first-class schemas for documented Chrome DevTools tools', () => {
    expect(chromeDevtoolsToolkit.source?.type).toBe('mcp');
    expect(chromeDevtoolsToolkit.tools.map(tool => tool.slug)).toEqual(
      expect.arrayContaining([
        'LIST_PAGES',
        'NEW_PAGE',
        'NAVIGATE_PAGE',
        'TAKE_SNAPSHOT',
        'EVALUATE_SCRIPT',
        'CLICK',
        'DRAG',
        'HANDLE_DIALOG',
        'LIST_NETWORK_REQUESTS',
        'LIST_EXTENSIONS',
      ])
    );

    const newPageSchema = getLocalToolInputDefinition('LOCAL_CHROME_DEVTOOLS_NEW_PAGE');
    expect(newPageSchema?.schema.properties).toHaveProperty('url');
    expect(newPageSchema?.schema.required).toContain('url');

    const evaluateSchema = getLocalToolInputDefinition('LOCAL_CHROME_DEVTOOLS_EVALUATE_SCRIPT');
    expect(evaluateSchema?.schema.properties).toHaveProperty('function');
    expect(evaluateSchema?.schema.properties).toHaveProperty('args');
  });

  it.runIf(process.env.COMPOSIO_REAL_LOCAL_TOOLS_TESTS === '1')(
    'validates against a real chrome-devtools-mcp daemon',
    async () => {
      try {
        const start = await executeLocalToolBySlug('LOCAL_CHROME_DEVTOOLS_START_DAEMON', {
          headless: true,
          usageStatistics: false,
          performanceCrux: false,
        });
        expect(start?.ok).toBe(true);

        const page = await executeLocalToolBySlug('LOCAL_CHROME_DEVTOOLS_NEW_PAGE', {
          url: 'data:text/html,<title>Composio Chrome Local Tools</title><h1>Hello from Chrome</h1>',
        });
        expect(page?.ok).toBe(true);

        const evaluated = await executeLocalToolBySlug('LOCAL_CHROME_DEVTOOLS_EVALUATE_SCRIPT', {
          function: '() => document.title',
        });
        expect(evaluated?.result).toEqual(
          expect.objectContaining({
            message: expect.stringContaining('Composio Chrome Local Tools'),
          })
        );

        const pages = await executeLocalToolBySlug('LOCAL_CHROME_DEVTOOLS_LIST_PAGES', {});
        expect(pages?.result).toEqual(expect.objectContaining({ pages: expect.any(Array) }));
      } finally {
        await executeLocalToolBySlug('LOCAL_CHROME_DEVTOOLS_STOP_DAEMON', {});
      }
    },
    120_000
  );
});
