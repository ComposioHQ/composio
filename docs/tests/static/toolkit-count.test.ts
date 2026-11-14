import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { frontmatter } from 'fumadocs-core/content/md/frontmatter';
import { docs } from '../../source.config';
import { readPageByUrl } from '../../agent/lib/docs';
import context from '../../agent/instructions/context';
import { TOOLKIT_COUNT_LABEL, resolveToolkitCount } from '../../lib/toolkit-count';
import { getMetaToolBySlug } from '../../lib/meta-tools-data';
import { generateIndexMdx, generateToolMdx } from '../../scripts/generate-meta-tools';

test('one catalog count reaches frontmatter, agent content, and meta-tool display copy', async () => {
  expect(resolveToolkitCount('%TOOLKIT_COUNT% toolkits, %TOOLKIT_COUNT% apps'))
    .toBe(`${TOOLKIT_COUNT_LABEL} toolkits, ${TOOLKIT_COUNT_LABEL} apps`);
  for (const [path, noun] of [
    ['content/docs/providers/openai.mdx', 'apps'],
    ['content/docs/claude-code-plugin.mdx', 'apps'],
  ]) {
    const parsed = docs.docs.schema.parse(frontmatter(readFileSync(path, 'utf8')).data);
    expect(parsed.description).toContain(`${TOOLKIT_COUNT_LABEL} ${noun}`);
  }
  expect(readPageByUrl('/docs/quickstart')?.raw).toContain(`${TOOLKIT_COUNT_LABEL} apps`);
  expect(readPageByUrl('/reference')?.raw).toContain(`${TOOLKIT_COUNT_LABEL} toolkits`);
  expect(readPageByUrl('/docs/providers/custom-providers/typescript')?.raw)
    .toContain(`call tools across ${TOOLKIT_COUNT_LABEL} toolkits`);
  expect(context.markdown).toContain(`${TOOLKIT_COUNT_LABEL} toolkits`);
  expect((await getMetaToolBySlug('COMPOSIO_SEARCH_TOOLS'))?.summary)
    .toContain(`${TOOLKIT_COUNT_LABEL} toolkits`);
});

test('meta-tool regeneration retains the count placeholder instead of the API count', () => {
  const tools = JSON.parse(readFileSync('public/data/meta-tools.json', 'utf8'));
  expect(generateIndexMdx(tools)).toBe(readFileSync('content/toolkits/meta-tools/index.mdx', 'utf8'));
  const search = tools.find((tool: { slug: string }) => tool.slug === 'COMPOSIO_SEARCH_TOOLS');
  expect(generateToolMdx(search)).toBe(readFileSync('content/toolkits/meta-tools/search_tools.mdx', 'utf8'));
  expect(generateToolMdx(search)).toContain('%TOOLKIT_COUNT% toolkits');
});
