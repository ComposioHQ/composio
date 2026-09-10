import { expect, test } from 'bun:test';
import { fetchPage } from './helpers';

test('an agent can discover the changelog and read a dated release', async () => {
  const quickstart = await fetchPage('/docs/quickstart.md');
  expect(quickstart.status).toBe(200);
  expect(await quickstart.text()).toContain('https://docs.composio.dev/docs/changelog.md');
  const index = await fetchPage('/docs/changelog.md');
  expect(index.status).toBe(200);
  expect(index.headers.get('content-type')).toContain('text/markdown');
  const text = await index.text();
  const dated = text.match(/https:\/\/docs\.composio\.dev(\/docs\/changelog\/\d{4}\/\d{2}\/\d{2}\.md)/);
  expect(dated).not.toBeNull();
  const release = await fetchPage(dated![1]);
  expect(release.status).toBe(200);
  expect(release.headers.get('content-type')).toContain('text/markdown');
  expect((await release.text()).length).toBeGreaterThan(200);
});
