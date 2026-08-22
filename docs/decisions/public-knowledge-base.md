# Public Knowledge Base

## Decision

Host the Composio public knowledge base in the existing documentation site at
`docs.composio.dev/kb`. Add **Knowledge Base** as a top-level navigation item
between Docs and Examples.

`ComposioHQ/support-knowledge` is the canonical authoring repository for
support-specific KB prose. The docs site contains a pinned, manually reviewed
publication snapshot with source provenance and freshness metadata. A pull-only
importer validates an explicit local checkout and atomically refreshes that
snapshot; it never writes upstream. Canonical product documentation remains in
the docs repository, including the reviewed Composio For You client snapshot
defined below.

The `/kb/search` experience is a unified public-support search, not a KB-only
index. Every current public docs, KB, toolkit, example, reference, and changelog
record is eligible, with source-aware retrieval and ranking. Keyword search is
the fast path across the full corpus; semantic retrieval is reserved for
editorial docs and KB prose when lexical retrieval does not produce a strong
match.

## Context

Customer-shareable support knowledge is classified in `support-knowledge` as
either `public` or `customer-safe`. Only `public.md` leaves are eligible for the
hosted site, public search artifacts, and public agent skills. The first
implementation prototype rendered two reviewed guides inside the marketing
`landing` repository. That prototype proved the
publication gates and user experience, but the docs application is a better
runtime because it already provides:

- Fumadocs content collections and article layouts;
- navigation, responsive sidebars, and search;
- Algolia indexing with a local Fumadocs fallback;
- feedback collection, sitemap generation, and LLM-readable endpoints;
- a public GitHub repository and an established documentation review process.

Keeping the KB in `landing` would duplicate those systems and split technical
support content from the documentation audience.

Three locations were considered:

1. **Docs application (chosen):** native documentation UX and discovery with a
   small amount of collection and route work.
2. **Marketing application:** strongest main-domain ownership, but duplicates
   docs rendering, search, feedback, and discovery infrastructure.
3. **Separate repository or subdomain:** independent deployment, but creates a
   third public content surface and the largest maintenance burden.

## Architecture

The system has three distinct responsibilities:

1. **Authoring:** support maintainers edit classified leaves in
   `support-knowledge`; its validation, freshness, manifest, and human review
   gates remain authoritative.
2. **Publication:** a maintainer runs the pull-only importer against an explicit
   source checkout and commit. The staged snapshot records source provenance,
   public routes, content hashes, verification dates, and review deadlines, and
   replaces the previous valid snapshot only after validation succeeds.
3. **Rendering:** the `docs/` Fumadocs application renders only published pages
   and includes them in navigation, search, sitemap, feedback, and LLM outputs.

The initial release keeps invocation and review manual. It automates the
mechanical copy so classification enforcement is reproducible, but it does not
fetch private repositories at application runtime, open pull requests, publish,
or write back to `support-knowledge`.

## Content Model

Every reviewed `public.md` file is eligible for the public corpus, but a source
file is not necessarily one web page. A self-contained level-two problem or
question can become an individual guide. Structural headings stay with their
parent guide.

The publication layer records:

- stable slug and aliases;
- title and description;
- source repository, commit, path, and selected heading;
- topics, tags, and related resources;
- updated and last-verified dates;
- freshness class and review deadline;
- `published`, `needs-review`, or `retired` state.

The docs-site snapshot imports every public leaf from a verified
`ComposioHQ/support-knowledge` commit. Customer-safe leaves remain excluded.
The manifest records both the exact commit and a deterministic hash of the
vendored public source bytes.

### Composio For You

Client setup content is maintained in the dashboard repository rather than
`support-knowledge`. The initial For You publication takes a one-time snapshot
of the client definitions and public-safe onboarding media at dashboard commit
`269ab875f5c2fb0f40b312328812e7cc068faaa9` and reconciles the canonical
`/docs/composio-connect` page with that snapshot.

The docs page, not a duplicated KB page, remains canonical for client setup.
Client sections use stable anchors and searchable aliases for renamed or
closely related clients. The snapshot contains placeholders and public setup
instructions only; personalized keys, sessions, connection state, logs,
organization identifiers, and account-specific URLs remain excluded.

Existing For You-tagged KB guides remain canonical for support-specific facts
and troubleshooting. New KB guides are added only for an identified knowledge
gap that is not already answered by current docs or a published KB guide.
Volatile pricing, entitlement, and security claims require an authoritative
public source and are not copied from dashboard FAQ prose by default.

## Routes and Navigation

- `/kb` is the knowledge-base landing page.
- `/kb/<topic>` is a topic landing page when a topic has multiple guides.
- `/kb/<topic>/<guide-slug>` is the canonical guide route.
- aliases permanently redirect to the canonical route.

The header order is Docs, Knowledge Base, Examples, Toolkits, Reference. KB
pages use native Fumadocs layouts and components rather than maintaining a
second design system. The KB landing page may use a small custom MDX landing
page for search, featured guides, recently verified guides, and topic cards.

The marketing site may later redirect `composio.dev/kb` to
`docs.composio.dev/kb`; the unmerged marketing prototype does not establish a
public URL contract.

## Search and Discovery

`/kb/search` searches every current public record in the existing Algolia index:
docs, KB guides, toolkits, examples, current reference, and changelog. Legacy
reference records are eligible only for an exact identity match when no current
reference record answers the same query. Search results always link to the
canonical page or section; the search layer does not generate an answer or
create redirect-only KB copies of docs pages.

Retrieval is deliberately asymmetric by source:

1. Run keyword retrieval across the complete public index.
2. Treat an exact normalized title, keyword, slug, toolkit slug, tool slug, or
   current reference identity as a strong lexical match and return it without
   waiting for an embedding request.
