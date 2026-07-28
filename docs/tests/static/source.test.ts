import { describe, expect, test } from 'bun:test';

import { mdxToCleanMarkdown } from '../../lib/source';

describe('mdxToCleanMarkdown', () => {
  test('emits source-aware RepoBrowser availability notices', () => {
    const markdown = mdxToCleanMarkdown(`
<RepoBrowser />
<RepoBrowser source="local-workbench" />
<RepoBrowser source="standup" />
<RepoBrowser source="imessage" />
`);

    expect(markdown).toContain('The Slack bot browser is a documentation snapshot');
    expect(markdown).toContain('The local PR reviewer browser is a documentation snapshot');
    expect(markdown).toContain('The standup bot browser is a documentation snapshot');
    expect(markdown).toContain(
      '[platform-imessage](https://github.com/ComposioHQ/platform-imessage)',
    );
    expect(markdown).not.toContain('composio-slack-bot');
  });
});
