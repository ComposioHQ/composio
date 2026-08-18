import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildProductCatalog,
  extractExternalLinks,
  extractToolSlugs,
  extractToolkitLinks,
  isComposioToolSlug,
  renderVerifyReport,
  verifyKb,
  type CatalogToolkit,
} from '@/lib/kb/verify';
import { getKbCatalog } from '@/lib/kb/repository';
import type { KbGuide, KbManifest } from '@/lib/kb/types';

const TOOLKITS: CatalogToolkit[] = [
  {
    slug: 'canvas',
    authSchemes: ['OAUTH2', 'BEARER_TOKEN'],
    tools: [{ slug: 'CANVAS_GET_SINGLE_ACCOUNT' }, { slug: 'CANVAS_LIST_MANAGEABLE_ACCOUNTS' }],
    triggers: [],
  },
  {
    slug: 'composio',
    authSchemes: [],
    tools: [{ slug: 'COMPOSIO_SEARCH_TOOLS' }],
    triggers: [],
  },
  {
    slug: 'gmail',
    authSchemes: ['OAUTH2'],
    tools: [{ slug: 'GMAIL_CREATE_FILTER' }],
    triggers: [{ slug: 'GMAIL_EMAIL_SENT_TRIGGER' }],
  },
];

const catalog = buildProductCatalog(TOOLKITS);

const MANIFEST: KbManifest = {
  schemaVersion: 2,
  source: {
    repository: 'ComposioHQ/example-knowledge',
    commit: 'abc1234',
    capturedAt: '2026-07-22',
    contentHash: 'sha256:fixture',
  },
  topics: [],
  guides: [],
};

function guide(overrides: Partial<KbGuide> & { slug: string; body: string }): KbGuide {
  return {
    title: overrides.slug,
    description: '',
    sources: [],
    topics: [],
    tags: [],
    aliases: [],
    relatedGuides: [],
    externalResources: [],
    updatedAt: '2026-07-22',
    lastVerifiedAt: '2026-07-22',
    reviewAfter: '2027-01-01',
    freshness: 'evergreen',
    state: 'published',
    featured: false,
    sourceMetadata: [],
    ...overrides,
  } as unknown as KbGuide;
}

describe('tool slug detection', () => {
  test('recognizes tokens prefixed by a known toolkit slug', () => {
    expect(isComposioToolSlug('CANVAS_GET_SINGLE_ACCOUNT', catalog)).toBe(true);
    expect(isComposioToolSlug('GMAIL_CREATE_FILTER', catalog)).toBe(true);
  });

  test('ignores provider error codes that merely share the shape', () => {
    expect(isComposioToolSlug('NONEXISTENT_VERSION', catalog)).toBe(false);
    expect(isComposioToolSlug('RESOURCE_EXHAUSTED', catalog)).toBe(false);
  });

  test('skips substitution placeholders in code samples', () => {
    const text = "curl --header 'x-api-key: <COMPOSIO_API_KEY>' and $COMPOSIO_BASE_URL";
    expect(extractToolSlugs(text, catalog)).toEqual([]);
  });

  test('still checks a token that also appears outside a placeholder', () => {
    const text = 'Call COMPOSIO_SEARCH_TOOLS first. Example: <COMPOSIO_SEARCH_TOOLS>';
    expect(extractToolSlugs(text, catalog)).toEqual(['COMPOSIO_SEARCH_TOOLS']);
  });

  test('detects trigger slugs alongside tool slugs', () => {
    expect(catalog.toolSlugs.has('GMAIL_EMAIL_SENT_TRIGGER')).toBe(true);
  });
});

describe('link extraction', () => {
  test('collects markdown link targets only', () => {
    const text =
      'See the [pagination guide](https://example.com/docs/pagination). ' +
      'Calls must use `https://api.example.com/v3`, not `https://example.com/v3`.';
    expect(extractExternalLinks(text)).toEqual(['https://example.com/docs/pagination']);
  });

  test('collects toolkit links', () => {
    expect(extractToolkitLinks('the [Canvas toolkit](/toolkits/canvas) page')).toEqual(['canvas']);
  });
});

