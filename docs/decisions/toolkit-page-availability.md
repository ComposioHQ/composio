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
it only writes to the current repository. The separate token for
`ComposioHQ/support-knowledge` and every step that consumes it are optional and
non-fatal. A failure in that path can reduce KB freshness evidence, but it cannot
block toolkit, OpenAPI, API index, or meta-tool generation.

## Consequences

- A snapshot hit renders without a production catalog request.
- A snapshot miss may issue one production lookup for the validated slug. An
  invalid or unknown slug still returns 404.
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

## Verification

A local workflow test cannot prove GitHub App installation permissions. The
required proof is a `workflow_dispatch` run at the exact reviewed head that
passes the token step and reaches `Generate toolkits data`.

Run `32797593048` at commit `3716bda` passed both the token step and
`Generate toolkits data`. This proves the installation accepted the token
request at that exact head. The hosted runtime contains a `COMPOSIO_API_KEY`
environment variable name, but its production scope has not been verified.
Production fallback behavior therefore remains unverified until a deployed
snapshot-miss toolkit page returns 200 with the expected toolkit data.

For future changes:

- Run `bun run lint:links` from `docs/` after editing this record.
- Dispatch `Docs - Update Data` at the exact reviewed head after changing token
  permissions.
- After deployment, verify one snapshot-backed slug and one valid production
  slug absent from the committed snapshot both return 200.
