# Unified Composio Knowledge Hub Design

**Status:** Approved for implementation planning

**Goal:** Turn `/kb` into the search-and-browse entry point for public product knowledge about Composio, regardless of where the canonical page is hosted.

## Product definition

The Knowledge Base is a discovery layer, not a new content silo. It should help a user find the best public answer across:

- conceptual and task-based documentation;
- reviewed Knowledge Base answers from `support-workflows`;
- OAuth setup guides;
- toolkit pages;
- examples;
- the current API reference;
- relevant changelog entries.

Canonical content stays in its owning system. Search results link directly to that canonical URL. The docs repository continues to own the `/kb` interface and the generated snapshot of reviewed support answers.

Marketing pages, the blog, community posts, and private support material are outside the default v1 corpus. They can be added later only if their inclusion improves product-answer quality.

## Why the current structure does not scale

The current Fumadocs sidebar treats the first topic on each KB guide as a folder and exposes every guide as a child page. This creates a flat list of unrelated providers under “Toolkits,” repeats category index pages in the navigation, and will become unusable as the corpus grows.

Topics and toolkits are facets, not exclusive folders. A Strava athlete-limit answer belongs to Strava, authentication, connected accounts, troubleshooting, and provider policy at the same time. The UI must not force it into one visible hierarchy.

## Approaches considered

### Chosen: unified search with curated browsing

Use one search corpus, label each result by source type, and provide topic and toolkit browsing beneath a prominent search field. This supports precise lookup and exploration without duplicating canonical content.

### Rejected: search-only landing page

A single search field is visually clean but gives users no recovery path when they do not know Composio terminology, an action slug, or the correct provider name.

### Rejected: separate source tabs or indexes

Splitting Docs, KB, OAuth, Toolkits, and Reference into separate searches preserves organizational boundaries that users should not have to understand. Source filters remain useful, but they should refine one result set rather than create separate search experiences.

## Information architecture

### Stable problem areas

The homepage provides these curated browse paths:

1. Authentication and connected accounts
2. Tools and actions
3. Triggers and webhooks
4. Tool Router, MCP, and Workbench
5. SDK and API
6. Projects, dashboard, and billing

Composio For You is exposed as a product facet and a curated homepage link when it has enough public content. Known issues and incidents are content types rather than permanent product areas.

### Toolkit browsing

“Browse by toolkit” is a separate searchable grid using toolkit names and logos. A toolkit landing page lists all relevant public knowledge across source types, not only KB guides.

### Content metadata

Every search document should expose:

- `type`: docs, kb, oauth-guide, toolkit, example, reference, changelog;
- `canonicalUrl`;
- `title` and `description`;
- `productAreas`;
- `toolkitSlugs` when applicable;
- `intents`: setup, how-to, troubleshooting, limits-policy, known-issue, reference;
- searchable keywords, action slugs, error phrases, and aliases;
- freshness and verification metadata when the source provides them.

Metadata can map one page to several areas and toolkits. It does not determine the canonical URL.

## Routes and navigation

- `/kb` — custom knowledge-hub landing page without the generated article tree.
- `/kb/search?q=<query>` — shareable unified result view.
- `/kb/guide/<slug>` — canonical path for generated support-workflow answers.
- `/kb/topic/<slug>` — curated cross-source product-area landing page.
- `/kb/toolkit/<slug>` — cross-source toolkit landing page.

Existing `/kb/<topic>/<guide>` URLs permanently redirect to `/kb/guide/<slug>`.

The global header keeps “Knowledge Base.” Article pages retain the standard docs header, content treatment, verification date, feedback action, related links, and breadcrumb. Their left navigation shows only Knowledge Base home, product areas, and toolkit browsing; it never expands into a list of every guide.

## Homepage experience

The landing page uses a custom layout rather than the current generated Fumadocs index:

1. A hero with “Search all Composio knowledge” and a large search field.
2. Six product-area cards.
3. A compact “Browse by toolkit” section with popular toolkits and “View all.”
4. An editorially selected set of featured answers and guides.
5. A short explanation that results may open Docs, Knowledge Base, OAuth guides, Toolkit pages, Examples, Reference, or Changelog.

The page does not show the full Fumadocs article sidebar. Mobile uses the same sequence with a full-width search field and horizontally compact source/filter controls.

## Search experience

The hero search and global header search use the same Algolia corpus. The Knowledge Base presentation differs by showing richer cross-source results and browse recovery paths.

Each result displays:

- title;
- matching excerpt;
- source-type badge;
- product-area or toolkit breadcrumb;
- verification date for KB answers when available.

Result filters are `All`, `Docs`, `Knowledge Base`, `OAuth`, `Toolkits`, and `Reference`. Examples and changelog remain included in `All`; they do not require dedicated v1 filter controls.

Ranking follows Algolia textual relevance first and uses source ranking only to break close matches:

1. Exact titles, error phrases, provider names, action slugs, and API identifiers must win regardless of source type.
2. Current conceptual docs and verified KB answers receive the highest close-match ranks.
3. OAuth guides and toolkit pages follow.
4. Examples follow toolkit pages.
5. Current API reference and changelog remain discoverable but rank below explanatory content unless the query precisely matches them.
6. Deprecated and legacy reference material remains last-resort content.

A zero-result state offers product-area and toolkit browsing. Search failure must not make the homepage unusable; the curated sections remain available.

## Content and indexing flow

Local docs collections already feed one Algolia index. The unified search builder will extend those records with the new metadata fields and add OAuth guide records.

OAuth guide indexing runs in the search-sync workflow rather than during the production site build. A checked-in `kb/external-sources/auth-guides.json` registry stores each canonical guide URL, toolkit slug, title, and description. The registry is seeded with the 43 live guides from the audit. Search sync fetches and validates every registered URL before preparing the complete replacement index. If external guide collection fails, the workflow must not replace the existing Algolia index with a partial corpus.

The `support-workflows` repository remains canonical for public support answers. The existing pinned-snapshot and review-gate model remains unchanged; this design does not introduce automatic repository synchronization.

## Accessibility and responsive behavior

- The main search has a persistent visible label and keyboard focus treatment.
- Search and filter controls work by keyboard and announce result-count changes.
- Source badges are readable text, not color-only indicators.
- Cards preserve logical heading order and useful accessible names.
- Mobile navigation does not render the full guide corpus as nested accordion items.

## Validation

Automated checks must cover:

- at least one indexed page for every supported source type;
- metadata and canonical URL validation;
- exact-title, action-slug, error-phrase, and close-match ranking fixtures;
- source filters and the unfiltered result set;
- OAuth collection failure without partial index replacement;
- old KB route redirects;
- landing-page keyboard behavior and zero-result recovery;
- desktop and mobile rendering;
- held, expired, retired, private, and legacy content exclusions or demotions.

Manual QA must verify the landing page, one result from each source type, category and toolkit browsing, an old URL redirect, and the empty-search state.

## Out of scope

- Moving docs, OAuth guides, toolkit pages, or API reference content into the KB directory.
- Automatically synchronizing `support-workflows` into the docs repository.
- Generating AI-synthesized answers on the search page.
- Indexing private support cases, internal operational notes, marketing pages, blog posts, or community content.
- Reorganizing the underlying Docs navigation.
