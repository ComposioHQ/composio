import { describe, expect, spyOn, test } from 'bun:test';
import { NextRequest, NextResponse } from 'next/server';
import { proxy } from '../../proxy';

function request(pathname: string, accept = 'text/html') {
  return new NextRequest(`https://docs.composio.dev${pathname}`, {
    headers: { Accept: accept },
  });
}

function vary(response: Response) {
  return (response.headers.get('Vary') ?? '').split(',').map(value => value.trim().toLowerCase());
}

describe('Markdown content negotiation', () => {
  test('HTML responses vary on Accept', () => {
    const response = proxy(request('/docs/quickstart'));
    expect(vary(response)).toContain('accept');
  });

  for (const accept of ['text/markdown', 'text/plain']) {
    test(`${accept} rewrites to Markdown and varies on Accept`, () => {
      const response = proxy(request('/docs/quickstart', accept));
      expect(vary(response)).toContain('accept');
      expect(response.headers.get('x-middleware-rewrite')).toBe('https://docs.composio.dev/llms.mdx/docs/quickstart');
    });
  }

  test('HTML-only Fern normalization redirects also vary on Accept', () => {
    const pathname = '/reference/api-reference/files/post-files-upload-request';
    const html = proxy(request(pathname));
    expect(html.status).toBe(301);
    expect(html.headers.get('Location')).toBe('https://docs.composio.dev/reference/api-reference/files/postFilesUploadRequest');
    expect(vary(html)).toContain('accept');

    const markdown = proxy(request(pathname, 'text/markdown'));
    expect(markdown.headers.get('x-middleware-rewrite')).toBe(`https://docs.composio.dev/llms.mdx${pathname}`);
    expect(vary(markdown)).toContain('accept');
  });

  for (const method of ['next', 'rewrite', 'redirect'] as const) {
    test(`${method} preserves existing Vary dimensions`, () => {
      const existing = new NextResponse(null, { headers: { Vary: 'Cookie, RSC, Next-Router-State-Tree' } });
      const mocked = spyOn(NextResponse, method).mockReturnValue(existing);
      try {
        const pathname = method === 'redirect'
          ? '/reference/api-reference/files/post-files-upload-request'
          : '/docs/quickstart';
        const response = proxy(request(pathname, method === 'rewrite' ? 'text/markdown' : 'text/html'));
        expect(vary(response)).toEqual(['cookie', 'rsc', 'next-router-state-tree', 'accept']);
      } finally {
        mocked.mockRestore();
      }
    });
  }
});

