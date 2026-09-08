/**
 * Freshness verification for the public KB.
 *
 * The KB rots in ways a review calendar cannot see: a cited tool slug is renamed
 * out of the catalog, a toolkit drops an auth scheme, a provider link 404s. Most
 * of those claims are checkable against artifacts this repo already refreshes
 * every five hours (`public/data/toolkits.json`, `public/openapi*.json`).
 *
 * This module turns published guides into a list of mechanical assertions and
 * checks them. Prose that cannot be checked this way is exactly the prose that
 * still needs a human — which is the point: shrink the human queue to the part
 * that actually needs judgement.
 */

import type { KbGuide, KbManifest } from './types';

export type KbVerifySeverity = 'error' | 'warning';

export type KbVerifyKind =
  | 'unknown-tool-slug'
  | 'unknown-toolkit-link'
  | 'unknown-toolkit-auth-scheme'
  | 'review-window-expired'
  | 'review-window-cliff'
  | 'verification-stale'
  | 'unreachable-link'
  | 'source-pin-unresolvable'
  | 'unedited-support-prose';

/**
 * The canonical corpus is written for support agents answering a ticket, not for
 * a reader who found the page through search. Publishing requires rewriting into
 * direct reader guidance — the first of the required editorial transformations in
 * the 2026-07-22 corpus audit.
 *
 * That rewrite is easy to skip during a bulk import, and the result reads as
 * internal notes leaking onto a public site. These patterns catch the mechanical
 * tells so the omission surfaces at verification rather than in front of a user.
 */
const SUPPORT_PROSE_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  {
    label: 'addresses a support agent about "the customer" rather than the reader',
    pattern:
      /\b(advise|ask|tell|remind) the customer\b|\bthe customer (should|needs|must|can)\b|\bif a customer\b|\bdo not tell customers\b|customer-safe wording/i,
  },
  {
    label: 'contains internal triage or escalation instructions',
    pattern:
      /\broute the case to (a )?human\b|\broute to (a )?human\b|\broute to support\b|\broute (it|this) as\b|\bescalate\b|\bshould be escalated\b|\bfile (a|the|it on the) (tool|feature|toolkit) request( board)?\b|\bcollect the (following|use case|exact)\b|\bask (them|for the exact)\b/i,
  },
  {
    label: 'states defect or incident status',
    pattern:
      /\bincident\b|\bregression\b|\bknown (bug|issue)\b|\bcurrently (broken|failing)\b|\bawaiting a fix\b|\btemporarily (unavailable|disabled)\b|\bsuspended\b/i,
  },
];

/**
 * Whether `manifest.source.commit` can be resolved on the upstream remote.
 *
 * `unverifiable` is deliberately distinct from `missing`: a token without read
 * access to the upstream repository cannot tell the two apart, and reporting
 * "provenance is broken" every run in that case would be crying wolf.
 */
export type SourcePinStatus = 'resolved' | 'missing' | 'unverifiable';

export interface KbVerifyFinding {
  severity: KbVerifySeverity;
  kind: KbVerifyKind;
  /** Guide slug, or `''` for manifest-wide findings. */
  guideSlug: string;
  detail: string;
  evidence: string;
}

export interface ProductCatalog {
  toolkitSlugs: Set<string>;
  /** Tool and trigger slugs, uppercased, across every toolkit. */
  toolSlugs: Set<string>;
  authSchemesByToolkit: Map<string, Set<string>>;
}

export interface CatalogToolkit {
  slug: string;
  authSchemes?: string[] | null;
  composioManagedAuthSchemes?: string[] | null;
  tools?: Array<{ slug?: string } | string> | null;
  triggers?: Array<{ slug?: string } | string> | null;
}

export interface KbVerifyOptions {
  /** Warn when a published guide has not been verified in this many days. */
  staleVerificationDays: number;
  /** Warn when this many or more published guides share one `reviewAfter` date. */
  reviewCliffThreshold: number;
  /** Resolved external link statuses, keyed by URL. Absent when `--check-links` is off. */
  linkStatuses?: Map<string, number | 'unreachable'>;
  /** Upstream resolution of `manifest.source.commit`. Absent when the check is off. */
  sourcePinStatus?: SourcePinStatus;
}

