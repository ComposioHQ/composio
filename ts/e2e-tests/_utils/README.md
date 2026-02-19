# E2E Test Utilities

Shared infrastructure for running `@composio/core` and CLI end-to-end tests in isolated Docker environments.

## What's Here

| File/Directory    | Purpose                                                |
| ----------------- | ------------------------------------------------------ |
| `src/`            | TypeScript utilities (e2e runner, config, types)       |
| `scripts/`        | Docker build and cleanup scripts                       |
| `Dockerfile.node` | Multi-stage Dockerfile for Node.js test environments   |
| `Dockerfile.deno` | Dockerfile for Deno test environments                  |
| `Dockerfile.cli`  | Scratch Dockerfile for CLI test environments           |

## API

### `e2e`

The main entry point for e2e tests. Automatically infers the working directory and suite name from the caller's location. Uses `bun:test` for the test framework.

```typescript
import { e2e, type E2ETestResult } from '@e2e-tests/utils';
import { TIMEOUTS } from '@e2e-tests/utils/const';
import { describe, it, expect, beforeAll } from 'bun:test';

e2e(import.meta.url, {
  versions: {
    node: ['20.18.0', '20.19.0', '22.12.0'], // optional, defaults to .nvmrc
    deno: ['2.6.7'],                          // optional, defaults to .dvmrc
    cli: ['current'],                         // optional, defaults to CLI package.json version
  },
  env: { MY_VAR: 'value' },                   // optional env vars
  defineTests: ({ runtime, runCmd, runFixture }) => {
    let result: E2ETestResult;

    beforeAll(async () => {
      result = await runFixture({ filename: 'fixtures/test.mjs' });
    }, TIMEOUTS.FIXTURE);

    describe('output', () => {
      it('exits successfully', () => {
        expect(result.exitCode).toBe(0);
      });
    });
  },
});
```

### `E2EConfig`

Configuration object passed to `e2e()`:

| Property       | Type                                  | Description                                                      |
| -------------- | ------------------------------------- | ---------------------------------------------------------------- |
| `versions`     | `RuntimeVersions`                     | Runtime versions to test. See RuntimeVersions below              |
| `env`          | `Record<string, string \| undefined>` | Environment variables for Docker. Validated at startup           |
| `usesFixtures` | `boolean`                             | When true, sets cwd to `{testDir}/fixtures`. Default: `false`    |
| `defineTests`  | `(ctx: DefineTestsContext) => void`   | Callback to define tests using bun:test primitives               |

### `RuntimeVersions`

| Property | Type                             | Description                                      |
| -------- | -------------------------------- | ------------------------------------------------ |
| `node`   | `readonly NodeVersionFromUser[]` | Node.js versions. Defaults to `.nvmrc`           |
| `deno`   | `readonly DenoVersionFromUser[]` | Deno versions. Defaults to `.dvmrc`              |
| `cli`    | `readonly CliVersionFromUser[]`  | CLI versions. Defaults to CLI package.json       |

### `DefineTestsContext`

The context passed to the `defineTests` callback:

| Property     | Type/Signature                                                   | Description                                    |
| ------------ | ---------------------------------------------------------------- | ---------------------------------------------- |
| `runtime`    | `'node' \| 'deno' \| 'cli'`                                      | Current runtime being tested                   |
| `runCmd`     | `(command: string) => Promise<E2ETestResult>`                    | Run arbitrary command in Docker container      |
| `runFixture` | `(options: RunFixtureOptions) => Promise<E2ETestResult \| E2ETestResultWithSetup>` | Run fixture with optional setup phase |

### `RunFixtureOptions`

Options for `runFixture()`:

| Property   | Type     | Description                                                           |
| ---------- | -------- | --------------------------------------------------------------------- |
| `filename` | `string` | Fixture file path relative to cwd (e.g., `'index.mjs'`)               |
| `setup`    | `string` | Optional setup command (e.g., `'npm install'`). Enables volume mode   |

**Behavior:**

- **Without `setup`**: Runs `node <filename>` directly. Returns `E2ETestResult`.
- **With `setup`**: Creates a Docker volume, runs setup with volume mounted read-write, then runs fixture with volume mounted read-only. Returns `E2ETestResultWithSetup`.

```typescript
// Simple fixture (no dependencies to install)
const result = await runFixture({ filename: 'test.mjs' });

// Fixture with setup phase (uses Docker volumes)
const result = await runFixture({
  filename: 'index.mjs',
  setup: 'npm install --legacy-peer-deps',
});
expect(result.setup.exitCode).toBe(0);  // Check setup phase
expect(result.exitCode).toBe(0);        // Check fixture phase
```

### `E2ETestResult`

Result returned by `runCmd` and `runFixture`:

```typescript
interface E2ETestResult {
  exitCode: number;  // Exit code from the command (0 = success)
  stdout: string;    // Captured stdout
  stderr: string;    // Captured stderr
}
```

### `runCmd` with File Capture

When you need to assert on files created inside the container, pass a `files` array:

```typescript
const result = await runCmd({
  command: 'composio version > out.txt',
  files: ['out.txt'],
});

expect(result.files['out.txt']).toBe('0.1.24');
```

The files are copied out of the container after execution and returned as a map in the result.

### `E2ETestResultWithSetup`

Extended result when `runFixture` is called with a `setup` option:

```typescript
interface E2ETestResultWithSetup extends E2ETestResult {
  setup: {
    exitCode: number;
    stdout: string;
    stderr: string;
  };
}
```

Top-level fields (`exitCode`, `stdout`, `stderr`) reflect the fixture result. The `setup` object contains the setup command result.

### `sanitizeOutput`

