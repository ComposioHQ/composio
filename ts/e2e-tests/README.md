# E2E Tests

End-to-end tests for `@composio/core` across different JavaScript runtimes.

## Directory Structure

```
ts/e2e-tests/
├── _utils/                                  # Shared test infrastructure
│   ├── Dockerfile.node                      # Docker image for Node.js tests
│   ├── Dockerfile.deno                      # Docker image for Deno tests
│   ├── scripts/                             # Docker build and cleanup scripts
│   │   ├── docker-build.ts                  # Pre-build images for all Node/Deno versions
│   │   └── docker-clean.ts                  # Remove all e2e Docker images
│   ├── src/                                 # TypeScript runner utilities
│   │   ├── config.ts                        # Configuration utilities
│   │   ├── const.ts                         # Well-known Node.js/Deno versions and timeouts
│   │   ├── e2e.ts                           # Main e2e test entry point
│   │   ├── image-lifecycle.ts               # Docker image build/run utilities
│   │   ├── index.ts                         # Public exports
│   │   ├── runner.ts                        # Docker test runner
│   │   ├── sanitize.ts                      # Output sanitization utilities
│   │   ├── types.ts                         # TypeScript type definitions
│   │   └── volume.ts                        # Docker volume management
│   └── README.md                            # Utils documentation
└── runtimes/
    ├── node/                                # Node.js runtime tests
    │   ├── cjs-basic/                       # CommonJS compatibility tests
    │   ├── esm-basic/                       # ESM compatibility tests
    │   ├── json-schema-to-zod-v3/           # @composio/json-schema-to-zod + Zod v3 tests
    │   ├── json-schema-to-zod-v4/           # @composio/json-schema-to-zod + Zod v4 tests
    │   ├── mastra-tool-router-zod-v3/       # @composio/mastra Tool Router + Zod v3 tests
    │   ├── mastra-tool-router-zod-v4/       # @composio/mastra Tool Router + Zod v4 tests
    │   ├── openai-zod4-compat/              # OpenAI + Zod v4 compatibility tests
    │   └── typescript-mjs-import-nodenext/  # TypeScript moduleResolution: nodenext tests
    ├── deno/                                # Deno runtime tests
    │   └── esm-basic/                       # ESM compatibility tests via npm: specifier
    └── cloudflare/                          # Cloudflare runtime tests
        ├── cf-workers-basic/                # Basic Cloudflare Workers tests
        ├── cf-workers-files/                # Cloudflare Workers file handling tests
        └── cf-workers-tool-router-ai/       # Cloudflare Workers AI SDK tool router tests
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

Runs Node.js tests in Docker using `bun test`. The default Node.js version is determined by `.nvmrc`.

To run with a specific Node.js version:

```bash
COMPOSIO_E2E_NODE_VERSION=22.12.0 pnpm test:e2e:node
```

### Deno Tests Only

```bash
pnpm test:e2e:deno
```

Runs Deno tests in Docker using `bun test`. The default Deno version is determined by `.dvmrc`.

To run with a specific Deno version:

```bash
COMPOSIO_E2E_DENO_VERSION=2.6.7 pnpm test:e2e:deno
```

### Cloudflare Workers Tests Only

```bash
pnpm test:e2e:cloudflare
```

## Adding New Tests

### Node.js Runtime Tests

1. Create a new directory under `runtimes/node/` (e.g., `runtimes/node/my-test`)
2. Add a `package.json` with name `@e2e-tests/node-my-test`
3. Add `test:e2e` and `test:e2e:node` scripts
4. Create an `e2e.test.ts` file with inline configuration:

```typescript
import { e2e, type E2ETestResult } from '@e2e-tests/utils';
import { describe, it, expect, beforeAll } from 'bun:test';

