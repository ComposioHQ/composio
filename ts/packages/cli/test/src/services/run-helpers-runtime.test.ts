import { Predicate } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installRunHelpers } from 'src/services/run-helpers-runtime';

const installedGlobalNames = [
  'z',
  'zod',
  'search',
  'execute',
  'experimental_subAgent',
  'invokeAgent',
  'proxy',
  '__composioRunContext',
  '__composioConsumerContext',
];
const originalGlobalDescriptors = new Map(
  installedGlobalNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)])
);

describe('run-helpers-runtime', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const name of installedGlobalNames) {
      const descriptor = originalGlobalDescriptors.get(name);
      if (descriptor) {
        Object.defineProperty(globalThis, name, descriptor);
      } else {
        Reflect.deleteProperty(globalThis, name);
      }
    }
  });

  it('[Given] a malformed proxy session response [Then] it rejects the HTTP boundary payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ session_id: 42 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await installRunHelpers({
      cliPrefix: ['composio'],
      helperContext: {
        apiKey: 'test-key',
        orgId: 'test-org',
        consumerProjectId: 'test-project',
        consumerUserId: 'test-user',
      },
    });

    const installedGlobals: unknown = globalThis;
    expect(Predicate.hasProperty(installedGlobals, 'proxy')).toBe(true);
    if (
      !Predicate.hasProperty(installedGlobals, 'proxy') ||
      typeof installedGlobals.proxy !== 'function'
    ) {
      throw new Error('installRunHelpers() did not install proxy().');
    }

    await expect(installedGlobals.proxy('github')).rejects.toThrow(/session_id/);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