describe('verifyKb', () => {
  const now = new Date('2026-07-24T00:00:00Z');

  test('reports a cited tool slug that is absent from the catalog', () => {
    const report = verifyKb({
      manifest: MANIFEST,
      catalog,
      now,
      guides: [guide({ slug: 'canvas-accounts', body: 'Use `CANVAS_GET_ACCOUNTS` for this.' })],
    });
    const finding = report.findings.find((entry) => entry.kind === 'unknown-tool-slug');
    expect(finding?.severity).toBe('error');
    expect(finding?.detail).toContain('CANVAS_GET_ACCOUNTS');
  });

  test('accepts a cited slug that exists', () => {
    const report = verifyKb({
      manifest: MANIFEST,
      catalog,
      now,
      guides: [guide({ slug: 'ok', body: 'Use `CANVAS_GET_SINGLE_ACCOUNT`.' })],
    });
    expect(report.findings.filter((entry) => entry.kind === 'unknown-tool-slug')).toEqual([]);
    expect(report.checkedToolSlugs).toBe(1);
  });

  test('reports a link to a toolkit that left the catalog', () => {
    const report = verifyKb({
      manifest: MANIFEST,
      catalog,
      now,
      guides: [guide({ slug: 'gone', body: 'see [X](/toolkits/retired_toolkit)' })],
    });
    expect(report.findings.some((entry) => entry.kind === 'unknown-toolkit-link')).toBe(true);
  });

  test('ignores unpublished guides', () => {
    const report = verifyKb({
      manifest: MANIFEST,
      catalog,
      now,
      guides: [
        guide({ slug: 'held', body: 'Use `CANVAS_GET_ACCOUNTS`.', state: 'needs-review' } as never),
      ],
    });
    expect(report.findings).toEqual([]);
    expect(report.checkedGuides).toBe(0);
  });

  test('honors a manifest-declared exemption for deliberately dead slugs', () => {
    const report = verifyKb({
      manifest: MANIFEST,
      catalog,
      now,
      guides: [
        guide({
          slug: 'deprecated-note',
          body: '`CANVAS_GET_ACCOUNTS` was removed.',
          verifyIgnoreToolSlugs: ['CANVAS_GET_ACCOUNTS'],
        } as never),
      ],
    });
    expect(report.findings).toEqual([]);
  });

  test('flags explicit internal handoff instructions', () => {
    const report = verifyKb({
      manifest: MANIFEST,
      catalog,
      now,
      guides: [
        guide({
          slug: 'internal-handoff',
          body: 'Collect the request details, then route the case to a human for review.',
        }),
      ],
    });
    const finding = report.findings.find((entry) => entry.kind === 'unedited-support-prose');
    expect(finding?.evidence).toContain('route the case to a human');
  });

  test('reports an expired review window instead of throwing', () => {
    const report = verifyKb({
      manifest: MANIFEST,
      catalog,
      now,
      guides: [guide({ slug: 'expired', body: 'text', reviewAfter: '2026-01-01' })],
    });
    const finding = report.findings.find((entry) => entry.kind === 'review-window-expired');
    expect(finding?.severity).toBe('error');
  });

  test('flags a cohort of guides that all expire on one date', () => {
    const guides = Array.from({ length: 6 }, (_, index) =>
      guide({ slug: `guide-${index}`, body: 'text', reviewAfter: '2026-10-20' })
    );
    const report = verifyKb({ manifest: MANIFEST, catalog, now, guides });
    const finding = report.findings.find((entry) => entry.kind === 'review-window-cliff');
    expect(finding?.detail).toContain('6 published guides');
  });

  test('warns when verification has aged past the threshold', () => {
    const report = verifyKb({
      manifest: MANIFEST,
      catalog,
      now,
      guides: [guide({ slug: 'stale', body: 'text', lastVerifiedAt: '2026-01-01' })],
      options: { staleVerificationDays: 30 },
    });
    expect(report.findings.some((entry) => entry.kind === 'verification-stale')).toBe(true);
  });

  test('reports an unresolvable source pin', () => {
    const report = verifyKb({
      manifest: MANIFEST,
      catalog,
      now,
      guides: [guide({ slug: 'any', body: 'text' })],
      options: { sourcePinStatus: 'missing' },
    });
    const finding = report.findings.find((entry) => entry.kind === 'source-pin-unresolvable');
    expect(finding?.severity).toBe('warning');
    expect(finding?.detail).toContain('abc1234');
  });

  test('stays silent when the pin cannot be verified by this token', () => {
    for (const status of ['resolved', 'unverifiable'] as const) {
      const report = verifyKb({
        manifest: MANIFEST,
        catalog,
        now,
        guides: [guide({ slug: 'any', body: 'text' })],
        options: { sourcePinStatus: status },
      });
      expect(report.findings.some((entry) => entry.kind === 'source-pin-unresolvable')).toBe(false);
    }
  });

  test('treats provider rate-limiting as inconclusive, not as rot', () => {
    const body = 'see [docs](https://example.com/a) and [more](https://example.com/b)';
    const report = verifyKb({
      manifest: MANIFEST,
      catalog,
      now,
      guides: [guide({ slug: 'links', body })],
      options: {
        linkStatuses: new Map<string, number | 'unreachable'>([
          ['https://example.com/a', 503],
          ['https://example.com/b', 404],
        ]),
      },
    });
    const linkFindings = report.findings.filter((entry) => entry.kind === 'unreachable-link');
    expect(linkFindings).toHaveLength(1);
    expect(linkFindings[0]?.detail).toContain('https://example.com/b');
  });
});

describe('report rendering', () => {
  test('states success plainly when nothing is wrong', () => {
    const rendered = renderVerifyReport({
      checkedGuides: 3,
      checkedToolSlugs: 5,
      checkedToolkitLinks: 2,
      externalLinks: [],
      findings: [],
    });
    expect(rendered).toContain('All mechanical claims verified');
  });
});

describe('live corpus', () => {
  /**
   * The first publish tranche predated article bodies and was edited in place
   * inside `kb/source`, which silently made the snapshot a derivative of the
   * commit it claims to come from. Nine of twenty-five sources had drifted.
   * Published prose belongs in `kb/articles`; `kb/source` must stay verbatim.
   */
  test('no published guide renders from the source snapshot', () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), 'kb/manifest.json'), 'utf8')
    ) as { guides: Array<{ slug: string; state: string; articlePath?: string }> };
    const rendersFromSource = manifest.guides
      .filter((guide) => guide.state === 'published' && !guide.articlePath)
      .map((guide) => guide.slug);
    expect(rendersFromSource).toEqual([]);
  });

  test('contains no internal support prose or unexplained dead tool slugs', () => {
    const toolkitData = JSON.parse(
      readFileSync(join(process.cwd(), 'public/data/toolkits.json'), 'utf8')
    ) as CatalogToolkit[];
    const kbCatalog = getKbCatalog();
    const report = verifyKb({
      manifest: kbCatalog.manifest,
      guides: kbCatalog.guides,
      catalog: buildProductCatalog(toolkitData),
      now: new Date('2026-08-17T00:00:00Z'),
    });
    const publicationFindings = report.findings.filter(
      (finding) =>
        finding.kind === 'unedited-support-prose' || finding.kind === 'unknown-tool-slug'
    );
    expect(publicationFindings).toEqual([]);
  });
});
