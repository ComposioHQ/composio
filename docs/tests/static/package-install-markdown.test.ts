import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { Glob } from 'bun';
import { mdxToCleanMarkdown, getLLMText } from '../../lib/source';
import { recordsFromMarkdownPage } from '../../lib/search-index';

describe('PackageInstall Markdown', () => {
  test('preserves alternatives and comments in authored and processed MDX', () => {
    for (const input of [
      `<PackageInstall packages="@composio/core" comment={['Use @composio/slim instead.', 'Choose one package.']} />`,
      `<PackageInstall packages="@composio/core" comment="[&#x27;Use @composio/slim instead.&#x27;, &#x27;Choose one package.&#x27;]" />`,
    ]) {
      const markdown = mdxToCleanMarkdown(input);
      for (const command of ['npm install', 'pnpm add', 'bun add', 'yarn add']) {
        expect(markdown).toContain(`${command} @composio/core`);
      }
      expect(markdown).toContain('# Use @composio/slim instead.');
      expect(markdown).toContain('# Choose one package.');
    }
    const python = mdxToCleanMarkdown(`<PackageInstall ecosystem="python" packages="composio &#x27;ag2[openai]&#x27;" />`);
    expect(python).toContain("uv add composio 'ag2[openai]'");
    expect(python).toContain("pip install composio 'ag2[openai]'");
  });

  test('every authored installation reaches page text and search records', async () => {
    let checked = 0;
    for (const path of new Glob('content/**/*.mdx').scanSync('.')) {
      const raw = readFileSync(path, 'utf8');
      const installs = [...raw.matchAll(/<PackageInstall\b[\s\S]*?packages="([^"]+)"[\s\S]*?\/>/g)];
      if (!installs.length) continue;
      const url = '/' + path.replace(/^content\//, '').replace(/\/index\.mdx$/, '').replace(/\.mdx$/, '');
      const page = await getLLMText({ url, data: { title: path, getText: async () => raw } });
      const records = recordsFromMarkdownPage({ url, title: path, type: 'docs', markdown: raw });
      const search = records.map(record => record.content).join('\n');
      for (const install of installs) {
        expect(page, path).toContain(install[1]);
        expect(search, path).toContain(install[1]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(40);
  });

  test('keeps agent setup instructions, client links, and video descriptions', () => {
    const text = mdxToCleanMarkdown(`<AgentSetupActions /><AgentSetupGrid /><AgentFirstPrompt agent="codex" /><Video src="/demo.mp4" caption="Connect your account" />`);
    expect(text).toContain('npx skills add ComposioHQ/composio --skill composio');
    expect(text).toContain('Use the $composio skill');
    expect(text).toContain('/docs/agent-setup/clients#openai-codex');
    expect(text).toContain('[Video: Connect your account](/demo.mp4)');
  });
});
