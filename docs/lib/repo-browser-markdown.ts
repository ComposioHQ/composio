const REPO_BROWSER_PATTERN = /<RepoBrowser\b([^>]*)\/>/g;

const REPO_BROWSER_NOTICES: Record<string, string> = {
  'slack-bot':
    'The Slack bot browser is a documentation snapshot; a public repository is not available.',
  'local-workbench':
    'The local PR reviewer browser is a documentation snapshot; a public repository is not available.',
  standup:
    'The standup bot browser is a documentation snapshot; a public repository is not available.',
  imessage:
    'The iMessage implementation is maintained in [platform-imessage](https://github.com/ComposioHQ/platform-imessage).',
};

export function replaceRepoBrowserMarkdown(markdown: string): string {
  return markdown.replace(REPO_BROWSER_PATTERN, (_, props: string) => {
    const source = props.match(/\bsource="([^"]+)"/)?.[1] ?? 'slack-bot';
    const notice =
      REPO_BROWSER_NOTICES[source] ??
      'This code browser is a documentation snapshot; a public repository is not available.';
    return `\n> ${notice}\n`;
  });
}
