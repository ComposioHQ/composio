# CLI E2E Tests

End-to-end tests for the compiled `composio` CLI binary.

## How It Works

Each test suite runs the `composio` binary inside a scratch Debian Docker container built from `Dockerfile.cli`. The binary is compiled via `bun build --compile` during the Docker image build, producing a self-contained executable with no runtime dependencies.

Tests use `runCmd` to execute shell commands in the container and assert on exit code, stdout, and stderr. When stdout is piped (e.g., `composio version > out.txt`), the CLI suppresses all decoration and writes only machine-readable data — these tests verify that contract.

## Test Suites

| Suite | Description | Env Vars |
| --- | --- | --- |
| [version](./version/) | `composio version` output and exit code | None |
| [whoami](./whoami/) | `composio whoami` prints the API key | `COMPOSIO_USER_API_KEY` |

## Isolation Tool

**Docker** with the CLI version resolved from the current monorepo build (`cli: ['current']`).

## Running

```bash
# All CLI e2e tests
pnpm test:e2e:cli

# A specific suite
cd ts/e2e-tests/cli/version && pnpm test:e2e:cli
cd ts/e2e-tests/cli/whoami && pnpm test:e2e:cli
```
