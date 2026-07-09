/**
 * Deterministic smoke test for the Mastra example.
 *
 * Exercises the provider tool-wrapping and Tool Router session paths against a
 * live backend (staging in CI) using the unauthenticated HACKERNEWS toolkit.
 * This is the regression net for the schema-conversion bugs that historically
 * broke silently:
 *   - ComposioHQ/composio#2109  (Mastra zod->json serialization crash)
 *   - ComposioHQ/composio#3307  ($defs dropped while $ref kept)
 *   - mastra-ai/mastra#13909    (already-JSON-Schema tools crash serialization)
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

// Collect every `$ref` string anywhere in a JSON Schema.
function collectRefs(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, out);
    return;
  }
  if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') out.push(value);
      else collectRefs(value, out);
    }
  }
}

// Resolve a local JSON Pointer ($ref like "#/$defs/Foo") against the schema root.
// External refs (URLs, or a bare "#") are treated as resolvable and left to the runtime.
function refResolves(ref: string, root: unknown): boolean {
  if (ref === '#' || !ref.startsWith('#/')) return true;
  const segments = ref
    .slice(2)
    .split('/')
    .map(seg => seg.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current: unknown = root;
  for (const seg of segments) {
    if (current === null || typeof current !== 'object' || !(seg in current)) return false;
    current = (current as Record<string, unknown>)[seg];
  }
  return true;
}

// The regression net for #3307: a dropped `$defs` leaves a dangling `$ref` that
// JSON.stringify serializes without error, so serialization alone can't catch it.
// Assert every local `$ref` in the wrapped schema resolves to a present node.
function assertSchemaRefsResolve(slug: string, schema: unknown): void {
  const refs: string[] = [];
  collectRefs(schema, refs);
  for (const ref of refs) {
    assert(
      refResolves(ref, schema),
      `mastra tool ${slug}: unresolved $ref "${ref}" — dropped $defs? (ComposioHQ/composio#3307)`
    );
  }
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
  const schema = (tool as { inputSchema?: unknown }).inputSchema;
  assert(schema != null, `mastra tool ${slug} has no inputSchema after wrapping`);
  // Serializing the wrapped schema must not throw (guards the crash-on-serialize path).
  JSON.stringify(schema);
  // Every local $ref must resolve — catches #3307 (dropped $defs, dangling $ref).
  assertSchemaRefsResolve(slug, schema);
}
console.log(`  ✓ direct wrapping: ${wrappedSlugs.length} tools`);

// 2. Tool Router: the v1-canonical session path must return router tools. This is
// the exact wrapTool/$defs path behind #3307, so assert its schemas resolve too.
const session = await composio.sessions.create(USER_ID, { toolkits: [TOOLKIT] });
const sessionTools = await session.tools();
const sessionSlugs = Object.keys(sessionTools);
assert(sessionSlugs.length > 0, 'mastra session.tools() returned 0 tools');
for (const [slug, tool] of Object.entries(sessionTools)) {
  const schema = (tool as { inputSchema?: unknown }).inputSchema;
  if (schema == null) continue; // router meta-tools may omit an input schema
  JSON.stringify(schema);
  assertSchemaRefsResolve(slug, schema);
}
console.log(`  ✓ tool-router session: ${sessionSlugs.length} tools`);

console.log('\n✅ Mastra smoke passed.');
