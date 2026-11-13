# CLI `composio whoami` Test

Verifies that `composio whoami` prints the account of the user API key as JSON, respects stdout piping, and fails with how to recover when the backend rejects the key.

## Why This Exists

The CLI separates decoration (stderr) from data (stdout), and a rejected key must fail rather than print an empty account. This suite runs the CLI against a mock Composio API (`ts/packages/cli/scripts/mock-whoami-server.ts`), so it needs no secret and no live backend.

The mock answers `GET /api/v3.1/auth/session/info` and `GET /api/v3.1/org/consumer/config` for one accepted key, and answers every request with any other key with the backend's 401 for a revoked user API key (`UserApiKey_Unauthorized`).

## What It Tests

| Test           | Description                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Accepted key   | `composio whoami` exits 0, stdout is the account JSON with the mock's email and org, stderr is empty                          |
| File redirect  | `composio whoami > out.txt` leaves stdout and stderr empty, and `out.txt` holds the account JSON                              |
| Rejected key   | `composio whoami` exits 1, stdout is empty, stderr names the rejection and says to replace the key in `COMPOSIO_USER_API_KEY` |
| Mock API usage | The CLI read the session info with each key                                                                                   |

## Requirements

None. Each command sets `COMPOSIO_BASE_URL`, `COMPOSIO_USER_API_KEY` and `COMPOSIO_CACHE_DIR` itself.

## Isolation Tool

**Docker** with the CLI built from the current monorepo source. The container reaches the mock on the host through `host.docker.internal`.

## Running

```bash
pnpm test:e2e:cli
```
