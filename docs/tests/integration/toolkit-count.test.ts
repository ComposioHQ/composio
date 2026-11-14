import { expect, test } from 'bun:test';
import { TOOLKIT_COUNT_LABEL } from '../../lib/toolkit-count';
import { fetchPage } from './helpers';

async function paragraphText(html: string): Promise<string> {
  let content = '';
  await new HTMLRewriter()
    .on('main p', {
      text(chunk) {
        content += chunk.text;
      },
    })
    .transform(new Response(html))
    .text();
  return content;
}

test('paragraph extraction ignores metadata and script contents', async () => {
  for (const closeTag of ['</script>', '</script >']) {
    const html = `<head><meta name="description" content="1,500+ apps"></head>
      <body><main><script>const text = '<p>1,500+ apps</p>';${closeTag}
      <p>1,500+ <strong>toolkits</strong></p></main></body>`;
    expect(await paragraphText(html)).toBe('1,500+ toolkits');
  }
});

test('catalog claims use apps in marketing copy and toolkits in technical docs', async () => {
  for (const [path, noun] of [
    ['/docs', 'apps'],
    ['/docs/quickstart', 'apps'],
    ['/docs/providers/openai', 'apps'],
    ['/docs/claude-code-plugin', 'apps'],
    ['/reference', 'toolkits'],
    ['/toolkits/meta-tools', 'toolkits'],
    ['/toolkits/meta-tools/search_tools', 'toolkits'],
    ['/docs/quickstart.md', 'apps'],
    ['/reference.md', 'toolkits'],
    ['/llms.txt', 'apps'],
  ]) {
    const response = await fetchPage(path);
    expect(response.status, path).toBe(200);
    const text = await response.text();
    // Parse authored paragraphs so metadata and hydration payloads cannot satisfy body assertions.
    const body = response.headers.get('content-type')?.includes('text/html')
      ? await paragraphText(text)
      : text;
    if (path !== '/docs/providers/openai') {
      expect(body, path).toContain(`${TOOLKIT_COUNT_LABEL} ${noun}`);
    }
    expect(text, path).not.toContain('%TOOLKIT_COUNT%');
    if (path === '/docs/providers/openai') {
      expect(text).toContain(`name="description" content="Build an agent with OpenAI and enable it to use ${TOOLKIT_COUNT_LABEL} apps with Composio.`);
    }
  }
});
