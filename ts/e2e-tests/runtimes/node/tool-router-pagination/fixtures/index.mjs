/**
 * E2E fixture: session.toolkits() cursor pagination.
 *
 * Reproduces PLEN-1886: if the SDK silently drops the `cursor` input,
 * page 2 will equal page 1 and the overlap assertion throws.
 *
 * Uses the global toolkit catalog (no `toolkits` filter on session create),
 * so this works against any Composio project.
 *
 * Requires COMPOSIO_API_KEY in environment.
 */
import { Composio } from '@composio/core';

const apiKey = process.env.COMPOSIO_API_KEY;
if (!apiKey) {
  console.error('COMPOSIO_API_KEY is required');
  process.exit(1);
}

const composio = new Composio({ apiKey });

async function main() {
  const userId = `e2e-tool-router-pagination-${Date.now()}`;
  const session = await composio.create(userId);

  const page1 = await session.toolkits({ limit: 2 });
  if (page1.items.length !== 2) {
    throw new Error(`expected 2 items on page 1, got ${page1.items.length}`);
  }
  if (!page1.cursor) {
    throw new Error('expected page 1 to return a cursor — catalog should have > 2 toolkits');
  }
  console.log('PAGE1_OK');

  const page2 = await session.toolkits({ limit: 2, cursor: page1.cursor });
  if (page2.items.length === 0) {
    throw new Error('expected page 2 to return items');
  }
  console.log('PAGE2_OK');

  const page1Slugs = new Set(page1.items.map(t => t.slug));
  const overlap = page2.items.filter(t => page1Slugs.has(t.slug)).map(t => t.slug);
  if (overlap.length > 0) {
    throw new Error(`pagination did not advance — page 2 overlaps page 1 on: ${overlap.join(', ')}`);
  }
  console.log('ADVANCED_OK');

  console.log('ALL_OK');
}

main().catch(err => {
  console.log('ERROR:', err?.message || err);
  process.exit(1);
});
