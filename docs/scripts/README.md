# OpenAPI Scripts

## fetch-with-retry.ts

Shared `fetchWithRetry` helper used by the data-generation scripts
(`generate-toolkits.ts`, `generate-meta-tools.ts`). It wraps the global `fetch`
with rate-limit-aware retry/backoff: it retries `429` and transient 5xx
responses, honors the `Retry-After` header when present, otherwise falls back to
exponential backoff with jitter, and caps attempts so CI still fails fast when
the backend is genuinely down.

This matters because `generate-toolkits.ts` issues ~6500 requests per run
(a few catalog pages + 3 per toolkit across a ~2.1k catalog), which can exceed
the backend request limit.
Before this helper, runs failed with `429`, and `generate-meta-tools.ts` — which
runs immediately after — inherited the exhausted rate-limit window.

## Toolkit versions

`generate-toolkits.ts` owns the complete toolkit catalog and always sources it
from the production API. For a version-only repair, run the narrower generator:

```bash
COMPOSIO_API_KEY=... bun run generate:toolkit-versions
```

Both paths share `toolkit-versions.ts`, so they fetch and apply changelog values
with identical semantics: a toolkit missing from the production changelog gets
`version: null`. Any `COMPOSIO_API_BASE` override must normalize to
`https://backend.composio.dev/api/v3`; non-production sources fail before a
request is made.

## fetch-openapi.mjs

Fetches the Composio OpenAPI spec and filters it for use in Fumadocs API reference documentation.

### Usage

```bash
bun run scripts/fetch-openapi.mjs
```

This outputs `public/openapi.json` which is used by `lib/openapi.ts`.

### Why Filtering is Needed

The raw OpenAPI spec from `https://backend.composio.dev/api/v3/openapi.json` has issues that break documentation generators:

1. **Endpoints with multiple tags** - Causes duplicate entries in sidebar
2. **Internal endpoints exposed** - CLI, Admin, Profiling endpoints shouldn't be in public docs

See `OPENAPI_IMPROVEMENTS.md` in the fumadocs root for planned fixes to the spec itself.

### What Gets Filtered

#### Ignored Paths
These endpoints are completely removed:
- `/api/v3/mcp/validate/{uuid}`
- `/api/v3/cli/get-session`
- `/api/v3/cli/create-session`
- `/api/v3/auth/session/logout`

#### Ignored Tags
Endpoints with only these tags are removed:
- `CLI`
- `Admin`
- `Profiling`

#### Duplicate Prevention
If an endpoint has multiple tags, only the first tag is kept. This prevents the same endpoint appearing in multiple sidebar sections.

### Configuration

The script uses environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAPI_SPEC_URL` | `https://backend.composio.dev/api/v3/openapi.json` | Source OpenAPI spec URL |

For staging deployments, set:
```bash
OPENAPI_SPEC_URL=https://staging.composio.dev/api/v3/openapi.json
```

## verify-kb.ts

Checks published KB guides against the production data this repo already
refreshes. Runs inside `docs-update-data.yml` right after the catalog and
OpenAPI specs are regenerated, so freshness is verified on every production
deploy instead of on a review calendar.

```bash
bun run verify:kb                    # catalog checks only, no network
bun run verify:kb --check-links      # also probe provider doc links
bun run verify:kb --json             # machine-readable report
bun run verify:kb --markdown out.md  # write the report to a file
```

Exits non-zero when any finding is an error. `--warnings-as-errors` promotes
warnings too. See `docs/decisions/kb-freshness-verification.md` for what is
checked and why placeholders, bare URLs, and 5xx responses are excluded.

A guide that deliberately cites a removed identifier declares it in
`verifyIgnoreToolSlugs` in `kb/manifest.json`.

`--check-source-pin` resolves `manifest.source.commit` against the upstream KB
repository. It needs `GH_TOKEN`/`GITHUB_TOKEN` with read access there; without
it the check reports "unverifiable" and emits nothing, so a narrow token
degrades quietly instead of reporting false provenance breakage.
