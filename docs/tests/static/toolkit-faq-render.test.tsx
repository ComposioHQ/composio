import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { FaqSection } from '@/components/toolkits/faq-section';
import { parseToolkitFaq } from '@/lib/toolkit-faq';

test('closed toolkit FAQs retain setup instructions in server-rendered HTML', () => {
  const faq = parseToolkitFaq(readFileSync('content/toolkits/faq/github.md', 'utf8'));
  const html = renderToStaticMarkup(<FaqSection faq={faq} />);

  expect(html).toContain('https://backend.composio.dev/api/v1/auth-apps/add');
  expect(html).toContain('Register application');
  expect(html).toContain('Organization access');
  expect(html).toContain('<summary');
  expect(html).toContain('id="how-do-i-set-up-custom-oauth-credentials-for-github"');
});
