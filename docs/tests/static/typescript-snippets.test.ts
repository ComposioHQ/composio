import { describe, expect, test } from 'bun:test';
import {
  checkTypeScriptSnippets,
  collectTypeScriptSnippets,
  createSnippetTwoslasher,
  type TypeScriptSnippet,
} from '../../scripts/check-typescript-snippets';

const twoslasher = createSnippetTwoslasher();
const snippet = (code: string, line = 100): TypeScriptSnippet => ({
  path: 'api-overviews/fixture.mdx', line, code, lang: 'ts',
});
const check = (code: string) => checkTypeScriptSnippets([snippet(code)], twoslasher);

describe('uncovered TypeScript snippet coverage', () => {
  test('collects canonical API/reference, FAQ, and KB Markdown without checking build-owned copies twice', () => {
    const source = '```typescript\nconst value: number = 1;\n```';
    const files = [
      'api-overviews/tools.mdx', 'content/reference/errors.mdx',
      'content/docs/faq.md', 'kb/source/platform/example/public.md', 'kb/articles/example.md',
      'content/docs/quickstart.mdx', 'content/examples/agent.mdx',
    ].map((path) => ({ path, source }));
    expect(collectTypeScriptSnippets(files).map(({ path, line }) => [path, line])).toEqual(
      files.slice(0, 5).map(({ path }) => [path, 1]),
    );
  });

  test('extracts plain Markdown language groups and nested authored-reference wrappers', () => {
    const snippets = collectTypeScriptSnippets([
      { path: 'kb/articles/example.md', source: '### Python\n```python\npass\n```\n### TypeScript\n```ts\nconst x = 1;\n```\n### API\nUse REST.' },
      { path: 'api-overviews/example.mdx', source: '<Callout>\n\n```typescript\nconst y = 2;\n```\n\n</Callout>' },
    ]);
    expect(snippets.map(({ code }) => code)).toEqual(['const x = 1;', 'const y = 2;']);
  });
});

describe('real Twoslash SDK diagnostics', () => {
  test('checks valid fragments and reports SDK typos at their original source line', () => {
    expect(check('await composio.create("user_123");')).toEqual([]);
    const errors = check('// Context\nawait composio.tools.exectue("GMAIL_FETCH_EMAILS", { userId: "u" });');
    expect(errors.some(({ line, message }) => line === 102 && message.includes('exectue') && /\[TS(?:2339|2551)\]/.test(message))).toBe(true);
  }, 30000);

  test('uses compiler scope resolution instead of erasing local or nested bindings', () => {
    expect(check('const composio = { localOnly: () => 1 };\ncomposio.localOnly();')).toEqual([]);
    const errors = check('function nested(composio: { localOnly(): void }) { composio.localOnly(); }\nawait composio.tools.exectue("X", { userId: "u" });');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toBe(102);
    expect(errors[0]?.message).toContain('exectue');
  }, 30000);

  test('retains non-SDK diagnostics instead of filtering missing names or incompatible values', () => {
    const errors = check('const value: number = "wrong";\nmissing_name();');
    expect(errors.some(({ message }) => message.includes('[TS2322]'))).toBe(true);
    expect(errors.some(({ message }) => message.includes('[TS2304]'))).toBe(true);
  }, 30000);

  test('checks hidden cut sections and refuses blanket suppressions without hiding their compiler errors', () => {
    const errors = check('// @noErrors\nconst value: number = "wrong";\n// ---cut---\nconsole.log(value);');
    expect(errors.some(({ rule, line }) => rule === 'typescript-directive' && line === 101)).toBe(true);
    expect(errors.some(({ line, message }) => line === 102 && message.includes('[TS2322]'))).toBe(true);
    expect(check('const text = "// @noErrors";')).toEqual([]);
  }, 30000);
});
