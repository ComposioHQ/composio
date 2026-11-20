import { describe, expect, test } from 'bun:test';
import { getLLMText, type LLMPage } from '../../lib/source';

function llmPage(url: string, content: string): LLMPage {
  return { url, data: { title: 'Quickstart', getText: async () => content } };
}

describe('getLLMText — documentation index pointer', () => {
  test('the llms.txt pointer is the first line after the page title', async () => {
    const text = await getLLMText(llmPage('/docs/quickstart', 'Install the SDK.'), {
      includeGuardrails: false,
    });
    const lines = text.split('\n');
    expect(lines[0].startsWith('# Quickstart')).toBe(true);
    expect(lines[1]).toBe(
      '> Documentation index: https://docs.composio.dev/llms.txt. Fetch it to find every page.'
    );
  });

  test('llms-full.txt pages opt out of the per-page pointer', async () => {
    const text = await getLLMText(llmPage('/docs/quickstart', 'Install the SDK.'), {
      includeFooter: false,
      includeGuardrails: false,
      includeIndexPointer: false,
    });
    expect(text).not.toContain('Documentation index');
  });
});
