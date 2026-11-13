# CLI E2E Tests

End-to-end tests for the compiled `composio` CLI binary.

## How It Works

Each test suite runs the `composio` binary inside a scratch Debian Docker container built from `Dockerfile.cli`. The binary is compiled via `bun build --compile` during the Docker image build, producing a self-contained executable with no runtime dependencies.

Tests use `runCmd` to execute shell commands in the container and assert on exit code, stdout, and stderr. When stdout is piped (e.g., `composio version > out.txt`), the CLI suppresses all decoration and writes only machine-readable data — these tests verify that contract.

## Test Suites

| Suite                               | Description                                                                                              | Env Vars                |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------- |
| [upgrade](./upgrade/)               | `composio upgrade` replaces a running Linux executable                                                   | None                    |
| [operations](./operations/)         | Login, session, search, execute, link, run, upgrade and their `dev` counterparts under a fault catalogue | None                    |
| [agent-journeys](./agent-journeys/) | Tasks driven by a model replayed through aimock, with the `composio-cli` skill as its guidance           | None                    |
| [fake-backend](./fake-backend/)     | Test support: the fake Composio deployment the two suites above talk to, and its contract check          | None                    |
| [version](./version/)               | `composio version` output and exit code                                                                  | None                    |
| [whoami](./whoami/)                 | `composio whoami` prints the API key                                                                     | `COMPOSIO_USER_API_KEY` |

## Journeys

`runCmd` starts a fresh container for every command. A test that needs several commands to share state (log in, link, then execute) holds one container instead:

```typescript
import { startJourneyContainer } from '@e2e-tests/utils';

const journey = await startJourneyContainer({ env: { COMPOSIO_BASE_URL: fake.docker.http } });
await journey.exec('composio login --user-api-key …');
const result = await journey.exec('composio whoami');
await journey.stop();
```

A journey container mounts nothing from the host and passes through no API key. The `operations` and `agent-journeys` suites use it through `startCliRig` from `@e2e-tests/cli-fake-backend/rig`, which also starts the fake backend and points every host the CLI knows at it. Other outbound traffic is not blocked.

Those two suites and `fake-backend` need no secret. CI runs them in their own step with the API keys blanked, on every pull request, fork and Dependabot ones included; the suites that talk to staging run in a second step that is skipped when the keys are missing.

## Isolation Tool

**Docker** with the CLI version resolved from the current monorepo build (`cli: ['current']`).

## Running

```bash
# All CLI e2e tests
pnpm test:e2e:cli

# A specific suite
cd ts/e2e-tests/cli/version && pnpm test:e2e:cli
cd ts/e2e-tests/cli/whoami && pnpm test:e2e:cli
cd ts/e2e-tests/cli/upgrade && pnpm test:e2e:cli
```
