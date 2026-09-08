"""Selftest fixture: one unauthenticated httpx request against the backend so
the sitecustomize shim must record a non-2xx composio line."""

import os

import httpx

base = os.environ.get("COMPOSIO_BASE_URL", "https://staging-backend.composio.dev")
with httpx.Client() as client:
    response = client.get(f"{base}/api/v3/toolkits", headers={"x-api-key": "selftest-invalid-key"})
print(f"trace-check: status {response.status_code}")
