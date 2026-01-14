# E2E Tests

End-to-end tests for `@composio/core` across different JavaScript runtimes.

## Directory Structure

```
ts/e2e-tests/
├── _utils/                           # Shared test infrastructure
│   ├── Dockerfile.node               # Docker image for Node.js tests
│   └── run-docker-test.sh            # Generic Docker test runner
└── runtimes/
    ├── node/                         # Node.js runtime tests
    │   ├── cjs-basic/                # CommonJS compatibility tests
    │   └── esm-basic/                # ESM compatibility tests
    └── cloudflare/                   # Cloudflare runtime tests
        └── cf-workers-basic/         # Cloudflare Workers tests
```

## Running Tests

### All E2E Tests

```bash
pnpm test:e2e
```

### Node.js Tests Only

```bash
pnpm test:e2e:node
```

Runs Node.js tests in Docker with the default Node.js version (20.19.0).

To run with a specific Node.js version:

```bash
COMPOSIO_E2E_NODE_VERSION=22.12.0 pnpm test:e2e:node
```

### Cloudflare Workers Tests Only

```bash
pnpm test:e2e:cloudflare
```

## Adding New Tests

### Node.js Runtime Tests

1. Create a new directory under `runtimes/node/` (e.g., `runtimes/node/my-test`)
2. Add a `package.json` with name `@test-e2e/node-my-test`
3. Add `test:e2e` and `test:e2e:node` scripts
4. Create a `run-docker-test.sh` that uses the shared `_utils/run-docker-test.sh`

### Cloudflare Runtime Tests

1. Create a new directory under `runtimes/cloudflare/` (e.g., `runtimes/cloudflare/my-test`)
2. Add a `package.json` with name `@test-e2e/cf-my-test`
3. Add `test:e2e` and `test:e2e:cloudflare` scripts
4. Configure vitest with `@cloudflare/vitest-pool-workers`
