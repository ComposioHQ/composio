import { expect, test } from 'bun:test';
import { GET } from '../../app/api/og/route';
import { getOgImageUrl } from '../../lib/source';

test('docs host renders a PNG for the advertised title URL', async () => {
  for (const title of ['Welcome', 'Authentication & OAuth / setup', 'Very long title '.repeat(20), '']) {
    const url = getOgImageUrl('docs', ['authentication'], title);
    expect(new URL(url).origin).toBe('https://docs.composio.dev');
    const response = GET(new Request(url));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    expect(bytes.readUInt32BE(16)).toBe(1200);
    expect(bytes.readUInt32BE(20)).toBe(630);
  }
});

test('the docs homepage uses a distinct card without changing article cards', async () => {
  const url = getOgImageUrl('docs', [], 'Welcome');
  expect(new URL(url).searchParams.get('variant')).toBe('home');
  expect(new URL(getOgImageUrl('reference', [], 'API Reference')).searchParams.get('title')).toBe('API Reference');
  const response = GET(new Request(url));
  expect(response.headers.get('content-type')).toBe('image/png');
  const bytes = Buffer.from(await response.arrayBuffer());
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(bytes.readUInt32BE(16)).toBe(1200);
  expect(bytes.readUInt32BE(20)).toBe(630);
});
