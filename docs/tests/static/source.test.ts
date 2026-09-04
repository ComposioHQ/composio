import { describe, expect, test } from 'bun:test';

import { replaceRepoBrowserMarkdown } from '../../lib/repo-browser-markdown';

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
      '[platform-imessage](https://github.com/ComposioHQ/platform-imessage)',
    );
    expect(markdown).toContain(
      'This code browser is a documentation snapshot; a public repository is not available.',
    );
    expect(markdown).not.toContain('composio-slack-bot');
  });
});
