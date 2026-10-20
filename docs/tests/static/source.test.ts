import { describe, expect, test } from 'bun:test';

import { replaceRepoBrowserMarkdown } from '../../lib/repo-browser-markdown';
import { mdxToCleanMarkdown } from '../../lib/source';

describe('mdxToCleanMarkdown code literals', () => {
  test.each(['```typescript', '~~~tsx', '````typescript title="types.ts"'])(
    'preserves generic types and JSX literals in %s fences',
    opening => {
      const fence = opening.match(/^[`~]+/)![0];
      const block = [
        opening,
        'create(): Promise<Session<TProvider>>',
        '  const literal = <Card title="literal" href="/literal" />;',
        '  const api = "<ApiBaseUrl />";',
        '',
        '',
        '  // Keep indentation and blank lines.',
        fence.length > 3 ? '```' : '// nested delimiter is not a closing fence',
        fence,
      ].join('\n');
      const markdown = mdxToCleanMarkdown(
        `<Callout title="Actual component">Keep the example.</Callout>\n\n${block}`
      );
      expect(markdown).toContain(block);
      expect(markdown).toContain('> **Actual component**: Keep the example.');
      expect(markdown).not.toContain('<Callout');
    }
  );

  test('keeps inline code, including embedded backticks and component names', () => {
    const literal = '`Promise<Session<TProvider>>` and ``<Card title="`literal`" />``';
    expect(
      mdxToCleanMarkdown(`${literal}\n\n<Card title="Real card" href="/real">Read more</Card>`)
    ).toBe(`${literal}\n\n- [Real card](/real): Read more`);
  });

  test('treats same-line triple backticks as inline code, not an opening fence', () => {
    const literal = '```Promise<Session<T>>```';
    expect(mdxToCleanMarkdown(`${literal}\n\n<ApiBaseUrl />`)).toBe(
      `${literal}\n\n\`https://backend.composio.dev/api/v3.1\``
    );
  });

  test('preserves unclosed fences and matches closing marker lengths', () => {
    const block = '~~~~typescript\nconst x = <Literal />;\n~~~\nPromise<Session<T>>';
    expect(mdxToCleanMarkdown(block)).toBe(block);
  });

  test('still removes Twoslash directives without corrupting code types', () => {
    const markdown = mdxToCleanMarkdown(
      [
        '```typescript',
        '// @noErrors',
        '// @filename: example.ts',
        '// ---cut---',
        'const value: Promise<Session<T>> = create();',
        '// ^?',
        '```',
      ].join('\n')
    );
    expect(markdown).toBe('```typescript\nconst value: Promise<Session<T>> = create();\n```');
  });
});

describe('replaceRepoBrowserMarkdown', () => {
  test('emits source-aware RepoBrowser availability notices', () => {
    const markdown = replaceRepoBrowserMarkdown(`
<RepoBrowser />
<RepoBrowser source="local-workbench" />
<RepoBrowser source="standup" />
<RepoBrowser source="imessage" />
<RepoBrowser source="unknown" />
`);

    expect(markdown).toContain('The Slack bot browser is a documentation snapshot');
    expect(markdown).toContain('The local PR reviewer browser is a documentation snapshot');
    expect(markdown).toContain('The standup bot browser is a documentation snapshot');
    expect(markdown).toContain(
      '[platform-imessage](https://github.com/ComposioHQ/platform-imessage)'
    );
    expect(markdown).toContain(
      'This code browser is a documentation snapshot; a public repository is not available.'
    );
    expect(markdown).not.toContain('composio-slack-bot');
  });
});
