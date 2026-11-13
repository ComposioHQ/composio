# Knowledge Base Retirement

## Decision

Retire the public Knowledge Base at `docs.composio.dev/kb` (decided 2026-11-13).
The `/kb` routes, the generated guides in `content/kb`, the vendored
`ComposioHQ/support-knowledge` snapshot in `kb/`, and the workflows that imported,
verified, and embedded it are removed.

Every `/kb` URL answers with a permanent redirect defined in
`lib/kb-redirects.mjs`:

- Each support guide goes to the closest maintained page in `/docs` or
  `/reference`.
- Toolkit guides (`/kb/guide/toolkits-<name>`) and toolkit hubs
  (`/kb/toolkit/<slug>`) go to `/toolkits/<slug>`, which already carries the
  toolkit FAQ.
- Topic hubs go to the matching docs section.
- Anything else under `/kb`, including legacy aliases, goes to `/docs`.
- `.md` and `.mdx` variants redirect to the Markdown form of the same
  destination.

`/api/knowledge-search` stays. The published `composio` skill tells agents to
call it, so it keeps searching docs, toolkits, examples, reference, changelog,
and the external OAuth guide registry (`lib/knowledge/auth-guides.json`). It is
keyword-only. `filter=kb` is still accepted as a deprecated alias for
`filter=docs`, so existing callers don't get a 400.

## Context

PostHog pageviews for the 90 days ending 2026-11-13, excluding bot user agents:

| Section | Pageviews | Share | Pageviews per sitemap URL |
|---|---|---|---|
| `/docs` | 188,859 | 58.8% | 1,038 |
| `/toolkits` | 61,148 | 19.0% | 35 |
| `/reference` | 41,014 | 12.8% | 162 |
| `/kb` | 15,404 | 4.8% | 66 |
| `/examples` | 14,233 | 4.4% | 949 |

KB traffic peaked in its launch week and then held at about 1,000 to 1,200
pageviews a week. In the latest 30 days, one guide reached through links with no
referrer accounted for 25% of KB views. Without it, KB pageviews fell about 10%
from the prior 30 days. About 29% of sessions that started on a KB page came from
search engines, and about 3% from AI assistants.

Keeping the KB meant running a second publication pipeline: an upstream import,
a freshness verifier on every data sync, a semantic index that had to be rebuilt
with OpenAI embeddings, and 17 test files. Of the 93 KB toolkit guides, 56 cover
a toolkit that already has a maintained FAQ on its `/toolkits` page.

The semantic layer of knowledge search was built for KB prose and validated
against the KB snapshot commit. Production was serving keyword results at
retirement time, so removing it does not change live search behavior.

## Consequences

- Support answers that belong in public docs go into the relevant `/docs` page
  or toolkit FAQ (`content/toolkits/faq/<slug>.md`), not a separate corpus.
- New `/kb` URLs must not be published. Keep `lib/kb-redirects.mjs` in place
  indefinitely, because external links, bookmarks, and AI answers still point at
  KB URLs.
- If a redirect destination is renamed, update its entry in
  `lib/kb-redirects.mjs` in the same change.
- The `kb_search_executed` PostHog event name is kept for continuity of
  knowledge-search analytics even though the KB is gone.
- `ComposioHQ/support-knowledge` no longer has a consumer in this repository.
  Its owners decide whether to archive it.
- Supersedes [Public Knowledge Base](./public-knowledge-base.md) and
  [KB Freshness Verification](./kb-freshness-verification.md).

## Verification

- `bun test tests/static/kb-redirects.test.ts` checks that every mapped
  destination exists and that a catch-all covers the rest of `/kb`.
- `bun run test:integration` runs `tests/integration/kb-redirects.test.ts`
  against a built site.
- `tests/static/knowledge-corpus.test.ts` checks that no `/kb` URL appears in
  search records, the sitemap, or `llms-index.txt`.
- The health check confirms `/kb` resolves and `/api/knowledge-search` answers in
  keyword mode.
