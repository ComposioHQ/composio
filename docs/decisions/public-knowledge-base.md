# Public Knowledge Base

## Decision

Host the Composio public knowledge base in the existing documentation site at
`docs.composio.dev/kb`. Add **Knowledge Base** as a top-level navigation item
between Docs and Examples.

`ComposioHQ/support-workflows` remains the canonical authoring repository. The
docs site contains a pinned, manually reviewed publication snapshot with source
provenance and freshness metadata. This decision does not introduce automated
synchronization or modify the `support-workflows` schema.

## Context

Public support knowledge currently lives primarily in `public.md` files in
`support-workflows`. The first implementation prototype rendered two reviewed
guides inside the marketing `landing` repository. That prototype proved the
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

1. **Authoring:** support maintainers edit `public.md` in `support-workflows`.
2. **Publication:** a reviewed snapshot records the source repository, source
   commit, capture date, selected heading, public route, publication state,
   freshness class, verification date, and next review date.
3. **Rendering:** the `docs/` Fumadocs application renders only published pages
   and includes them in navigation, search, sitemap, feedback, and LLM outputs.

The initial release keeps the publication operation manual. Reviewers copy an
approved source snapshot into this repository, update the manifest, run the KB
validator, and commit the result. A future pull-only importer may automate that
operation after consultation with the `support-workflows` owner. The docs
repository never writes back to `support-workflows`.

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

The first docs-site slice carries over the already reviewed snapshot: two
published evergreen guides and one time-sensitive section held for review. The
remaining canonical corpus is imported in a separate editorial pass after the
new surface is validated with representative content.

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

Published KB pages participate in the existing local search and Algolia index
with a distinct `kb` result type and a rank below core conceptual docs but above
generated reference material. Search results use the same highlighting,
analytics, and keyboard behavior as the rest of the docs site.

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
- the validator reports two published guides and one held entry for the initial
  snapshot;
- `/kb`, topic pages, guide pages, and aliases render in a local docs build;
- held content is absent from routes, search, sitemap, and LLM outputs;
- existing docs tests, type checks, lint, link validation, and production build
  pass;
- the header exposes Knowledge Base in desktop and mobile navigation.

## Consequences

- The unmerged `landing` KB branch becomes a prototype, not the production
  destination. Reusable publication logic and tests are ported; custom page
  chrome is not.
- Public KB prose continues to be maintained in `support-workflows`.
- The docs repository owns the deployed snapshot, route metadata, validation,
  and presentation.
- No new repository, subdomain, or synchronization service is introduced.
- Importing the remaining public corpus is deliberately separated from the
  platform pivot so UI and publication behavior can be verified first.

