import { describe, expect, it, vi } from 'vitest';
import { Effect } from 'effect';
import { TestLive } from 'test/__utils__';

describe('TestLayer', () => {
  it('restores globalThis.fetch after the layer scope closes', async () => {
    const originalFetch = globalThis.fetch;

    await Effect.provide(Effect.void, TestLive()).pipe(Effect.scoped, Effect.runPromise);

    expect(globalThis.fetch).toBe(originalFetch);
  });

  it('does not leak the fetch mock into later spy restore cycles', async () => {
    const originalFetch = globalThis.fetch;

    await Effect.provide(Effect.void, TestLive()).pipe(Effect.scoped, Effect.runPromise);

    vi.spyOn(globalThis, 'fetch');
    vi.restoreAllMocks();

    expect(globalThis.fetch).toBe(originalFetch);
  });
});
