/**
 * Deterministic smoke test for the Mastra example.
 *
 * A live integration signal: it exercises the provider tool-wrapping and Tool
 * Router session paths end-to-end against a real backend (staging in CI) using
 * the unauthenticated HACKERNEWS toolkit, proving the wrapping does not throw
 * and returns usable tools.
 *
 * It intentionally does NOT re-check schema shape. The schema-conversion
 * invariants behind the historical regressions —
 *   - ComposioHQ/composio#2109  (Mastra zod->json serialization crash)
 *   - ComposioHQ/composio#3307  (dangling $ref when $defs is dropped)
 *   - mastra-ai/mastra#13909    (already-JSON-Schema tools crash serialization)
 * are owned and regression-tested deterministically in the provider itself
 * (ts/packages/providers/mastra/test/{mastra-dangling-defs,mastra-ref}.test.ts),
 * which run per-PR and blocking with no secrets. Duplicating that here against a
 * live toolkit that never emits the pathological schema would only add flake.
 *
 * It needs only COMPOSIO_API_KEY (no LLM key) so it is cheap and non-flaky.
 * When COMPOSIO_API_KEY is absent (e.g. fork PRs) it skips cleanly.
 *
 * Run: bun ts/examples/mastra/src/smoke.ts
 */
import { Composio } from '@composio/core';
import { MastraProvider } from '@composio/mastra';
import 'dotenv/config';

const TOOLKIT = 'hackernews';
const USER_ID = 'examples-smoke';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`SMOKE FAIL: ${message}`);
}

if (!process.env.COMPOSIO_API_KEY) {
  console.log('⏭️  COMPOSIO_API_KEY not set — skipping Mastra smoke.');
  process.exit(0);
}

console.log(`Backend: ${process.env.COMPOSIO_BASE_URL ?? '(default/production)'}`);

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new MastraProvider(),
});

// 1. Direct tools: provider wrapping must not throw and must produce tools.
const wrapped = await composio.tools.get(USER_ID, { toolkits: [TOOLKIT] });
const wrappedSlugs = Object.keys(wrapped);
assert(wrappedSlugs.length > 0, `mastra direct wrapping returned 0 tools for ${TOOLKIT}`);
for (const [slug, tool] of Object.entries(wrapped)) {
  assert(
    (tool as { inputSchema?: unknown }).inputSchema != null,
    `mastra tool ${slug} has no inputSchema after wrapping`
  );
  // Serializing the wrapped schema must not throw (guards the crash-on-serialize path).
  JSON.stringify((tool as { inputSchema?: unknown }).inputSchema);
}
console.log(`  ✓ direct wrapping: ${wrappedSlugs.length} tools`);

// 2. Tool Router: the v1-canonical session path must return router tools.
const session = await composio.sessions.create(USER_ID, { toolkits: [TOOLKIT] });
const sessionTools = await session.tools();
const sessionSlugs = Object.keys(sessionTools);
assert(sessionSlugs.length > 0, 'mastra session.tools() returned 0 tools');
console.log(`  ✓ tool-router session: ${sessionSlugs.length} tools`);

console.log('\n✅ Mastra smoke passed.');