export const DEFAULT_VERIFY_OPTIONS: KbVerifyOptions = {
  staleVerificationDays: 120,
  reviewCliffThreshold: 5,
};

/**
 * Tokens shaped like `TOOLKIT_SOME_ACTION`. Provider error codes (`NONEXISTENT_VERSION`)
 * share this shape, so `isComposioToolSlug` filters by known toolkit prefix.
 */
const TOOL_SLUG_PATTERN = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;
const TOOLKIT_LINK_PATTERN = /\]\(\/toolkits\/([a-z0-9_-]+)\)/g;
/**
 * Only markdown link targets are checked. Bare URLs in prose or code samples are
 * almost always API hosts and endpoints (`https://api.ahrefs.com/v3`,
 * `https://backend.composio.dev/api/v3.1/toolkits/`) where 401/404 is the correct
 * response and would produce a permanently red report.
 */
const EXTERNAL_LINK_PATTERN = /\]\((https?:\/\/[^\s)]+)\)/g;

/**
 * Substitution placeholders in code samples — `<COMPOSIO_API_KEY>`, `$TOKEN`,
 * `${TOKEN}`, `%TOKEN%`. These share the shape of a tool slug and would otherwise
 * be reported as dead tools forever, since no catalog will ever contain them.
 */
const PLACEHOLDER_PATTERNS = [
  /<([A-Z][A-Z0-9_]+)>/g,
  /\$\{([A-Z][A-Z0-9_]+)\}/g,
  /\$([A-Z][A-Z0-9_]+)\b/g,
  /%([A-Z][A-Z0-9_]+)%/g,
];

function countOccurrences(text: string, token: string): number {
  return text.split(token).length - 1;
}

/**
 * A token is a placeholder rather than a citation only when *every* appearance is
 * wrapped. A doc that names `COMPOSIO_SEARCH_TOOLS` in prose and again inside a
 * `<...>` sample is still making a checkable claim.
 */
function placeholderOnlyTokens(text: string): Set<string> {
  const wrappedCounts = new Map<string, number>();
  for (const pattern of PLACEHOLDER_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const token = match[1];
      if (!token) continue;
      wrappedCounts.set(token, (wrappedCounts.get(token) ?? 0) + 1);
    }
  }

  const placeholders = new Set<string>();
  for (const [token, wrapped] of wrappedCounts) {
    if (countOccurrences(text, token) <= wrapped) placeholders.add(token);
  }
  return placeholders;
}

function slugsFrom(entries: Array<{ slug?: string } | string> | null | undefined): string[] {
  if (!entries) return [];
  return entries
    .map((entry) => (typeof entry === 'string' ? entry : entry.slug))
    .filter((slug): slug is string => Boolean(slug))
    .map((slug) => slug.toUpperCase());
}

export function buildProductCatalog(toolkits: CatalogToolkit[]): ProductCatalog {
  const toolkitSlugs = new Set<string>();
  const toolSlugs = new Set<string>();
  const authSchemesByToolkit = new Map<string, Set<string>>();

  for (const toolkit of toolkits) {
    if (!toolkit.slug) continue;
    toolkitSlugs.add(toolkit.slug.toLowerCase());
    for (const slug of [...slugsFrom(toolkit.tools), ...slugsFrom(toolkit.triggers)]) {
      toolSlugs.add(slug);
    }
    authSchemesByToolkit.set(
      toolkit.slug.toLowerCase(),
      new Set((toolkit.authSchemes ?? []).map((scheme) => scheme.toUpperCase()))
    );
  }

  return { toolkitSlugs, toolSlugs, authSchemesByToolkit };
}

/**
 * A token counts as a Composio tool slug only when some known toolkit slug is its
 * prefix. Without this, provider error codes and constants quoted in prose would
 * be reported as dead tools on every run and the report would be ignored.
 */
export function isComposioToolSlug(token: string, catalog: ProductCatalog): boolean {
  for (const toolkitSlug of catalog.toolkitSlugs) {
    if (token.startsWith(`${toolkitSlug.toUpperCase()}_`)) return true;
  }
  return false;
}

