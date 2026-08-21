---
type: "reference"
title: "Platform Health Endpoints"
description: "Public reference for Composio on-prem and self-hosted health endpoints."
category: "sessions-and-execution"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "health-endpoints"
---
# Platform Health Endpoints

Use this only for Composio on-prem / self-hosted customers who ask whether they can monitor their Composio instance in real time. These endpoints are not general public-cloud customer endpoints.

Requests must include the Composio admin token header:

```http
x-composio-admin-token: <COMPOSIO_ADMIN_TOKEN>
```

## Apollo

Basic liveness:

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

This only confirms that Apollo can serve the request. It does not check downstream dependencies.

Deep dependency health:

```bash
curl -sS "$COMPOSIO_BASE_URL/api/deep_healthz" \
  -H "x-composio-admin-token: $COMPOSIO_ADMIN_TOKEN" | jq
```

Example:

Apollo deep health checks:

- `postgres`: `SELECT 1` through Prisma.

- `redis`: Redis `PING`.

- `thermos`: generated Thermos client `getHealthcheck()`, which calls Thermos `GET /api`.

- active object storage backend: response key is either `s3` or `azure_blob_storage`; Apollo writes a zero-byte probe object and deletes it best-effort.

Important: Apollo deep health returns HTTP `200` for GET requests even when one or more dependencies are unreachable. Monitors should inspect `data.<service>.reachable`, not just HTTP status.

## Thermos

Basic liveness:

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

Deep dependency health:

```bash
curl -sS "$THERMOS_BASE_URL/api/health/deep" \
  -H "x-composio-admin-token: $COMPOSIO_ADMIN_TOKEN" | jq
```

Example:

Required services are `database`, `toolkit_registry_database`, and `temporal`.

Thermos status behavior:

- `healthy`: required services are not in `error`.

- `unhealthy`: required service `database`, `toolkit_registry_database`, or `temporal` is in `error`.

Thermos returns HTTP `503` only when overall status is `unhealthy`; otherwise it returns HTTP `200`.