Utility for stable test comparisons. Removes ANSI escape codes, normalizes line endings, and trims whitespace.

```typescript
import { sanitizeOutput } from '@e2e-tests/utils';

const clean = sanitizeOutput(result.stdout);
```

### `TIMEOUTS`

Predefined timeout constants for tests (in milliseconds):

```typescript
import { TIMEOUTS } from '@e2e-tests/utils/const';

it('calls LLM', async () => {
  // test code
}, { timeout: TIMEOUTS.LLM_SHORT });
```

| Constant    | Value     | Use Case                                   |
| ----------- | --------- | ------------------------------------------ |
| `DEFAULT`   | `5_000`   | Standard test operations                   |
| `FIXTURE`   | `120_000` | `beforeAll` hooks that call `runFixture()` |
| `LLM_SHORT` | `30_000`  | Quick LLM calls                            |
| `LLM_LONG`  | `60_000`  | Complex LLM operations                     |

## Version Resolution

### Node.js Version Resolution

Node.js versions to test are resolved in this order:

1. **`COMPOSIO_E2E_NODE_VERSION` env var** (highest priority): Use `[env_value]`
2. **`config.versions.node`**: Use the provided array
3. **Default**: Use version from `.nvmrc` file

### Well-Known Node Versions

The following versions are pre-defined in `const.ts`:

- `20.18.0`
- `20.19.0`
- `22.12.0`
- `current` (resolves to `.nvmrc` version)

### Deno Version Resolution

Deno versions to test are resolved in this order:

1. **`COMPOSIO_E2E_DENO_VERSION` env var** (highest priority): Use `[env_value]`
2. **`config.versions.deno`**: Use the provided array
3. **Default**: Use version from `.dvmrc` file

### Well-Known Deno Versions

The following versions are pre-defined in `const.ts`:

- `2.6.7`
- `current` (resolves to `.dvmrc` version)

### CLI Version Resolution

CLI versions to test are resolved in this order:

1. **`COMPOSIO_E2E_CLI_VERSION` env var** (highest priority): Use `[env_value]`
2. **`config.versions.cli`**: Use the provided array
3. **Default**: Use version from `ts/packages/cli/package.json`

### Well-Known CLI Versions

- `current` (resolves to CLI package.json version)

## Environment Variable Validation

Environment variables passed to `E2EConfig.env` are validated at test startup. If any variable has an `undefined` value, the test fails fast with a clear error message:

```
[my-test] Missing required environment variables: COMPOSIO_API_KEY, OPENAI_API_KEY
Set these variables before running the tests, or remove them from E2EConfig.env if not required.
```

This prevents silent failures from missing credentials.

## The `usesFixtures` Option

When `usesFixtures: true` is set:

- Working directory changes to `{testDir}/fixtures/`
- Docker volume mounts at `fixtures/node_modules`
- Fixture paths in `runFixture({ filename })` are relative to `fixtures/`

Use this for tests that have their own `package.json` and need to run `npm install`:

```typescript
import { TIMEOUTS } from '@e2e-tests/utils/const';

e2e(import.meta.url, {
  usesFixtures: true,
  defineTests: ({ runFixture }) => {
    beforeAll(async () => {
      // Both commands run in fixtures/ directory
      result = await runFixture({
        filename: 'index.mjs',           // Resolves to fixtures/index.mjs
        setup: 'npm install',             // Runs in fixtures/
      });
    }, TIMEOUTS.FIXTURE);
  },
});
```

## Scripts

```bash
# Pre-build Docker images for all well-known Node, Deno, and CLI versions
pnpm docker:build

# Remove all e2e Docker images (Node.js, Deno, and CLI)
pnpm docker:clean
```

## DEBUG.log Output

Each test suite generates a `DEBUG.log` file with structured output grouped by runtime version:

```
================================================================================
E2E Test: openai-zod4-compat
Started: 2026-01-30T12:18:42.000Z
Test file: ts/e2e-tests/runtimes/node/openai-zod4-compat/e2e.test.ts
Node versions: 20.19.0, 22.12.0
================================================================================

################################################################################
### Node.js 20.19.0
################################################################################
Image: composio-e2e-node:20.19.0

--- Phase 1/2: setup ---
Container: e2e-openai-zod4-compat-20-19-0-1769775520382-setup
Command: npm install --legacy-peer-deps
Duration: 2.55s
Exit Code: 0 (success)

[stdout]
added 3 packages, and audited 5 packages in 2s

[stderr]
(empty)

--- Phase 2/2: fixture ---
Container: e2e-openai-zod4-compat-20-19-0-1769775520382-fixture
Command: node index.mjs
Duration: 0.56s
Exit Code: 0 (success)

[stdout]
zod@4 works
openai@5 works
All packages work together!

[stderr]
(empty)

################################################################################
### Node.js 22.12.0 (SKIPPED)
################################################################################
Reason: Not selected via COMPOSIO_E2E_NODE_VERSION

================================================================================
Summary
================================================================================
Node.js 20.19.0: PASS (2 phases, 3.11s total)
Node.js 22.12.0: SKIPPED

Finished: 2026-01-30T12:18:46.500Z
Total duration: 4.50s
================================================================================
```

**Features:**

- File cleared at start of each test run (no stale data)
- Phases grouped by Node version for easy scanning
- Visual hierarchy: `===` for file boundaries, `###` for versions, `---` for phases
- Empty stdout/stderr shown as `(empty)`
- Summary with pass/fail/skip status and timing

## Behavior

- Builds an isolated Docker container and runs the test command inside it
- Docker is required
- Tests run sequentially per Node version
- Volume cleanup is best-effort (doesn't fail tests on cleanup errors)
