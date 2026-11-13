# Public Knowledge Base

## Purpose and ownership

- The public knowledge base is hosted with the documentation at
  `docs.composio.dev/kb`.
- The support portal's Front Desk is the only writer of KB guides. It writes
  them from public information and person-approved support answers.
- The docs repository owns the published guides (`kb/manifest.json` for
  topics, `kb/guides/<slug>.json`, `kb/articles`, `kb/source`), routes, search
  integration, and presentation. `content/kb` is generated at build time and
  not committed.
- The docs Ask AI agent and `/api/knowledge-search` read the same published
  guides; there is no separate agent-only knowledge file.
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

- A proposed guide change reaches the docs repository as a `kb-guide-approved`
  dispatch. `docs-kb-publish.yml` applies it with `scripts/publish-kb-guide.ts`
  (create, rewrite, or retire), regenerates and validates the KB, and opens a
  pull request on `next`. Reviewing and merging that pull request is the
  approval; closing it dismisses the change. Nothing merges on its own.
- Each guide lives in its own files, so pull requests for different guides
  can wait for review side by side without conflicting.
- A scheduled workflow repairs the semantic artifact when docs or guide changes
  reached `next` without a rebuild.
- The ComposioHQ/support-knowledge import was retired in 2026-11; that
  repository is no longer a source.

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

- The manifest records each guide's sources, canonical routes, verification
  dates, review deadlines, and publication state.
- Publication rejects content that is not explicitly public, contains known
  private-data markers, has expired time-sensitive verification, has broken
  references, or conflicts with an existing route.
- Time-sensitive content stays unpublished until it has been reverified.
- Evergreen review deadlines remain freshness-check errors for follow-up, but
  do not block the docs build or remove previously reviewed guides. Dates are
  extended only after review.
- The running docs application reads only the checked-in public guides; it
  does not call the support portal at runtime.

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
