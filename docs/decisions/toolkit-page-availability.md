# Toolkit Page Availability

## Decision

Keep generated toolkit snapshots authoritative, but allow an individual toolkit
page to query production when its slug is absent from the snapshot. The fallback
is snapshot-first and limited to one validated slug. It is not a live catalog
and does not change how the toolkit landing page, sitemap, search, KB
verification, or `llms.mdx` resolve toolkit data.

Keep the primary docs-sync GitHub App token limited to repository contents and
pull requests. It must not request `issues`. Steps that create, update, or close
issues in this repository use `github.token` under the workflow's job-level
`issues: write` permission.

## Context

The toolkit pages were coupled to the freshness of
`public/data/toolkits.json`. When the docs data sync stopped before generation,
valid production toolkits added after the last snapshot returned 404. The
[toolkit page decisions](./toolkits.md) establish the generated snapshot as the
default data source, and the
[KB freshness decision](./kb-freshness-verification.md) relies on the same
snapshot architecture. The runtime fallback preserves those decisions while
removing snapshot freshness as an availability requirement for individual
toolkit pages.

The sync failure came from requesting a GitHub App permission that the
installation did not grant. Issue tracking does not need the App token because
it only writes to the current repository. The KB freshness check is optional and
non-fatal. A failure there can reduce KB freshness evidence, but it cannot block
toolkit, OpenAPI, API index, or meta-tool generation.

## Consequences

- A snapshot hit renders without a production catalog request.
- A snapshot miss may issue one production lookup for the validated slug. An
  invalid, excluded, disabled, custom, or unknown slug still returns 404. The
  fallback only publishes enabled, Composio-managed toolkits.
- Landing, sitemap, search, KB verification, and build behavior remain
  snapshot-backed.
- `/llms.mdx/toolkits/<slug>` parity is deferred. A toolkit available only
  through the page fallback can still return 404 from that route.
- `COMPOSIO_TOOLKIT_LIVE_FALLBACK=0` disables the production lookup and restores
  snapshot-only page resolution. Changing this Vercel environment variable does
  not affect the running production deployment. Create a new Vercel deployment
  after changing it. Re-enable the fallback by removing the value or setting it
  to a value other than `0`, then deploy again.
- The guaranteed code rollback is to revert the toolkit route integration and
  deploy the reverted revision.
- Every docs call to the Composio API goes through `@composio/client` (v3.1),
  built in `lib/composio-api.ts`. The toolkit page, `/llms.mdx` and
  `/api/tools/[slug]` use `Composio.fromEnv`, so `COMPOSIO_BASE_URL` selects
  the API host; the toolkit generator, `/api/toolkits/instant` and the snapshot-miss
  lookup always call production. Lists use its
  helpers, which page with `@composio/client/pagination`: toolkit pages and
  `/llms.mdx/toolkits/<slug>` at `TOOL_PAGE_SIZE`, `/api/toolkits/instant` at
  `TOOLKIT_PAGE_SIZE`, and `generate:toolkits` at the API's 1000-item cap. In
  Next.js each page is its own Data Cache entry. Next.js does not cache an
  entry over 2 MiB, and keeps serving the previous entry; an entry holds the body
  base64-encoded, so a response must stay under about 1.5 MiB. The limit is
  fixed in Next.js and lifted only by a custom `cacheHandler`. A single
  unpaginated request froze `tableau.md` at 10 of 436 tools after the toolkit
  grew, and the snapshot stopped `microsoft_365` at 1000 of 1208 tools. oxlint
  rejects a raw `fetch`, `fetcher` or `fetchWithRetry` call to `/api/v3*`.
- Dropping response fields does not replace paging. The API has no field
  selection and the Data Cache stores response bodies as received. Even reduced
  to the fields the pages render, `microsoft_365` measured 2.25 MB.
- Run `bun run lint:links` from `docs/` after editing this record.
- Dispatch `Docs - Update Data` at the exact reviewed head after changing token
  permissions.
- After deployment, verify one snapshot-backed slug and one valid production
  slug absent from the committed snapshot both return 200.
- `Docs - Toolkit Parity` runs `bun run check:toolkit-parity` every six hours.
  For the toolkits with the most tools, it fails when a deployed `.md` page
  lists a tool count matching neither production nor the snapshot, when the
  snapshot stops at the 1000-item page cap below production, when
  `/api/toolkits/instant` differs from production, or when a production
  `/tools` or `/toolkits` page would make a cache entry over
  `PAGE_BYTES_BUDGET` (85% of 2 MiB). A failure opens one
  `docs-toolkit-parity` issue, posts it to Slack, and the next clean run
  closes it.
