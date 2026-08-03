# OpenAI v7 + Zod v4 Compatibility Test

Verifies that packed `@composio/core` and `@composio/openai` packages install,
typecheck, and run with explicit OpenAI 7 and Zod 4 versions.

The consumer typecheck covers exported Chat Completions and Responses types
without `skipLibCheck`. Runtime assertions construct clients with fake keys,
wrap tools through both providers, and make no network requests.

The Docker matrix covers Node.js 22.22.3, 24.17.0, and 25.9.0.

Run it from the repository root:

```bash
pnpm --filter @e2e-tests/node-openai-v7-zod4-compat test:e2e:node
```
