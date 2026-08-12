/**
 * API version identity in the markdown channels.
 *
 * Agents read `.md`, not the browser rendering path. Every signal that
 * separates v3.1 from v3.0 used to live in client components the markdown
 * converter dropped, so `reference.md` published an empty `Base URL` bullet
 * and the tag pages published an empty `Endpoints` section — while the
 * superseded v3.0 operation pages published a complete working curl example.
 *
 * These tests lock the three properties that fix costs the most to lose:
 *  1. `mdxToCleanMarkdown` renders `ApiBaseUrl` and `ApiEndpointsTable` at the
 *     version the page URL implies, and degrades (no table, no throw) on a
 *     malformed payload rather than 500ing the whole `.md` response.
 *  2. `getLLMText` emits a version pointer on `/reference/**` and nowhere else.
 *  3. The guidance text is single-sourced in `lib/api-version-guidance.ts` —
 *     asserted by containment of the exported constant, not by matching a
 *     copied literal, which is what proves the guardrail files compose rather
 *     than restate.
 */
import { describe, expect, test } from 'bun:test';

import {
  REST_VERSION_GUIDANCE,
  TOOL_VERSION_GUIDANCE,
  TOOL_VERSION_PATHS,
  apiVersionPointer,
  isToolVersionPath,
} from '../../lib/api-version-guidance';
import { detectReferenceApiVersion, toCurrentVersionUrl } from '../../lib/api-version';
import {
  getLLMText,
  getReferenceSource,
  mdxToCleanMarkdown,
  type LLMPage,
} from '../../lib/source';
import { DIRECT_EXECUTION_GUARDRAILS, SESSION_GUARDRAILS } from '../../lib/llm-guardrails';

const V31_BASE = 'https://backend.composio.dev/api/v3.1';
const V30_BASE = 'https://backend.composio.dev/api/v3';

/** A current-tree tag page and its legacy twin. */
const CURRENT_URL = '/reference/api-reference/tools';
const LEGACY_URL = '/reference/v3/api-reference/tools';

/** The authored MDX shape, which `lib/search-index.ts` reads from the file. */
function endpointsTable(endpoints: unknown[]): string {
  return `## Endpoints\n\n<ApiEndpointsTable endpoints={${JSON.stringify(endpoints)}} />\n`;
}

/**
 * The shape `getLLMText` actually receives: fumadocs' processed markdown
 * re-serializes the JSX expression attribute as a quoted string with the inner
 * quotes entity-escaped. Matching only the authored shape above still passes a
 * unit test while leaving every live tag page's Endpoints section empty, which
 * is exactly the defect this work exists to fix — so the production shape gets
 * its own fixture.
 */
