import { describe, expect, it, vi } from '@effect/vitest';
import { Effect } from 'effect';
import { TestLive } from 'test/__utils__';

describe('TestLayer', () => {
  it.effect('restores globalThis.fetch after the layer scope closes', () =>
    Effect.gen(function* () {
      const originalFetch = globalThis.fetch;

      yield* Effect.provide(Effect.void, TestLive()).pipe(Effect.scoped);

      expect(globalThis.fetch).toBe(originalFetch);
    })
  );

  it.effect('does not leak the fetch mock into later spy restore cycles', () =>
    Effect.gen(function* () {
      const originalFetch = globalThis.fetch;

      yield* Effect.provide(Effect.void, TestLive()).pipe(Effect.scoped);

      vi.spyOn(globalThis, 'fetch');
      vi.restoreAllMocks();

      expect(globalThis.fetch).toBe(originalFetch);
    })
  );
});
