import { expect, test } from 'bun:test';
import { inflateSync } from 'node:zlib';
import { GET, parseOgParams, toolkitCardTitle } from '../../app/api/og/route';
import { getOgImageUrl } from '../../lib/source';
import { HOME_OG_DESCRIPTION } from '../../lib/toolkit-count';

async function expectPng(url: string) {
  const response = await GET(new Request(url));
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('image/png');
  const bytes = Buffer.from(await response.arrayBuffer());
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(bytes.readUInt32BE(16)).toBe(1200);
  expect(bytes.readUInt32BE(20)).toBe(630);
}

/** Decodes the route's 8-bit RGB/RGBA PNG output into unfiltered pixel rows. */
function decodePng(bytes: Buffer) {
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const [depth, colorType] = [bytes[24], bytes[25]];
  expect(depth).toBe(8);
  expect([2, 6]).toContain(colorType);
  const channels = colorType === 6 ? 4 : 3;
  const chunks: Buffer[] = [];
  for (let at = 8; at < bytes.length; ) {
    const length = bytes.readUInt32BE(at);
    if (bytes.toString('ascii', at + 4, at + 8) === 'IDAT') chunks.push(bytes.subarray(at + 8, at + 8 + length));
    at += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x];
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      const p = left + up - upLeft;
      const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
      const predictor = [0, left, up, (left + up) >> 1, pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft][filter];
      pixels[y * stride + x] = (value + predictor) & 0xff;
    }
  }
  return { width, height, channels, pixels };
}

/** Horizontal center of the dark title glyphs below the header row. */
async function titleCenter(title: string) {
  const response = await GET(new Request(`https://docs.composio.dev/api/og?theme=light&title=${encodeURIComponent(title)}`));
  const { width, height, channels, pixels } = decodePng(Buffer.from(await response.arrayBuffer()));
  let [left, right] = [width, -1];
  for (let y = 150; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * channels;
      if (pixels[at] < 90 && pixels[at + 1] < 90 && pixels[at + 2] < 90) {
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
  }
  expect(right).toBeGreaterThan(left);
  return (left + right) / 2;
}

test('titles render horizontally centered whether or not they can wrap', async () => {
  // Single words cannot wrap; balanced wrapping once pushed them ~100px right.
  for (const title of ['Firewall', 'Introduction', 'Tool Router']) {
    expect(Math.abs((await titleCenter(title)) - 600)).toBeLessThan(15);
  }
});

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
  // Both the root layout and the /docs index page build this URL; the home
  // card ignores the page description so they agree and carry the live count.
  const home = new URL(getOgImageUrl('docs', [], 'Welcome', 'page description'));
  expect(home.searchParams.get('section')).toBe('home');
  expect(home.searchParams.get('description')).toBe(HOME_OG_DESCRIPTION);
  expect(HOME_OG_DESCRIPTION).toMatch(/^Build AI agents with [\d,]+\+ apps\./);

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

test('only catalog toolkit titles get the Toolkit suffix', () => {
  expect(toolkitCardTitle('GitHub - Composio Toolkit')).toBe('GitHub Toolkit');
  expect(toolkitCardTitle('Google Sheets - Composio Toolkit')).toBe('Google Sheets Toolkit');
  expect(toolkitCardTitle('Toolkits')).toBe('Toolkits');
  expect(toolkitCardTitle('Premium Tools')).toBe('Premium Tools');
});

test('a description that only repeats the title is dropped', () => {
  const dup = parseOgParams(new Request('https://docs.composio.dev/api/og?section=reference&title=Connected%20Accounts&description=connected%20accounts'));
  expect(dup.description).toBe('');
  const real = parseOgParams(new Request('https://docs.composio.dev/api/og?section=reference&title=Connected%20Accounts&description=Manage%20accounts'));
  expect(real.description).toBe('Manage accounts');
});