3. When lexical confidence is weak, embed the query and search a checked-in
   OpenAI `text-embedding-3-small` artifact containing public KB and docs prose.
4. Fuse the editorial semantic candidates with the full-corpus keyword
   candidates using deterministic Reciprocal Rank Fusion, while preserving
   exact identifier matches.

Natural-language support questions therefore favor KB and docs prose, while
exact toolkit, action, endpoint, and schema queries favor toolkit or reference
records. Toolkits, generated reference, examples, and changelog are not added
to the semantic artifact: their structured identifiers work better with
lexical retrieval, and embedding them would increase artifact size and scan
time without improving the common support path. This corpus does not justify
Algolia NeuralSearch, a vector database, or an approximate index.

The existing global Docs search remains keyword-only. If query embedding or the
semantic artifact is unavailable, `/kb/search` returns the complete keyword
result set. If Algolia is unavailable, it uses the local lexical index and may
combine those results with editorial semantic candidates. No failure path
widens discovery beyond records already classified for public indexing.

The initial `/kb/search?q=...` request runs through a shared server-side search
service during page rendering. The API route calls the same service for direct
agent access and subsequent client-side requests. The page hydrates with the
server result instead of waiting for React hydration before starting its first
search, avoiding a page-load-to-API waterfall without maintaining two ranking
implementations.

Preview deployments must represent the branch under review even though the
shared Algolia index synchronizes only from `next`. In Vercel preview and local
development, `/kb/search` overlays module-cached lexical results from the
branch's bundled docs and KB collections on the shared Algolia candidates.
Branch-local records replace shared records with the same canonical URL;
toolkits, examples, reference, and changelog continue to come from the shared
index. Production uses the synchronized Algolia corpus without this overlay.
Overlay failure falls back to the shared index and is reported as retrieval
degradation; it does not require a branch-specific Algolia index or database.

Semantic requests retain a configurable three-second safety timeout, an
eight-request concurrency ceiling, a 60-request-per-minute client budget, and a
generous 600-request-per-minute process ceiling. The timeout is a worst-case
guardrail, not a delay imposed on strong lexical searches. Hitting any semantic
guardrail is logged and returns keyword results rather than blocking search.

Mixed result cards show a concise source label such as Documentation, Knowledge
Base, Toolkit, Example, or API Reference. They do not show the redundant
`Guide` badge. Search analytics record total duration, keyword duration,
semantic duration when invoked, retrieval mode, result source types, clicked
source type and position, zero-result searches, and guardrail degradation.

The same read-only unified search and canonical-page contract is available to
the existing public `composio` skill as a fallback after its primary
documentation and CLI sources. The skill uses the unified endpoint rather than
hard-coding a KB-only filter. It retrieves evidence and lets its host agent
answer; it does not contain a duplicate fact corpus or run its own generation
service.
Authenticated retrieval of `customer-safe` content is a separate future design.

Published KB pages are also included in:

- the XML sitemap;
- `llms.txt`, `llms-full.txt`, and scoped `llms.mdx` routes;
- link validation;
- the existing feedback flow.

`needs-review` and retired entries are excluded from routes and every discovery
surface.

## Freshness and Privacy

Publication fails when a published entry:

- is not explicitly public;
- contains known private-data markers;
- has no verification or review deadline;
- has an expired review deadline;
- references an unknown topic, related guide, source section, or alias;
- collides with another canonical route or alias.

Default review windows remain 180 days for evergreen guidance, 30 days for
provider or OAuth setup, and 7 days for active incidents. These are publication
defaults in the docs application, not changes to the canonical source schema.

Guide pages show the last-verified date. Time-sensitive material is held by
default until its live behavior has been rechecked.

## Failure Handling

The KB validator runs before docs builds and reports the source path and reason
for invalid content. A failed or stale entry must not be silently omitted from
a supposedly successful publication. External resource failures must not make
the local KB unavailable; they may degrade to ordinary links.

## Testing and Verification

The implementation is complete when:

- parser and publication-gate unit tests pass;
- the importer verifies the upstream repository and exact checked-out commit;
- the validator reports the expected public guide count and no private leaves;
- `/kb`, topic pages, guide pages, and aliases render in a local docs build;
- held content is absent from routes, search, sitemap, and LLM outputs;
- current For You clients in the pinned dashboard snapshot have canonical,
  searchable setup sections with no personalized values;
- representative natural-language, client-setup, toolkit, exact action-slug,
  and API-reference queries return the expected source class without asserting
  mutable prose claims;
- the initial search result is present in the server-rendered response and does
  not depend on a post-hydration request;
- preview search prefers branch-local docs and KB records over shared Algolia
  versions with the same canonical URL, while production does not apply the
  overlay;
- strong lexical queries do not invoke semantic retrieval, while weak queries
  can fuse editorial semantic results with full-corpus keyword results;
- semantic timeout, rate, capacity, artifact, and embedding failures return
  keyword results and emit the expected analytics category;
- existing docs tests, type checks, lint, link validation, and production build
  pass;
- the header exposes Knowledge Base in desktop and mobile navigation.

## Consequences

- The unmerged `landing` KB branch becomes a prototype, not the production
  destination. Reusable publication logic and tests are ported; custom page
  chrome is not.
- Public KB prose continues to be maintained in `support-knowledge`.
- Canonical For You client setup lives in docs from a reviewed, one-time
  dashboard snapshot; automatic synchronization remains out of scope.
- The docs repository owns the deployed snapshot, route metadata, validation,
  and presentation.
- No new repository, subdomain, or synchronization service is introduced.
- The hosted UI, API, and agent skills share one public-only, multi-source
  retrieval contract; customer-safe and live operational evidence remain
  separate boundaries.