function processedEndpointsTable(endpoints: unknown[]): string {
  const escaped = JSON.stringify(endpoints).replace(/"/g, '&#x22;');
  return `## Endpoints\n\n<ApiEndpointsTable endpoints="${escaped}" />\n`;
}

const TOOLS_ENDPOINT = {
  method: 'GET',
  pathV31: '/api/v3.1/tools',
  pathV3: '/api/v3/tools',
  summary: 'List tools',
  href: '/reference/api-reference/tools/getTools',
};

function llmPage(url: string, content: string, data: Partial<LLMPage['data']> = {}): LLMPage {
  return {
    url,
    data: { title: 'Tools', getText: async () => content, ...data },
  };
}

describe('mdxToCleanMarkdown — ApiBaseUrl', () => {
  test('renders the v3.1 base URL on a current-tree URL', () => {
    expect(mdxToCleanMarkdown('**Base URL**: <ApiBaseUrl />', CURRENT_URL)).toContain(V31_BASE);
  });

  test('renders the v3 base URL on a legacy-tree URL', () => {
    const markdown = mdxToCleanMarkdown('**Base URL**: <ApiBaseUrl />', LEGACY_URL);
    expect(markdown).toContain(`\`${V30_BASE}\``);
    expect(markdown).not.toContain(V31_BASE);
  });

  test('renders the v3.1 base URL with no url argument — the changelog call site', () => {
    expect(mdxToCleanMarkdown('**Base URL**: <ApiBaseUrl />')).toContain(V31_BASE);
  });
});

describe('mdxToCleanMarkdown — ApiEndpointsTable', () => {
  test('emits one row per endpoint using pathV31 on a current-tree URL', () => {
    const markdown = mdxToCleanMarkdown(
      endpointsTable([
        TOOLS_ENDPOINT,
        {
          method: 'POST',
          pathV31: '/api/v3.1/tools/execute/{tool_slug}',
          pathV3: '/api/v3/tools/execute/{tool_slug}',
          summary: 'Execute a tool',
          href: '/reference/api-reference/tools/executeTool',
        },
      ]),
      CURRENT_URL
    );

    expect(markdown).toContain('/api/v3.1/tools');
    expect(markdown).toContain('/api/v3.1/tools/execute/{tool_slug}');
    expect(markdown).not.toContain('/api/v3/tools');
    // href kept as a relative link, summary preserved
    expect(markdown).toContain('[List tools](/reference/api-reference/tools/getTools)');
    expect(markdown).toContain('[Execute a tool](/reference/api-reference/tools/executeTool)');
  });

  test('renders the processed-markdown shape getLLMText actually receives', () => {
    const markdown = mdxToCleanMarkdown(
      processedEndpointsTable([
        TOOLS_ENDPOINT,
        {
          method: 'GET',
          pathV31: '/api/v3.1/tools/{tool_slug}',
          pathV3: '/api/v3/tools/{tool_slug}',
          summary: 'Get tool by slug',
          href: '/reference/api-reference/tools/getToolsByToolSlug',
        },
      ]),
      CURRENT_URL
    );

    expect(markdown).toContain('[List tools](/reference/api-reference/tools/getTools)');
    expect(markdown).toContain('`/api/v3.1/tools/{tool_slug}`');
    // The escaping must actually be reversed, not carried through.
    expect(markdown).not.toContain('&#x22;');
  });

  test('uses pathV3 on a legacy-tree URL', () => {
    const markdown = mdxToCleanMarkdown(endpointsTable([TOOLS_ENDPOINT]), LEGACY_URL);
    expect(markdown).toContain('`/api/v3/tools`');
    expect(markdown).not.toContain('/api/v3.1/tools');
  });

  test('renders a visible legacy marker for a deprecated endpoint', () => {
    const markdown = mdxToCleanMarkdown(
      endpointsTable([{ ...TOOLS_ENDPOINT, legacy: true }]),
      CURRENT_URL
    );
    expect(markdown).toContain('Legacy');
  });

  test('preserves backslashes and pipes in endpoint summaries', () => {
    const markdown = mdxToCleanMarkdown(
      endpointsTable([{ ...TOOLS_ENDPOINT, summary: String.raw`Path \| pipe` }]),
      CURRENT_URL
    );

    expect(markdown).toContain(String.raw`[Path \\\| pipe]`);
  });

  test('emits no table and does not throw on a truncated payload', () => {
    const content = 'Surrounding prose.\n\n<ApiEndpointsTable endpoints={[{"method":"GET"} />\n';
    const markdown = mdxToCleanMarkdown(content, CURRENT_URL);
    // The rest of the page survives — one bad table must not take the whole
    // .md response down.
    expect(markdown).toContain('Surrounding prose.');
    expect(markdown).not.toContain('| Method |');
  });

  test('emits no table on a structurally invalid payload a bare JSON.parse would accept', () => {
    // Valid JSON, pathV31 missing.
    const markdown = mdxToCleanMarkdown(
      `Surrounding prose.\n\n${endpointsTable([
        { method: 'GET', pathV3: '/api/v3/tools', summary: 'List tools', href: '/x' },
      ])}`,
      CURRENT_URL
    );
    expect(markdown).toContain('Surrounding prose.');
    expect(markdown).not.toContain('| Method |');
    expect(markdown).not.toContain('List tools');
  });
});

describe('getLLMText — version pointer', () => {
  test('a current /reference/** page carries the v3.1 pointer and base URL', async () => {
    const text = await getLLMText(llmPage(CURRENT_URL, '# Tools'), { includeGuardrails: false });
    expect(text).toContain('**API version:**');
    expect(text).toContain(V31_BASE);
  });

  test('a legacy /reference/v3/** page carries the v3.0 pointer and links its v3.1 page', async () => {
    const text = await getLLMText(llmPage(LEGACY_URL, '# Tools'), { includeGuardrails: false });
    expect(text).toContain('**API version:**');
    expect(text).toContain('v3.0');
    expect(text).toContain(V31_BASE);
    expect(text).toContain('/reference/api-reference/tools.md');
    expect(text).not.toContain('https://docs.composio.dev/reference/api-reference/tools.md');
  });

  test('a /docs/** page gets no API version pointer — the pointer is reference-scoped', async () => {
    const text = await getLLMText(llmPage('/docs/quickstart', '# Quickstart'));
    expect(text).not.toContain('**API version:**');
  });

  test('an SDK reference page gets no REST version pointer', async () => {
    const text = await getLLMText(
      llmPage('/reference/sdk-reference/typescript/tools', '# Tools')
    );
    expect(text).not.toContain('**API version:**');
  });

  test('the glossary gets no REST version pointer', async () => {
    const text = await getLLMText(llmPage('/reference/glossary', '# Glossary'));
    expect(text).not.toContain('**API version:**');
  });

  test('the legacy authentication page links to its renamed current counterpart', async () => {
    const text = await getLLMText(
      llmPage('/reference/v3/authentication', '# Authentication'),
      { includeGuardrails: false }
    );
    expect(text).toContain('/reference/authenticating-to-composio.md');
  });

  test('every published legacy page links to an existing current-version page', async () => {
    const reference = await getReferenceSource();
    const routes = new Set(reference.getPages().map(page => page.url));
    const legacyRoutes = [...routes].filter(
      url => detectReferenceApiVersion(url) === '3.0'
    );
    const invalidPointers = legacyRoutes.flatMap(source => {
      const target = toCurrentVersionUrl(source);
      const pointer = apiVersionPointer(source);
      return routes.has(target) &&
        detectReferenceApiVersion(target) === '3.1' &&
        pointer.includes(`${target}.md`)
        ? []
        : [`${source} -> ${target}`];
    });

    expect(legacyRoutes.some(url => /^\/reference\/v3\/[^/]+$/.test(url))).toBe(true);
    expect(
      legacyRoutes.some(url => /^\/reference\/v3\/api-reference\/[^/]+$/.test(url))
    ).toBe(true);
    expect(
      legacyRoutes.some(url => /^\/reference\/v3\/api-reference\/[^/]+\/[^/]+$/.test(url))
    ).toBe(true);
    expect(
      invalidPointers,
      `invalid current-version pointers:\n${invalidPointers.join('\n')}`
    ).toEqual([]);
  });

  test('a legacy: true page keeps its legacy note and still emits no guardrails', async () => {
    const text = await getLLMText(
      llmPage('/docs/tools-direct/executing-tools', '# Executing tools', { legacy: true })
    );
    expect(text).toContain('**Legacy');
    // legacy: true gates the whole guardrail block at source.ts, before the
    // llmGuardrails selector ever runs. Deliberate: appending "enforce the
    // CURRENT patterns" to a point-in-time migration guide contradicts it.
    expect(text).not.toContain('Instructions for AI Code Generators');
  });
});

describe('detectReferenceApiVersion', () => {
  test.each([
    ['/reference/api-reference/tools', '3.1'],
    ['/reference/v3/api-reference/tools', '3.0'],
    ['/reference/glossary', null],
    ['/reference/sdk-reference', null],
    ['/reference/sdk-reference/typescript/tools', null],
  ] as const)('%s is classified as %s', (url, expected) => {
    expect(detectReferenceApiVersion(url)).toBe(expected);
  });
});

describe('guardrail sets compose the guidance rather than restating it', () => {
  // Containment of the exported constant, not a substring of prose. A test
  // matching a copied literal would pass just as happily against two strings
  // that currently agree and are free to drift.
  test.each([
    ['SESSION_GUARDRAILS', SESSION_GUARDRAILS],
    ['DIRECT_EXECUTION_GUARDRAILS', DIRECT_EXECUTION_GUARDRAILS],
  ])('%s contains both guidance constants verbatim', (_name, guardrails) => {
    expect(guardrails).toContain(REST_VERSION_GUIDANCE);
    expect(guardrails).toContain(TOOL_VERSION_GUIDANCE);
  });
});

describe('API version guidance constants', () => {
  test('the REST baseline names v3.1 without claiming route parity', () => {
    expect(REST_VERSION_GUIDANCE).toContain('https://backend.composio.dev/api/v3.1');
    expect(TOOL_VERSION_GUIDANCE).toContain(
      'This version-default change is limited to the five endpoints above.'
    );
    expect(TOOL_VERSION_GUIDANCE).not.toMatch(/every non-tool endpoint.*unchanged/i);
  });

  test('exactly five tool paths need explicit version-default guidance', () => {
    expect(TOOL_VERSION_PATHS).toHaveLength(5);
  });
});

describe('isToolVersionPath normalization contract', () => {
  // Every key below appears verbatim in a committed spec. The predicate takes
  // the raw spec path key; no caller pre-strips anything.
  const cases: Array<[path: string, expected: boolean, why: string]> = [
    ['/api/v3.1/tools', true, ''],
    ['/api/v3.1/tools/{tool_slug}', true, 'fails if /api/v3 is stripped before /api/v3.1'],
    ['/api/v3.1/tools/execute/{tool_slug}', true, ''],
    ['/api/v3.1/tools/execute/{tool_slug}/input', true, ''],
    ['/api/v3.1/tools/scopes/required', true, 'v3.1-only; has no v3 counterpart'],
    ['/api/v3/tools', true, ''],
    ['/api/v3/tools/{tool_slug}', true, ''],
    ['/api/v3/tools/execute/{tool_slug}', true, ''],
    ['/api/v3/tools/execute/{tool_slug}/input', true, ''],
    ['/api/v3.1/tools/enum', false, 'under /tools, not affected — breaks a prefix match'],
    ['/api/v3.1/tools/execute/proxy', false, 'under /tools/execute, not affected'],
    [
      '/api/v3.1/tool_router/session/{session_id}/tools',
      false,
      'ends in /tools — breaks a substring match',
    ],
    ['/api/v3.1/auth_configs', false, 'plain non-tool'],
    ['/api/v3.1/triggers_types', false, 'triggers already default to latest'],
    ['/tools/{tool_slug}', false, 'no version prefix; the predicate normalizes, it does not guess'],
  ];

  for (const [path, expected, why] of cases) {
    test(`${path} -> ${expected}${why ? ` (${why})` : ''}`, () => {
      expect(isToolVersionPath(path)).toBe(expected);
    });
  }
});
