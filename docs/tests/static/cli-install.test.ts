import { expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CliInstallTabs, detectCliPlatform } from '../../components/cli-install-tabs';

test('CLI platform selection favors the desktop OS and falls back to Linux on mobile or unknown clients', () => {
  const cases: [string, number, string][] = [
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 0, 'windows'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0, 'macos'],
    ['Mozilla/5.0 (X11; Linux x86_64)', 0, 'linux'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile', 5, 'linux'],
    ['Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', 5, 'linux'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5, 'linux'],
    ['Mozilla/5.0 (Linux; Android 15)', 5, 'linux'],
    ['Mozilla/5.0 (Windows Phone 10.0; Android 6.0) Mobile', 5, 'linux'],
    ['', 0, 'linux'],
  ];
  for (const [agent, touchPoints, expected] of cases) {
    expect(detectCliPlatform(agent, touchPoints)).toBe(expected);
  }
});

test('server rendering keeps Linux selected even though macOS is the first system tile', () => {
  const html = renderToStaticMarkup(createElement(CliInstallTabs, null, 'Install command'));
  const selected = html.match(/<button[^>]*aria-selected="true"[^>]*>[\s\S]*?<\/button>/)?.[0];
  expect(selected).toContain('Linux');
  expect(html.match(/role="tab"/g)).toHaveLength(3);
});
