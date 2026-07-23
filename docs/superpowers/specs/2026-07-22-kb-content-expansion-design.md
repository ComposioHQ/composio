# Knowledge Base Content Expansion Design

## Objective

Turn the public knowledge in the local `ComposioHQ/support-workflows` snapshot into a useful set of web-native Knowledge Base articles without dumping source folders onto the site, duplicating existing documentation, or publishing stale support claims.

The first pass will audit all 115 `public.md` files and their 670 level-two sections, classify every candidate, and publish a reviewed batch of 15–20 high-value articles on the existing isolated `codex/public-kb-docs` branch. It will not merge, deploy, replace the production Algolia index, or add repository synchronization.

## Source ownership

- `support-workflows` remains canonical for support knowledge. Only `public.md` content may feed public pages.
- `private.md`, customer files, internal workflows, raw ticket exports, and private provenance are forbidden publication inputs.
- The Composio docs application owns presentation, search metadata, freshness state, redirects, and its pinned deployable snapshot.
- `public-kb` is a noncanonical archive. It may identify a missing topic, but its text cannot be published directly. A useful archived fact must first be independently verified and proposed for the canonical support knowledge.
- OAuth guides, product documentation, examples, reference pages, toolkits, and changelog entries keep their existing canonical locations. The KB links to them instead of copying them when they already answer the question well.

## Editorial unit

The publication unit is one user question, not one source file or one Markdown heading.

An article may:

- use one source section as-is when it already answers one clear question;
- combine adjacent sections from the same public page when they form one procedure;
- split an overloaded section when it answers multiple independently searchable questions;
- rewrite the title, introduction, order, and transitions for web readability;
- add links to canonical Docs, OAuth, toolkit, reference, or status pages.

Every article records one or more exact public source references as `{ sourcePath, sourceHeading }`. Editorial changes must preserve the source meaning. New product facts require separate verification before they can appear in published copy.

Web articles should normally contain:

1. A direct answer in the opening paragraph.
2. Preconditions or scope when the answer is conditional.
3. Steps, examples, or the exact error interpretation.
4. Important limitations and when to contact support.
5. Links to canonical product documentation or provider documentation.

Response-template language, internal escalation instructions, customer-specific context, and conversational filler are removed.

## Candidate classification

Each source section or editorial group receives exactly one state:

- `publish`: useful, public-safe, sufficiently unique, and verified.
- `link-only`: an existing canonical page already provides an equal or better answer. The audit records that destination and no duplicate KB article is created.
- `needs-verification`: potentially useful, but a time-sensitive claim or ambiguous scope cannot yet pass the freshness gate.
- `exclude`: resolved incident guidance, obsolete product behavior, internal response wording, a duplicate, or material too narrow to justify a public page.

Resolved incident pages are excluded from the normal article batch. A durable diagnostic may be extracted only after it is rewritten as evergreen guidance and independently verified. Historical status details remain on the status system.

## Freshness gate

Each publishable article is classified as either:

- `evergreen`: stable concepts such as protocol behavior, provider constraints, error-envelope semantics, or general integration patterns. Review within 180 days.
- `time-sensitive`: action or trigger slugs, limits, pricing, permissions, UI instructions, API versions, model names, managed OAuth status, availability, deprecations, or current workarounds. Review within 90 days.

Publication requires `lastVerifiedAt`, `reviewAfter`, and a short verification note in the audit.

Verification uses the closest authoritative source:

- current Composio code, schemas, production behavior, or official Composio documentation for Composio facts;
- current provider documentation for provider requirements;
- the live canonical URL for external guides;
- the current status page for incident state.

If authoritative evidence conflicts with `public.md`, the article remains held. This pass does not silently rewrite the canonical support source.

## Deduplication rule

For every candidate, search the unified public corpus before writing an article.

- If Docs or OAuth already answers the same user intent with the same operational detail, classify the candidate `link-only`.
- If support knowledge adds a concrete error interpretation, limitation, workaround, or troubleshooting decision absent from Docs, publish a focused KB article and link back to the canonical documentation.
- Search aliases and provider terminology belong in article metadata; they do not justify duplicate pages.
- A single canonical URL must win for each answer intent.

## Prioritization

Eligible candidates are ranked using four signals:

- 35% support frequency, using the checked-in Plain toolkit ticket-volume report and cross-cutting support prominence;
- 30% coverage gap, favoring questions without an equivalent Docs, OAuth, or existing KB answer;
- 20% user impact, favoring blockers, authentication failures, data loss risks, repeated errors, and integration setup failures;
- 15% verification confidence, favoring facts that can be confirmed from authoritative current evidence.

The first batch contains 15–20 articles. At least six must cover cross-cutting platform, authentication, connected-account, Tool Router/MCP, SDK/API, dashboard, or Composio For You questions. The remainder come from the highest-scoring toolkit gaps. No more than three articles from one toolkit are included in the first batch so that one long source file does not dominate the site.

## Audit outputs

The implementation produces:

1. `kb/audits/2026-07-22-section-audit.csv`, with one row per candidate group and these columns:
   `source_paths`, `source_headings`, `proposed_title`, `state`, `reason`, `existing_url`, `freshness`, `verification_source`, `support_signal`, and `priority_score`.
2. `kb/audits/2026-07-22-content-gap-audit.md`, summarizing counts, major coverage gaps, held-risk themes, archive-only findings, and the selected first batch.
3. Pinned public source files for only the selected articles under `kb/source/`.
4. Manifest entries containing stable slugs, exact source references, product areas, toolkit slugs, freshness metadata, related content, and publication state.
5. Generated flat pages at `/kb/guide/<slug>` using the existing KB generation path.

The audit files are review artifacts, not a second canonical knowledge base. They are not indexed or rendered publicly.

## Content workflow

1. Inventory all current local `public.md` files and level-two sections.
2. Group headings into user-question candidates without reading or importing private siblings.
3. Search the unified corpus for each candidate and classify obvious duplicates as `link-only`.
4. Flag risky claims through deterministic terms and editorial review.
5. Verify the highest-priority candidates against current authoritative evidence.
6. Select the top 15–20 candidates that pass the gate.
7. Create web-native copy, pinned source snapshots, and manifest entries.
8. Generate pages and run privacy, freshness, route, search, link, type, and production-build checks.
9. Leave the work on `codex/public-kb-docs` for user review. Do not merge, push, deploy, or update production Algolia.

## Quality and safety checks

- No `private.md` path or private-only phrase may appear in public inputs or generated pages.
- Every published factual section maps to an exact public source reference.
- Every published article has a valid freshness window.
- Every `link-only` candidate has a working canonical destination.
- Held and excluded candidates do not create routes or search records.
- Deprecated “Rube” naming is not published; current product references use “Composio For You.”
- Generated pages use stable, answer-oriented slugs and readable titles rather than folder-derived names.
- Existing canonical and legacy redirects remain valid.
- Search, sitemap, LLM indexes, and toolkit/topic aggregation include the new pages automatically through the normalized record contract.

## Acceptance criteria

- All 115 public files and 670 level-two sections are accounted for in the audit, including four files whose answer begins at the document body rather than under a level-two heading.
- Every candidate is classified as `publish`, `link-only`, `needs-verification`, or `exclude` with a concrete reason.
- The first batch contains 15–20 verified, nonduplicate, web-native articles and at least six cross-cutting articles.
- The previously held auth-config pagination claim is either verified and published or remains explicitly held with evidence explaining why.
- No canonical support source, private file, production index, deployed site, or Git branch outside `codex/public-kb-docs` is mutated.
- Content generation, all static tests, type checking, link validation, search dry-run, and the production build pass.

