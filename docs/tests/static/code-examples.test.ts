import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  checkCodeExamples, listCodeExampleFiles, inventoryCodeExamples,
  parseCodeExamples, walkCodeExamples,
} from '../../lib/code-examples';
import { componentsToMarkdown } from '../../lib/example-document';
import { mdxToCleanMarkdown } from '../../lib/source';
import { parseToolkitFaq } from '../../lib/toolkit-faq';

const root = join(import.meta.dir, '../..');
const fence = (language: string, code: string) => `\`\`\`${language}\n${code}\n\`\`\``;
const tab = (value: string, content: string) => `<Tab value="${value}">\n\n${content}\n\n</Tab>`;
const python = fence('python', 'print("hello")');
const typescript = fence('typescript', 'console.log("hello")');
const api = fence('bash', 'curl https://backend.composio.dev/api/v3.1/tools -H "x-api-key: $COMPOSIO_API_KEY"');
const group = (py = python, ts = typescript, rest: string | null = api) =>
  `<Tabs groupId="language" items={['Python', 'TypeScript'${rest === null ? '' : ", 'API'"}]} persist>\n${tab('Python', py)}\n${tab('TypeScript', ts)}\n${rest === null ? '' : tab('API', rest)}\n</Tabs>`;
function violations(source: string, path = 'page.mdx') {
  return checkCodeExamples([{ source, path }], { requireApi: true });
}

// These are consumer-visible acceptance cases, not snapshots of an internal parse tree.
describe('rendered example boundaries', () => {
  test('checks fences in blockquotes and lists instead of losing them', () => {
    for (const source of [python.split('\n').map((line) => `> ${line}`).join('\n'), `- ${python.replaceAll('\n', '\n  ')}`]) {
      expect(violations(source).map((item) => item.rule)).toEqual(['standalone-sdk-fence']);
    }
  });

  test('does not turn comments, quoted JSX attributes, strings, or inline code into examples or exemptions', () => {
    expect(violations(`{/*\n${python}\n*/}`)).toEqual([]);
    expect(violations(group().replace('persist>', 'data-note={\'<Tab value="not a real tab">\'} persist>'))).toEqual([]);
    for (const literal of [
      `{'{/* code-example: single-language-page reason="rendered string" */}'}`,
      '`{/* code-example: single-language-page reason="inline code" */}`',
    ]) expect(violations(`${literal}\n\n${python}`).map((item) => item.rule)).toEqual(['standalone-sdk-fence']);
  });

  test('respects tilde fences and longer fences containing shorter ones', () => {
    expect(violations(`\`\`\`\`mdx\n${python}\n\`\`\`\``)).toEqual([]);
    expect(violations(python.replaceAll('```', '~~~')).map((item) => item.rule)).toEqual(['standalone-sdk-fence']);
  });

  test('keeps fences inside Callouts in the checked surface', () => {
    const source = group(`<Callout>\n\n${typescript}\n\n</Callout>`);
    expect(violations(source).some((item) => item.rule === 'language-cross-fence')).toBe(true);
  });

  test('checks nested language groups and multiline literal attributes', () => {
    const inner = group().replace('groupId="language" items=', 'groupId={"language"}\n items=');
    const source = `<Tabs items={['Bearer', 'API key']}>\n${tab('Bearer', inner)}\n${tab('API key', inner)}\n</Tabs>`;
    expect(violations(source)).toEqual([]);
    expect(violations(source.replace("['Python', 'TypeScript', 'API']", "['TypeScript', 'Python', 'API']")).some((item) => item.rule === 'language-items')).toBe(true);
  });
});

describe('language option contract', () => {
  test('rejects missing, duplicate, empty, and wrong-language options', () => {
    expect(violations(group().replace(tab('TypeScript', typescript), '')).some((item) => item.rule === 'language-items')).toBe(true);
    expect(violations(group().replace(tab('TypeScript', typescript), tab('Python', python))).some((item) => item.message.includes('duplicate'))).toBe(true);
    expect(violations(group(fence('python', ''))).map((item) => item.rule)).toContain('language-empty-tab');
    expect(violations(group(fence('bash', 'echo wrong'))).map((item) => item.rule)).toContain('language-cross-fence');
    expect(violations(group(python, python)).map((item) => item.rule)).toContain('language-cross-fence');
    expect(violations(group(python, typescript, fence('json', '{}'))).map((item) => item.rule)).toContain('language-cross-fence');
  });

  test('accepts genuine installation instructions and explicit SDK-gap Callouts', () => {
    expect(violations(group('<PackageInstall ecosystem="python" packages="composio" />', fence('bash', 'npm install @composio/core'), null))).toEqual([]);
    expect(violations(group('<Callout>Use the API: this SDK does not implement this operation.</Callout>'))).toEqual([]);
    expect(violations(group('<Callout />')).map((item) => item.rule)).toContain('language-empty-tab');
  });

  test('requires counterparts for SDK-only and API-only operations', () => {
    expect(violations(python).map((item) => item.rule)).toEqual(['standalone-sdk-fence']);
    expect(violations(api).map((item) => item.rule)).toEqual(['standalone-api-fence']);
    const sdkOnly = `<Tabs groupId="language" items={['Python', 'TypeScript']}>\n${tab('Python', python)}\n${tab('TypeScript', typescript)}\n</Tabs>`;
    expect(violations(sdkOnly).map((item) => item.rule)).toEqual(['api-missing']);
    const versioned = sdkOnly.replaceAll('Python', 'Python (current)').replaceAll('TypeScript', 'TypeScript (current)');
    expect(violations(versioned).map((item) => item.rule)).toEqual(['api-missing']);
    expect(violations(`{/* code-example: no-api reason="local schema modifiers have no HTTP operation" */}\n${sdkOnly}`)).toEqual([]);
  });

  test('rejects misplaced, malformed, and unscoped API exceptions', () => {
    expect(violations(`{/* code-example: single-language reason="local Python helper" */}\nProse.\n${python}`).map((item) => item.rule)).toContain('marker-invalid');
    expect(violations(`{/* code-example: single-language reason="" */}\n${python}`).map((item) => item.rule)).toContain('marker-invalid');
    expect(violations(`{/* code-example: unchecked-api reason="old spec" */}\n${api}`).map((item) => item.rule)).toContain('marker-invalid');
  });
});

