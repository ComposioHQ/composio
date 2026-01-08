# OpenAPI Scripts

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
