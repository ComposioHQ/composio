import { describe, expect, test } from 'bun:test';
import { instantDiscount, instantPricingDescription, instantSchema, toolkitSupportsInstant } from '../../lib/instant';
import { readFileSync } from 'node:fs';
import { toolFromApi } from '../../lib/toolkit-schema';
import { parseNamedItems, transformToolkit } from '../../scripts/generate-toolkits';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

describe('Instant catalog metadata', () => {
  test('toolkit headers show live tool eligibility when the snapshot lacks Instant metadata', () => {
    // Other suites mock next/navigation; render with real Next exports in a fresh process.
    const rendered = spawnSync(process.execPath, ['--eval', `
      import { createElement } from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { ToolkitDetail } from './components/toolkits/toolkit-detail';
      import { toolFromApi } from './lib/toolkit-schema';
      const toolkit = {
        slug: 'example', name: 'Example', logo: null, category: null,
        description: 'Example toolkit', authSchemes: [], toolCount: 1,
        triggerCount: 0, version: null, tools: [], triggers: [],
      };
      console.log(renderToStaticMarkup(createElement(ToolkitDetail, {
        toolkit,
        tools: [toolFromApi({ slug: 'EXAMPLE_SEARCH', instant: { supported: true } })],
        triggers: [], path: '/toolkits/example',
      })));
    `], { cwd: join(import.meta.dir, '../..'), encoding: 'utf8', timeout: 10000 });
    expect(rendered.status, rendered.stderr).toBe(0);
    const html = rendered.stdout;
    expect(html).toContain('is available on the latest version. Check each tool for support and pricing.');
    expect(html.match(/title="Instant is supported on the latest version"/g)).toHaveLength(2);
  });

  test('missing, false, and partial support never imply eligibility', () => {
    for (const instant of [undefined, null, {}, { supported: false }, { supported: 'true' }, { price: { description: 'A price' } }]) {
      const parsed = instantSchema.parse(instant);
      expect(parsed?.supported === true).toBe(false);
      expect(instantPricingDescription(parsed)).toBeUndefined();
    }
  });

  test('toolkit support requires explicit eligibility from the toolkit or at least one tool', () => {
    const tools = [
      { instant: { supported: false } },
      {},
      { instant: { price: { description: '$1 per call' } } },
    ];
    expect(toolkitSupportsInstant(undefined, tools)).toBe(false);
    expect(toolkitSupportsInstant({ supported: false }, tools)).toBe(false);
    expect(toolkitSupportsInstant(undefined, [...tools, { instant: { supported: true } }])).toBe(true);
    expect(toolkitSupportsInstant({ supported: true }, [])).toBe(true);
  });

  test('missing or malformed pricing is not free', () => {
    for (const price of [undefined, null, {}, { description: '' }, { description: 0 }]) {
      expect(instantPricingDescription(instantSchema.parse({ supported: true, price }))).toBe('Pricing is not available.');
    }
  });

  test('generator and API parsers preserve the same metadata, including string discounts', () => {
    const instant = { supported: true, price: { description: '$1 per request', discount: '0' } };
    const raw = { slug: 'EXAMPLE', instant };
    expect(transformToolkit(raw).instant).toEqual(instant);
    expect(parseNamedItems({ items: [raw] })[0].instant).toEqual(instant);
    expect(toolFromApi(raw).instant).toEqual(instant);
    expect(instantPricingDescription(instant)).toBe('$1 per request');
    expect(toolFromApi({ slug: 'OTHER' }).instant).toBeUndefined();
  });

  test('shows meaningful discount strings without interpreting units', () => {
    for (const discount of ['15', '$0.20', '20% off']) {
      expect(instantDiscount(instantSchema.parse({ supported: true, price: { discount } }))).toBe(discount);
    }
    for (const discount of [undefined, null, '', '  ', '0', ' 0 ', 15]) {
      expect(instantDiscount(instantSchema.parse({ supported: true, price: { discount } }))).toBeUndefined();
    }
    expect(instantDiscount(instantSchema.parse({ supported: false, price: { discount: '15' } }))).toBeUndefined();
    expect(instantDiscount(undefined)).toBeUndefined();
  });

  test('tool expansions request latest schemas while triggers retain their toolkit version', () => {
    const source = readFileSync(new URL('../../components/toolkits/toolkit-detail.tsx', import.meta.url), 'utf8');
    expect(source).toContain('item={tool} toolkitVersion="latest"');
    expect(source).toContain('item={trigger} toolkitVersion={toolkit.version}');
  });
});
