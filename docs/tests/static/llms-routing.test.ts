import { expect, test } from 'bun:test';
import { GET } from '../../app/llms.txt/route';
import { source, referenceSource, examplesSource, knowledgeBaseSource } from '../../lib/source';

test('routing map is bounded and covers the current developer decisions', async () => {
  const text = await GET().text();
  // 6400: the map sat at 5966/6000, so the three DEVREL-333 governance lines
  // (plus one duplicate link removed) could not fit under the old cap.
  expect(text.length).toBeLessThan(6400);
  const primary = text.split('## Optional')[0];
  for (const path of ['docs', 'docs/agent-setup', 'docs/quickstart', 'docs/agent-plugins',
    'docs/authentication', 'docs/configuring-sessions', 'kb',
    'docs/governance/action-permissions', 'docs/governance/approvals', 'docs/firewall']) {
    expect(primary).toContain(`https://docs.composio.dev/${path}.md`);
  }
  expect(text).toContain('[Complete documentation index](https://docs.composio.dev/llms-index.txt)');
  expect(text).not.toMatch(/^- https?:/m);
  expect(text).toContain('REST v3.0 is legacy');
  const pages = new Set([source, referenceSource, examplesSource, knowledgeBaseSource]
    .flatMap(collection => collection.getPages().map(page => page.url)));
  pages.add('/docs/changelog');
  for (const match of text.matchAll(/\]\(https:\/\/docs\.composio\.dev([^)]*)\.md\)/g)) {
    expect(pages.has(match[1]), `unresolved route: ${match[1]}`).toBe(true);
  }
});
