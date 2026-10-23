Use this only for Composio on-prem / self-hosted customers who ask whether they can monitor their Composio instance in real time. These endpoints are not general public-cloud customer endpoints.

Requests must include the Composio admin token header:

```http
x-composio-admin-token: <COMPOSIO_ADMIN_TOKEN>
```

## Apollo

### Basic liveness

#### Python

> [!NOTE]
> The Python SDK has no resource for self-hosted admin-health endpoints. Use the API option with your deployment URL and admin token.

#### TypeScript

> [!NOTE]
> The TypeScript SDK has no resource for self-hosted admin-health endpoints. Use the API option with your deployment URL and admin token.

#### API

<!-- code-example: unchecked-api rule="api-base-url" operation="GET /api/healthz" reason="Apollo health runs at the customer's self-hosted deployment URL, not the public-cloud API." -->
<!-- code-example: unchecked-api rule="api-legacy-version" operation="GET /api/healthz" reason="Apollo's self-hosted liveness route is unversioned." -->
<!-- code-example: unchecked-api rule="api-key-header" operation="GET /api/healthz" reason="Self-hosted health uses x-composio-admin-token, not a project API key." -->
```bash
curl -i "$COMPOSIO_BASE_URL/api/healthz" \
  -H "x-composio-admin-token: $COMPOSIO_ADMIN_TOKEN"
```

Success:

```json
{
  "status": "ok"
}
```

<!-- end-languages -->

This only confirms that Apollo can serve the request. It does not check downstream dependencies.

### Deep dependency health

#### Python

> [!NOTE]
> The Python SDK has no resource for self-hosted admin-health endpoints. Use the API option with your deployment URL and admin token.

#### TypeScript

> [!NOTE]
> The TypeScript SDK has no resource for self-hosted admin-health endpoints. Use the API option with your deployment URL and admin token.

#### API

<!-- code-example: unchecked-api rule="api-base-url" operation="GET /api/deep_healthz" reason="Apollo health runs at the customer's self-hosted deployment URL, not the public-cloud API." -->
<!-- code-example: unchecked-api rule="api-legacy-version" operation="GET /api/deep_healthz" reason="Apollo's self-hosted dependency-health route is unversioned." -->
<!-- code-example: unchecked-api rule="api-key-header" operation="GET /api/deep_healthz" reason="Self-hosted health uses x-composio-admin-token, not a project API key." -->
```bash
curl -sS "$COMPOSIO_BASE_URL/api/deep_healthz" \
  -H "x-composio-admin-token: $COMPOSIO_ADMIN_TOKEN" | jq
```

<!-- end-languages -->

Example:

Apollo deep health checks:

- `postgres`: `SELECT 1` through Prisma.

- `redis`: Redis `PING`.

- `thermos`: generated Thermos client `getHealthcheck()`, which calls Thermos `GET /api`.

- active object storage backend: response key is either `s3` or `azure_blob_storage`; Apollo writes a zero-byte probe object and deletes it best-effort.

Important: Apollo deep health returns HTTP `200` for GET requests even when one or more dependencies are unreachable. Monitors should inspect `data.<service>.reachable`, not just HTTP status.

## Thermos

### Basic liveness

#### Python

> [!NOTE]
> The Python SDK has no resource for self-hosted admin-health endpoints. Use the API option with your deployment URL and admin token.

#### TypeScript

> [!NOTE]
> The TypeScript SDK has no resource for self-hosted admin-health endpoints. Use the API option with your deployment URL and admin token.

#### API

<!-- code-example: unchecked-api rule="api-base-url" operation="GET /api" reason="Thermos health runs at the customer's self-hosted deployment URL, not the public-cloud API." -->
<!-- code-example: unchecked-api rule="api-legacy-version" operation="GET /api" reason="Thermos's self-hosted liveness route is unversioned." -->
<!-- code-example: unchecked-api rule="api-key-header" operation="GET /api" reason="Self-hosted health uses x-composio-admin-token, not a project API key." -->
```bash
curl -i "$THERMOS_BASE_URL/api" \
  -H "x-composio-admin-token: $COMPOSIO_ADMIN_TOKEN"
```

Example:

```json
{
  "status": "ok",
  "time": "2026-06-19T05:37:25Z"
}
```

### Deep dependency health

#### Python

> [!NOTE]
> The Python SDK has no resource for self-hosted admin-health endpoints. Use the API option with your deployment URL and admin token.

#### TypeScript

> [!NOTE]
> The TypeScript SDK has no resource for self-hosted admin-health endpoints. Use the API option with your deployment URL and admin token.

#### API

<!-- code-example: unchecked-api rule="api-base-url" operation="GET /api/health/deep" reason="Thermos health runs at the customer's self-hosted deployment URL, not the public-cloud API." -->
<!-- code-example: unchecked-api rule="api-legacy-version" operation="GET /api/health/deep" reason="Thermos's self-hosted dependency-health route is unversioned." -->
<!-- code-example: unchecked-api rule="api-key-header" operation="GET /api/health/deep" reason="Self-hosted health uses x-composio-admin-token, not a project API key." -->
```bash
curl -sS "$THERMOS_BASE_URL/api/health/deep" \
  -H "x-composio-admin-token: $COMPOSIO_ADMIN_TOKEN" | jq
```

<!-- end-languages -->

Example:

Required services are `database`, `toolkit_registry_database`, and `temporal`.

Thermos status behavior:

- `healthy`: required services are not in `error`.

- `unhealthy`: required service `database`, `toolkit_registry_database`, or `temporal` is in `error`.

Thermos returns HTTP `503` only when overall status is `unhealthy`; otherwise it returns HTTP `200`.
