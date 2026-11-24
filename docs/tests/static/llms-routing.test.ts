import { expect, test } from 'bun:test';
import { GET } from '../../app/llms.txt/route';
import { source, referenceSource, examplesSource, knowledgeBaseSource, getLLMText } from '../../lib/source';

test('routing map is bounded and covers the current developer decisions', async () => {
  const text = await GET().text();
  // Allow room for the three DEVREL-333 governance links.
  expect(text.length).toBeLessThan(6400);
  const primary = text.split('## Optional')[0];
  for (const path of ['docs', 'docs/agent-setup', 'docs/quickstart', 'docs/agent-plugins',
    'docs/authentication', 'docs/sessions/tool-access', 'kb',
    'docs/governance/action-permissions', 'docs/governance/approvals', 'docs/firewall']) {
    expect(primary).toContain(`https://docs.composio.dev/${path}.md`);
  }
  expect(primary).toMatch(/\[Firewall\].*Experimental:.*prompt-injection checks on tool results.*natural-language block rules on calls and results/);
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

test('Firewall availability and coverage survive agent Markdown rendering', async () => {
  const page = source.getPage(['firewall']);
  if (!page) throw new Error('Firewall guide is missing');
  const text = await getLLMText({
    ...page,
    data: { ...page.data, getText: () => page.data.getText('raw') },
  }, { includeGuardrails: false });
  expect(text).toContain('Firewall is experimental and available on paid plans');
  expect(text).toContain('They do not redact or mask PII');
  expect(text).toContain('natural-language classification is not deterministic DLP');
  expect(text).toContain('It does not screen LLM input or output');
  expect(text).toContain("hooks don't currently run on Composio meta tools themselves");
});
