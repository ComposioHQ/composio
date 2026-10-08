import { describe, expect, test, mock } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { filterToolkits, withInstantEligibility } from '../../lib/instant-toolkit-filter';
import { fetchInstantToolkitSlugs } from '../../lib/instant-toolkit-api';
import { InstantBolt } from '../../components/toolkits/instant-bolt';
import { InstantBadge } from '../../components/toolkits/instant-badge';

const toolkits = [
  { slug: 'alpha', name: 'Alpha search', instant: { supported: true } },
  { slug: 'beta', name: 'Beta search', instant: { supported: false } },
  { slug: 'gamma', name: 'Gamma' },
].map(toolkit => ({ ...toolkit, logo: null, category: null, toolCount: 1, triggerCount: 0 }));

describe('Instant catalog filter', () => {
  test('strict eligibility intersects name/slug search; clearing restores all', () => {
    expect(filterToolkits(toolkits, '', true).map(t => t.slug)).toEqual(['alpha']);
    expect(filterToolkits(toolkits, ' SEARCH ', true).map(t => t.slug)).toEqual(['alpha']);
    expect(filterToolkits(toolkits, 'beta', true)).toEqual([]);
    expect(filterToolkits(toolkits, 'GAMMA', false).map(t => t.slug)).toEqual(['gamma']);
    expect(filterToolkits(toolkits, '', false)).toEqual(toolkits);
  });

  test('live eligibility updates only existing public snapshot rows, replacing stale support', () => {
    const merged = withInstantEligibility(toolkits, ['GAMMA', 'not-in-snapshot']);
    expect(filterToolkits(merged, '', true).map(t => t.slug)).toEqual(['gamma']);
    expect(merged).toHaveLength(toolkits.length);
  });

  test('the card is a toggle, guide is separate, popular rows hide during filtering', () => {
    const source = readFileSync(new URL('../../components/toolkits/toolkits-landing.tsx', import.meta.url), 'utf8');
    expect(source).toContain('aria-pressed={instantOnly}');
    expect(source).toContain('href="/docs/instant-tools"');
    expect(source).toContain('setSearch(\'\'); setInstantOnly(false)');
    expect(source).toContain('!instantOnly && !deferredSearch');
    expect(source).toContain('Instant toolkit availability could not be loaded.');
  });

  test('uses the exact dashboard Nucleo bolt geometry, with neutral outline badges', () => {
    const outline = renderToStaticMarkup(<InstantBolt />);
    const filled = renderToStaticMarkup(<InstantBolt filled />);
    expect(outline).toContain('viewBox="0 0 18 18"');
    expect(outline).toContain('M14.7505 7.25H9.49905');
    expect(outline).toContain('stroke-width="1.5"');
    expect(filled).toContain('M15.6449 7.0522C15.474');
    expect(filled).not.toContain('stroke-width');
    expect(renderToStaticMarkup(<InstantBadge />)).toContain('M14.7505 7.25H9.49905');
  });
});

describe('live Instant eligibility', () => {
  const item = (slug: string, supported = true) => ({ slug, type: 'native', enabled: true, instant: { supported } });
  const fakeFetch = (fn: (input: Parameters<typeof fetch>[0], init?: RequestInit) => Promise<Response>) => Object.assign(mock(fn), { preconnect: fetch.preconnect });

  test('follows cursors, requests pricing, deduplicates and only accepts explicit support', async () => {
    const fetcher = fakeFetch(async input => String(input).includes('cursor=next')
      ? Response.json({ items: [item('ALPHA'), item('beta'), item('no', false)], next_cursor: null })
      : Response.json({ items: [item('alpha'), { slug: 'null', instant: null }, { slug: 'missing' }], next_cursor: 'next' }));
    expect(await fetchInstantToolkitSlugs('test-key', fetcher)).toEqual(['alpha', 'beta']);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[0][0])).toContain('include_pricing=true');
    expect(fetcher.mock.calls[0][1]?.headers).toEqual({ 'x-api-key': 'test-key' });
  });

  test('partial responses, missing eligibility, malformed data and repeated cursors fail rather than imply no results', async () => {
    for (const payload of [{ items: [{ slug: 'alpha' }] }, { items: [{ slug: 'alpha', instant: { supported: 'true' } }] }, { items: [item('alpha')], next_cursor: 'loop' }]) {
      await expect(fetchInstantToolkitSlugs('test-key', fakeFetch(async () => Response.json(payload)))).rejects.toThrow();
    }
    let calls = 0;
    await expect(fetchInstantToolkitSlugs('test-key', fakeFetch(async () => ++calls === 1 ? Response.json({ items: [item('alpha')], next_cursor: 'next' }) : new Response('', { status: 503 })))).rejects.toThrow();
  });

  test('explicit all-false metadata is a genuine empty result', async () => {
    expect(await fetchInstantToolkitSlugs('test-key', fakeFetch(async () => Response.json({ items: [item('alpha', false)] })))).toEqual([]);
  });
});