e2e(import.meta.url, {
  versions: {
    node: ['20.18.0', '22.12.0'],  // Optional: defaults to .nvmrc version
  },
  env: { MY_VAR: process.env.MY_VAR },   // Optional: env vars (validated at startup)
  defineTests: ({ runtime, runFixture }) => {
    let result: E2ETestResult;

    beforeAll(async () => {
      result = await runFixture({ filename: 'fixtures/test.mjs' });
    });

    describe('output', () => {
      it('exits successfully', () => {
        expect(result.exitCode).toBe(0);
      });

      it('contains expected output', () => {
        expect(result.stdout).toContain('expected text');
      });
    });
  },
});
```

5. Add fixture files in a `fixtures/` directory

### Deno Runtime Tests

1. Create a new directory under `runtimes/deno/` (e.g., `runtimes/deno/my-test`)
2. Add a `package.json` with name `@e2e-tests/deno-my-test`
3. Add `test:e2e` and `test:e2e:deno` scripts
4. Create an `e2e.test.ts` file with inline configuration:

```typescript
import { e2e, type E2ETestResult } from '@e2e-tests/utils';
import { describe, it, expect, beforeAll } from 'bun:test';

e2e(import.meta.url, {
  versions: {
    deno: ['2.6.7'],  // Optional: defaults to .dvmrc version
  },
  usesFixtures: true,
  defineTests: ({ runtime, runFixture }) => {
    let result: E2ETestResult;

    beforeAll(async () => {
      result = await runFixture({ filename: 'test.ts' });
    });

    describe('output', () => {
      it('exits successfully', () => {
        expect(result.exitCode).toBe(0);
      });

      it('contains expected output', () => {
        expect(result.stdout).toContain('expected text');
      });
    });
  },
});
```

5. Add fixture files in a `fixtures/` directory. Fixtures use Deno's `npm:` specifier to import packages.

### Tests with External Dependencies (npm install)

For tests that need to install npm packages at runtime, use `usesFixtures: true` and the `setup` option:

```typescript
import { e2e, type E2ETestResultWithSetup } from '@e2e-tests/utils';
import { describe, it, expect, beforeAll } from 'bun:test';

e2e(import.meta.url, {
  nodeVersions: ['20.19.0', '22.12.0'],
  usesFixtures: true,  // Sets cwd to fixtures/ directory
  env: { MY_API_KEY: process.env.MY_API_KEY },
  defineTests: ({ runFixture }) => {
    let result: E2ETestResultWithSetup;

    beforeAll(async () => {
      result = await runFixture({
        filename: 'index.mjs',
        setup: 'npm install --legacy-peer-deps',  // Runs before fixture
      });
    });

    describe('setup', () => {
      it('npm install completes successfully', () => {
        expect(result.setup.exitCode).toBe(0);
      });
    });

    describe('fixture', () => {
      it('exits successfully', () => {
        expect(result.exitCode).toBe(0);
      });
    });
  },
});
```

### Cloudflare Runtime Tests

1. Create a new directory under `runtimes/cloudflare/` (e.g., `runtimes/cloudflare/my-test`)
2. Add a `package.json` with name `@e2e-tests/cf-my-test`
3. Add `test:e2e` and `test:e2e:cloudflare` scripts
4. Configure vitest with `@cloudflare/vitest-pool-workers`

## Debugging

Each test suite generates an ephemereal `DEBUG.log` file in its directory with structured output:

```
================================================================================
E2E Test: my-test
Started: 2026-01-30T12:18:42.000Z
Test file: ts/e2e-tests/runtimes/node/my-test/e2e.test.ts
Node versions: 20.19.0, 22.12.0
================================================================================

################################################################################
### Node.js 20.19.0
################################################################################
Image: composio-e2e-node:20.19.0

--- Phase 1/2: setup ---
Container: e2e-my-test-20-19-0-1769775520382-setup
Command: npm install
Duration: 2.55s
Exit Code: 0 (success)

[stdout]
added 3 packages in 2s

[stderr]
(empty)

--- Phase 2/2: fixture ---
Container: e2e-my-test-20-19-0-1769775520382-fixture
Command: node index.mjs
Duration: 0.56s
Exit Code: 0 (success)

[stdout]
Test passed!

[stderr]
(empty)

================================================================================
Summary
================================================================================
Node.js 20.19.0: PASS (2 phases, 3.11s total)
Node.js 22.12.0: SKIPPED

Finished: 2026-01-30T12:18:46.500Z
Total duration: 4.50s
================================================================================
```
