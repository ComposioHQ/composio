# Public Knowledge Base

## Purpose and ownership

- The public knowledge base is hosted with the documentation at
  `docs.composio.dev/kb`.
- `ComposioHQ/support-knowledge` is the source of support-specific public prose.
- The docs repository owns the reviewed publication snapshot, routes, search
  integration, and presentation.
- Product documentation remains canonical for product concepts and workflows;
  KB guides cover support questions and troubleshooting gaps.

## Content boundaries

- Only content explicitly classified for public use is eligible for import.
- Non-public classifications and account-specific information must never enter
  the snapshot, generated pages, search indexes, or agent-readable outputs.
- New guides should address a real knowledge gap rather than duplicate an
  existing documentation or KB page.
- Time-sensitive claims require an authoritative public source and current
  verification.
- A source document may produce multiple focused guides. Stable slugs and
  aliases preserve published URLs as the source evolves.

## Publication and maintenance

- A source change triggers a refresh after it reaches the source repository's
  main branch; periodic reconciliation catches missed events.
- The refresh validates the repository, source commit, and mainline ancestry
  before importing any content.
- Delayed events resolve to the newest mainline commit that changed public
  content. Non-public or repository-maintenance changes do not advance the
  published snapshot.
- Refreshes are serialized so overlapping runs cannot race.
- The importer treats upstream files as data, never executes upstream code, and
  never writes back to the source repository.
- Import, page generation, search-artifact generation, and validation complete
  before an automated refresh pull request is opened.
- A human review and merge remains the final publication gate.

## Rendering and discovery

- Published guides appear under `/kb` and use the docs site's existing
  navigation, layout, feedback, and canonical-link behavior.
- Knowledge search covers public docs, KB guides, toolkits, examples, current
  reference pages, and changelog entries.
- Search uses keyword matching first and semantic retrieval for public docs and
  KB prose when keyword confidence is weak.
- Semantic-search failures fall back to public keyword results; failure must
  never broaden the eligible corpus.
- Published guides are included in the sitemap and agent-readable documentation
  outputs.
- Content awaiting review or marked as retired is excluded from routes and all
  discovery surfaces.

## Freshness and safety

- The manifest records source provenance, a deterministic content hash,
  canonical routes, verification dates, review deadlines, and publication
  state.
- Publication rejects content that is not explicitly public, contains known
  private-data markers, is stale, has broken references, or conflicts with an
  existing route.
- Time-sensitive content stays unpublished until it has been reverified.
- The running docs application reads only the checked-in public snapshot; it
  does not access the source repository at runtime.

## Failure handling

- A candidate snapshot is validated before it replaces the current snapshot.
- A failed validation or import leaves the last valid public snapshot intact
  and surfaces the failure for follow-up.
- Invalid or stale guides must not be silently omitted from an otherwise
  successful publication.
- External-service failures may reduce search quality or link enrichment, but
  they must not make private content eligible.

## Verification

- Run `bun run test`, `bun run types:check`, `bun run lint`,
  `bun run lint:links`, and `bun run build` from `docs/`.
- Verify generated KB pages and the semantic artifact are current before
  merging a refresh.