export function extractToolSlugs(text: string, catalog: ProductCatalog): string[] {
  const matches = text.match(TOOL_SLUG_PATTERN) ?? [];
  const placeholders = placeholderOnlyTokens(text);
  return Array.from(
    new Set(
      matches.filter((token) => !placeholders.has(token) && isComposioToolSlug(token, catalog))
    )
  );
}

export function extractToolkitLinks(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(TOOLKIT_LINK_PATTERN)) {
    if (match[1]) found.add(match[1].toLowerCase());
  }
  return Array.from(found);
}

export function extractExternalLinks(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(EXTERNAL_LINK_PATTERN)) {
    const url = match[1];
    if (url) found.add(url);
  }
  return Array.from(found);
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.valueOf() - from.valueOf()) / 86_400_000);
}

/**
 * Slugs a guide is allowed to cite even though they are absent from the catalog —
 * for guides whose whole point is "this identifier no longer exists". Declared in
 * the manifest so the exemption is reviewable rather than silent.
 */
function allowedMissingSlugs(guide: KbGuide): Set<string> {
  return new Set((guide.verifyIgnoreToolSlugs ?? []).map((slug) => slug.toUpperCase()));
}

export interface KbVerifyInput {
  manifest: KbManifest;
  guides: KbGuide[];
  catalog: ProductCatalog;
  now: Date;
  options?: Partial<KbVerifyOptions>;
}

export interface KbVerifyReport {
  checkedGuides: number;
  checkedToolSlugs: number;
  checkedToolkitLinks: number;
  externalLinks: string[];
  findings: KbVerifyFinding[];
}