describe('Markdown options and agent output', () => {
  const source = `## Question\n\nIntro.\n\n### Python\n\n${python}\n\n### TypeScript\n\n${typescript}\n\n### API\n\n${api}\n\n## Next question\n\nOther answer.`;

  test('plain Markdown exposes checked options and FAQ HTML for all three variants', () => {
    expect(violations(source, 'faq.md')).toEqual([]);
    const faq = parseToolkitFaq(source);
    const options = faq[0].answer.find((part) => part.type === 'languages');
    expect(options?.type === 'languages' && options.tabs.map((item) => item.value)).toEqual(['Python', 'TypeScript', 'API']);
    expect(options?.type === 'languages' && options.tabs.every((item) => item.html.includes('<code'))).toBe(true);
    expect(faq[1].question).toBe('Next question');
  });

  test('end-languages keeps shared prose after the group visible for every option', () => {
    const shared = source.replace('\n\n## Next question', '\n\n<!-- end-languages -->\n\nShared follow-up.\n\n## Next question');
    expect(violations(shared, 'faq.md')).toEqual([]);
    const [options, after] = parseToolkitFaq(shared)[0].answer.slice(1);
    expect(options.type === 'languages' && options.tabs.some((item) => item.html.includes('Shared follow-up'))).toBe(false);
    expect(after).toEqual({ type: 'html', html: '<p>Shared follow-up.</p>' });
  });

  test('a Markdown group exception cannot exempt the following operation', () => {
    const pair = `### Python\n\n${python}\n\n### TypeScript\n\n${typescript}\n`;
    const local = `<!-- code-example: no-api reason="local schema transformation" -->\n${pair}\n## Remote operation\n\n${pair}`;
    const missing = violations(local, 'faq.md');
    expect(missing.map((item) => item.rule)).toEqual(['api-missing']);
    expect(missing[0].line).toBe(local.split('\n').findLastIndex((line) => line === '### Python') + 1);
    expect(violations(source.replace(python, '> [!NOTE]\n> This SDK has no endpoint for this operation.'), 'faq.md')).toEqual([]);
  });

  test('preserves nested labels and code literals in agent Markdown', () => {
    const nested = `<Tabs items={['Bearer']}>\n${tab('Bearer', group())}\n</Tabs>`;
    const markdown = componentsToMarkdown(nested);
    for (const label of ['Bearer', 'Python', 'TypeScript', 'API']) expect(markdown).toContain(`**${label}:**`);
    const literal = fence('mdx', '<Tab value="do not rewrite">example</Tab>');
    expect(componentsToMarkdown(literal)).toBe(literal);
  });

  test('a card without a description cannot swallow later examples from agent Markdown', () => {
    const page = [
      '<Cards>',
      '  <Card title="Guide" href="/docs/guide">',
      '    Read the guide.',
      '  </Card>',
      '</Cards>',
      '',
      group(),
      '',
      '<Card icon={<span />} title="Next" href="/docs/next" description="Continue here" />',
    ].join('\n');
    const markdown = mdxToCleanMarkdown(page);
    expect(markdown).toContain('- [Guide](/docs/guide): Read the guide.');
    expect(markdown).toContain('- [Next](/docs/next): Continue here');
    for (const label of ['Python', 'TypeScript', 'API']) expect(markdown).toContain(`**${label}:**`);
    for (const language of ['python', 'typescript', 'bash']) expect(markdown).toContain(`\`\`\`${language}`);
    expect(markdown).not.toContain('<Card');
  });

  test('source line reporting survives Markdown grouping', () => {
    const entries: number[] = [];
    walkCodeExamples(parseCodeExamples(source, 'faq.md').units, (unit) => { if (unit.type === 'fence') entries.push(unit.line); });
    expect(entries).toEqual(source.split('\n').flatMap((line, index) => line.startsWith('```') && line !== '```' ? [index + 1] : []));
  });
});

describe('maintained and rendered surfaces', () => {
  test('all maintained sources follow the option contract', () => {
    const files = listCodeExampleFiles(root);
    expect(files.some((file) => file.path.startsWith('kb/source/'))).toBe(true);
    expect(files.some((file) => file.path.startsWith('kb/articles/'))).toBe(true);
    expect(checkCodeExamples(files, { requireApi: true })).toEqual([]);
  });

  test('inventory includes generated, historical, and component-backed code with explicit reasons', () => {
    const inventory = inventoryCodeExamples(root);
    for (const validation of ['generated-copy', 'symbol-reference', 'historical', 'framework-source']) {
      const entries = inventory.filter((entry) => entry.validation === validation);
      expect(entries.map((entry) => entry.validation)).toContain(validation);
      expect(entries.every((entry) => Boolean(entry.reason))).toBe(true);
    }
    expect(inventory.some((entry) => entry.kind === 'FileBuildup source')).toBe(true);
    expect(inventory.some((entry) => entry.kind === 'RepoBrowser source')).toBe(true);
    expect(inventory.some((entry) => entry.kind === 'generated API operation' && entry.path.includes('/api/v3.1/tools/get'))).toBe(true);
  });
});
