/**
 * Pure collection/source-mapping tests: no Python or uv required.
 * Real mypy/SDK regression fixtures run separately in the Python-enabled CI job:
 * bun scripts/python-snippets/test-helper.ts
 */
import { describe, test, expect } from 'bun:test';
import {
  collectPythonSnippets,
  pythonSnippetViolations,
  type PythonSnippet,
  type PythonHelperResult,
} from '../../scripts/check-python-snippets';


/** One snippet per call; `line` is the fence line, so snippet line N reports as `line + N`. */
function snippet(id: string, code: string, line = 100): PythonSnippet {
  return { id, path: 'content/docs/page.mdx', line, code, typeCheck: true };
}


describe('collectPythonSnippets', () => {
  const source = [
    '# Page', //                                                                   1
    '', //                                                                         2
    '<Tabs groupId="language" items={[\'Python\', \'TypeScript\']} persist>', //    3
    '<Tab value="Python">', //                                                     4
    '```python', //                                                                5
    'composio.tools.get(user_id="u")', //                                         6
    '```', //                                                                      7
    '</Tab>', //                                                                   8
    '<Tab value="TypeScript">', //                                                 9
    '```typescript', //                                                            10
    'await composio.tools.get("u");', //                                          11
    '```', //                                                                      12
    '</Tab>', //                                                                   13
    '</Tabs>', //                                                                  14
    '', //                                                                         15
    '{/* code-example: single-language reason="Python-only helper" */}', //        16
    '```py', //                                                                    17
    'print("helper")', //                                                         18
    '```', //                                                                      19
    '', //                                                                         20
    '<Tabs groupId="language" items={[\'Python (previous)\', \'TypeScript (previous)\']} persist>', // 21
    '<Tab value="Python (previous)">', //                                          22
    '```python', //                                                                23
    'from composio_openai import ComposioToolSet', //                             24
    '```', //                                                                      25
    '</Tab>', //                                                                   26
    '<Tab value="TypeScript (previous)">', //                                      27
    '```typescript', //                                                            28
    'const toolset = new OpenAIToolSet();', //                                    29
    '```', //                                                                      30
    '</Tab>', //                                                                   31
    '</Tabs>', //                                                                  32
    '', //                                                                         33
    '{/* code-example: single-language reason="Legacy processors" */}', //         34
    '```python title="Python (previous)"', //                                      35
    'toolset = ComposioToolSet()', //                                             36
    '```', //                                                                      37
  ].join('\n');
  const snippets = collectPythonSnippets([{ path: 'content/docs/page.mdx', source }]);

  test('collects python and py fences, including exempted ones, in document order', () => {
    expect(snippets.map(({ line, code }) => [line, code])).toEqual([
      [5, 'composio.tools.get(user_id="u")'],
      [17, 'print("helper")'],
      [23, 'from composio_openai import ComposioToolSet'],
      [35, 'toolset = ComposioToolSet()'],
    ]);
  });

  test('assigns unique module ids', () => {
    expect(new Set(snippets.map(({ id }) => id)).size).toBe(snippets.length);
    for (const { id } of snippets) expect(id).toMatch(/^\w+$/);
  });

  test('skips type-checking legacy fences under a "(previous)" tab or title', () => {
    expect(snippets.map(({ typeCheck }) => typeCheck)).toEqual([true, true, false, false]);
  });
});

describe('pythonSnippetViolations', () => {
  const result: PythonHelperResult = {
    syntax: [{ id: 's0', line: 2, message: 'invalid syntax' }],
    api: [{ id: 's1', line: 3, message: 'SDK diagnostic [call-overload]' }],
    other: [{ id: 's1', line: 4, message: 'Third-party diagnostic [arg-type]' }],
    directives: [{ id: 's1', line: 5, message: 'Unused "type: ignore" comment [unused-ignore]' }],
    mypy: [],
  };

  test('maps syntax, SDK, and suppression errors to source locations, keeping third-party errors separate', () => {
    expect(pythonSnippetViolations([snippet('s0', 'pass'), snippet('s1', 'pass', 200)], result)).toEqual([
      { path: 'content/docs/page.mdx', line: 102, rule: 'python-syntax', message: 'invalid syntax' },
      { path: 'content/docs/page.mdx', line: 203, rule: 'python-api', message: 'SDK diagnostic [call-overload]' },
      { path: 'content/docs/page.mdx', line: 205, rule: 'python-directive', message: 'Unused "type: ignore" comment [unused-ignore]' },
    ]);
  });

  test('fails rather than silently dropping helper diagnostics for an unknown module', () => {
    expect(() => pythonSnippetViolations([], result)).toThrow('unknown snippet s0');
  });
});
