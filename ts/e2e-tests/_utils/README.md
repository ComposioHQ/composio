# E2E Test Utilities

Shared infrastructure for running `@composio/core` end-to-end tests in isolated Docker environments.

## What's Here

| File/Directory    | Purpose                                              |
| ----------------- | ---------------------------------------------------- |
| `src/`            | TypeScript utilities (e2e runner, config, types)     |
| `scripts/`        | Docker build and cleanup scripts                     |
| `Dockerfile.node` | Multi-stage Dockerfile for Node.js test environments |

## API

### `e2e`

The main entry point for e2e tests. Automatically infers the working directory and suite name from the caller's location. Uses `bun:test` for the test framework.

```typescript
import { e2e, type E2ETestResult } from '@e2e-tests/utils';
import { describe, it, expect, beforeAll } from 'bun:test';

e2e(import.meta.url, {
  nodeVersions: ['20.18.0', '20.19.0', '22.12.0'], // optional
  env: { MY_VAR: 'value' },                         // optional env vars
  defineTests: ({ runCmd, runFixture }) => {
    let result: E2ETestResult;

    beforeAll(async () => {
      result = await runFixture('fixtures/test.mjs');
    });

    describe('output', () => {
      it('exits successfully', () => {
        expect(result.exitCode).toBe(0);
      });
    });
  },
});
```

### `DefineTestsContext`

The context passed to the `defineTests` callback:

| Function                         | Description                                                 |
| -------------------------------- | ----------------------------------------------------------- |
| `runCmd(command: string)`        | Run arbitrary command in Docker container                   |
| `runFixture(fixturePath: string)` | Run a fixture file with Node.js (equivalent to `runCmd(\`node ${path}\`)`) |

### `E2ETestResult`

Result returned by `runCmd` and `runFixture`:

```typescript
interface E2ETestResult {
  exitCode: number;  // Exit code from the command (0 = success)
  stdout: string;    // Captured stdout
  stderr: string;    // Captured stderr
}
```

### `sanitizeOutput`

Utility for stable test comparisons. Removes ANSI escape codes, normalizes line endings, and trims whitespace.

```typescript
import { sanitizeOutput } from '@e2e-tests/utils';

const clean = sanitizeOutput(result.stdout);
```

## Node Version Resolution

Node.js versions to test are resolved in this order:

1. **`COMPOSIO_E2E_NODE_VERSION` env var** (highest priority): Use `[env_value]`
2. **`config.nodeVersions`**: Use the provided array
3. **Default**: Use `[process.versions.node]` (current runtime)

### Well-Known Node Versions

The following versions are pre-defined in `const.ts`:

- `20.18.0`
- `20.19.0`
- `22.12.0`
- `current` (resolves to current Node runtime version)

## Scripts

```bash
# Pre-build Docker images for all well-known Node versions
pnpm docker:build

# Remove all e2e Docker images
pnpm docker:clean
```

## Behavior

Builds an isolated Docker container and runs the test command inside it. Docker is required.