export function verifyKb(input: KbVerifyInput): KbVerifyReport {
  const options = { ...DEFAULT_VERIFY_OPTIONS, ...input.options };
  const published = input.guides.filter((guide) => guide.state === 'published');
  const findings: KbVerifyFinding[] = [];
  const externalLinks = new Set<string>();
  let checkedToolSlugs = 0;
  let checkedToolkitLinks = 0;

  for (const guide of published) {
    const text = guide.body;
    const exempt = allowedMissingSlugs(guide);

    for (const slug of extractToolSlugs(text, input.catalog)) {
      if (exempt.has(slug)) continue;
      checkedToolSlugs += 1;
      if (!input.catalog.toolSlugs.has(slug)) {
        findings.push({
          severity: 'error',
          kind: 'unknown-tool-slug',
          guideSlug: guide.slug,
          detail: `${slug} is cited but absent from the production toolkit catalog`,
          evidence: 'public/data/toolkits.json',
        });
      }
    }

    for (const { label, pattern } of SUPPORT_PROSE_PATTERNS) {
      const match = text.match(pattern);
      if (!match) continue;
      findings.push({
        severity: 'warning',
        kind: 'unedited-support-prose',
        guideSlug: guide.slug,
        detail: `${label}; rewrite for a reader who arrived from search`,
        evidence: `matched: ${match[0]}`,
      });
    }

    for (const toolkitSlug of extractToolkitLinks(text)) {
      checkedToolkitLinks += 1;
      if (!input.catalog.toolkitSlugs.has(toolkitSlug)) {
        findings.push({
          severity: 'error',
          kind: 'unknown-toolkit-link',
          guideSlug: guide.slug,
          detail: `links to /toolkits/${toolkitSlug}, which is not in the production catalog`,
          evidence: 'public/data/toolkits.json',
        });
      }
    }

    for (const url of extractExternalLinks(text)) {
      externalLinks.add(url);
      const status = options.linkStatuses?.get(url);
      if (status === undefined) continue;
      // 5xx and 429 mean the provider is rate-limiting or bot-blocking the probe,
      // not that the page is gone. Reporting those would make the check flaky, and
      // a flaky freshness report is one nobody reads.
      if (typeof status === 'number' && (status >= 500 || status === 429)) continue;
      if (status === 'unreachable' || status >= 400) {
        findings.push({
          severity: status === 404 || status === 410 ? 'error' : 'warning',
          kind: 'unreachable-link',
          guideSlug: guide.slug,
          detail: `${url} returned ${status}`,
          evidence: url,
        });
      }
    }

    const reviewAfter = guide.reviewAfter ? new Date(guide.reviewAfter) : null;
    if (reviewAfter && !Number.isNaN(reviewAfter.valueOf())) {
      const remaining = daysBetween(input.now, reviewAfter);
      if (remaining <= 0) {
        findings.push({
          severity: 'error',
          kind: 'review-window-expired',
          guideSlug: guide.slug,
          detail: `review window expired ${Math.abs(remaining)} day(s) ago`,
          evidence: `reviewAfter=${guide.reviewAfter}`,
        });
      }
    }

    const lastVerified = guide.lastVerifiedAt ? new Date(guide.lastVerifiedAt) : null;
    if (lastVerified && !Number.isNaN(lastVerified.valueOf())) {
      const age = daysBetween(lastVerified, input.now);
      if (age > options.staleVerificationDays) {
        findings.push({
          severity: 'warning',
          kind: 'verification-stale',
          guideSlug: guide.slug,
          detail: `last verified ${age} days ago (threshold ${options.staleVerificationDays})`,
          evidence: `lastVerifiedAt=${guide.lastVerifiedAt}`,
        });
      }
    }
  }

  // The manifest sources are vendored under kb/source, so an unresolvable pin does
  // not break the build — it breaks the audit trail, and it blocks source-drift
  // detection, which has to diff the vendored copy against the upstream commit.
  if (options.sourcePinStatus === 'missing') {
    const { repository, commit } = input.manifest.source;
    findings.push({
      severity: 'warning',
      kind: 'source-pin-unresolvable',
      guideSlug: '',
      detail:
        `${repository}@${commit} does not resolve upstream, so the provenance of ` +
        'every published guide is unverifiable. Push the commit or repin the manifest.',
      evidence: `manifest.source.commit=${commit}`,
    });
  }

  // A cohort of guides sharing one reviewAfter date all expire together. When that
  // day arrives the cheap move is bulk-bumping the dates rather than re-verifying,
  // which quietly converts the review gate into a rubber stamp.
  const byReviewDate = new Map<string, string[]>();
  for (const guide of published) {
    if (!guide.reviewAfter) continue;
    const bucket = byReviewDate.get(guide.reviewAfter) ?? [];
    bucket.push(guide.slug);
    byReviewDate.set(guide.reviewAfter, bucket);
  }
  for (const [date, slugs] of byReviewDate) {
    if (slugs.length >= options.reviewCliffThreshold) {
      findings.push({
        severity: 'warning',
        kind: 'review-window-cliff',
        guideSlug: '',
        detail: `${slugs.length} published guides all expire on ${date}; stagger these dates`,
        evidence: slugs.slice(0, 8).join(', ') + (slugs.length > 8 ? ', …' : ''),
      });
    }
  }

  return {
    checkedGuides: published.length,
    checkedToolSlugs,
    checkedToolkitLinks,
    externalLinks: Array.from(externalLinks).sort(),
    findings,
  };
}

export function renderVerifyReport(report: KbVerifyReport): string {
  const errors = report.findings.filter((finding) => finding.severity === 'error');
  const warnings = report.findings.filter((finding) => finding.severity === 'warning');
  const lines: string[] = [];

  lines.push('# KB freshness verification');
  lines.push('');
  lines.push(
    `Checked ${report.checkedGuides} published guides — ` +
      `${report.checkedToolSlugs} tool-slug claims, ${report.checkedToolkitLinks} toolkit links, ` +
      `${report.externalLinks.length} external links.`
  );
  lines.push('');

  if (!report.findings.length) {
    lines.push('All mechanical claims verified against the current production catalog.');
    return lines.join('\n');
  }

  for (const [label, group] of [
    ['Errors', errors],
    ['Warnings', warnings],
  ] as const) {
    if (!group.length) continue;
    lines.push(`## ${label} (${group.length})`);
    lines.push('');
    for (const finding of group) {
      const subject = finding.guideSlug || '(manifest)';
      lines.push(`- \`${subject}\` [${finding.kind}] ${finding.detail}`);
      lines.push(`  - evidence: ${finding.evidence}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
