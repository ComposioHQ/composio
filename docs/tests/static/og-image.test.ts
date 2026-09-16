import { expect, test } from 'bun:test';
import { GET, parseOgParams } from '../../app/api/og/route';
import { getOgImageUrl } from '../../lib/source';

async function expectPng(url: string) {
  const response = await GET(new Request(url));
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('image/png');
  const bytes = Buffer.from(await response.arrayBuffer());
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(bytes.readUInt32BE(16)).toBe(1200);
  expect(bytes.readUInt32BE(20)).toBe(630);
}

test('docs host renders a PNG for the advertised title URL', async () => {
  for (const title of ['Welcome', 'Authentication & OAuth / setup', 'Very long title '.repeat(20), '']) {
    const url = getOgImageUrl('docs', ['authentication'], title);
    expect(new URL(url).origin).toBe('https://docs.composio.dev');
    await expectPng(url);
  }
});

test('every section renders its own card', async () => {
  await expectPng(getOgImageUrl('docs', [], 'Welcome', 'Site description'));
  await expectPng(getOgImageUrl('toolkits', ['zendesk'], 'Zendesk - Composio Toolkit', ''));
  await expectPng(getOgImageUrl('reference', ['connected-accounts'], 'Connected Accounts', 'Manage accounts', {
    version: 'v3.1',
  }));
  await expectPng(getOgImageUrl('docs', ['changelog', '2026', '09', '04'], 'September releases', 'Updates', {
    date: 'Sep 4, 2026',
  }));
});

test('the URL builder names the section and forwards extras', () => {
  const home = new URL(getOgImageUrl('docs', [], 'Welcome', 'desc'));
  expect(home.searchParams.get('section')).toBe('home');
  expect(home.searchParams.get('description')).toBe('desc');

  const changelog = new URL(getOgImageUrl('docs', ['changelog', '2026', '09', '04'], 'Title', 'Updates', { date: 'Sep 4, 2026' }));
  expect(changelog.searchParams.get('section')).toBe('changelog');
  expect(changelog.searchParams.get('date')).toBe('Sep 4, 2026');

  const toolkit = new URL(getOgImageUrl('toolkits', ['github'], 'GitHub - Composio Toolkit', 'desc', {
    logo: 'https://logos.composio.dev/api/github',
  }));
  expect(toolkit.searchParams.get('section')).toBe('toolkits');
  expect(toolkit.searchParams.get('logo')).toBe('https://logos.composio.dev/api/github');

  const reference = new URL(getOgImageUrl('reference', [], 'API Reference', 'desc', { version: 'v3.1' }));
  expect(reference.searchParams.get('version')).toBe('v3.1');
  expect(reference.searchParams.get('title')).toBe('API Reference');
});

test('the route only honors toolkit logos from Composio hosts', () => {
  const allowed = parseOgParams(new Request('https://docs.composio.dev/api/og?section=toolkits&logo=https%3A%2F%2Flogos.composio.dev%2Fapi%2Fgithub'));
  expect(allowed.logo).toBe('https://logos.composio.dev/api/github?theme=dark');

  for (const logo of ['https://evil.example/x.png', 'http://logos.composio.dev/api/github', 'not a url', 'data:image/png;base64,AAAA']) {
    const blocked = parseOgParams(new Request(`https://docs.composio.dev/api/og?section=toolkits&logo=${encodeURIComponent(logo)}`));
    expect(blocked.logo).toBeNull();
  }
});

test('unknown sections and the legacy home variant fall back safely', () => {
  expect(parseOgParams(new Request('https://docs.composio.dev/api/og?section=nope&title=x')).section).toBe('docs');
  expect(parseOgParams(new Request('https://docs.composio.dev/api/og?variant=home')).section).toBe('home');
  expect(parseOgParams(new Request('https://docs.composio.dev/api/og')).title).toBe('Composio Docs');
  expect(parseOgParams(new Request(`https://docs.composio.dev/api/og?title=${'x'.repeat(500)}`)).title.length).toBe(120);
});

test('cards default to the dark surface and accept theme=light', async () => {
  expect(parseOgParams(new Request('https://docs.composio.dev/api/og?title=x')).theme).toBe('dark');
  const light = parseOgParams(new Request('https://docs.composio.dev/api/og?title=x&theme=light&logo=https%3A%2F%2Flogos.composio.dev%2Fapi%2Fgithub'));
  expect(light.theme).toBe('light');
  expect(light.logo).toBe('https://logos.composio.dev/api/github');
  await expectPng('https://docs.composio.dev/api/og?section=toolkits&title=GitHub&theme=light');
  await expectPng('https://docs.composio.dev/api/og?section=home&theme=light');
});
