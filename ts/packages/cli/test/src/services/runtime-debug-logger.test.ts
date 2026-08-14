import { afterEach, describe, expect, layer, vi } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { logToolDebug, makePerfDebugLogger } from 'src/services/runtime-debug-logger';
import { resetRuntimeDebugFlags, setRuntimeDebugFlags } from 'src/services/runtime-debug-flags';
import { extendConfigProvider } from 'src/services/config';
import { MockConsole, TestLive } from 'test/__utils__';

const configuredDebugFlags = ConfigProvider.fromMap(
  new Map([
    ['COMPOSIO_PERF_DEBUG', '1'],
    ['COMPOSIO_TOOL_DEBUG', '1'],
  ])
).pipe(extendConfigProvider);

describe('runtime debug logger', () => {
  afterEach(() => {
    resetRuntimeDebugFlags();
    vi.restoreAllMocks();
  });

  layer(TestLive())(it => {
    it.scoped('writes tool diagnostics as the existing JSON line format', () =>
      Effect.gen(function* () {
        setRuntimeDebugFlags({ toolDebug: true });

        yield* logToolDebug('resolved', { slug: 'GITHUB_GET_REPO' });

        expect(yield* MockConsole.getLines()).toContain(
          '[tool-debug] {"label":"resolved","slug":"GITHUB_GET_REPO"}'
        );
      })
    );

    it.scoped('writes performance diagnostics with elapsed time', () =>
      Effect.gen(function* () {
        setRuntimeDebugFlags({ perfDebug: true });
        vi.spyOn(Date, 'now').mockReturnValue(125);
        const logPerfDebug = makePerfDebugLogger(100);

        yield* logPerfDebug('started', { slug: 'GITHUB_GET_REPO' });

        expect(yield* MockConsole.getLines()).toContain(
          '[perf] {"phase":"event","label":"started","elapsedMs":25,"slug":"GITHUB_GET_REPO"}'
        );
      })
    );

    it.scoped('writes diagnostics enabled through app config', () =>
      Effect.gen(function* () {
        vi.spyOn(Date, 'now').mockReturnValue(125);

        yield* logToolDebug('configured-tool');
        yield* makePerfDebugLogger(100)('configured-perf');

        const lines = yield* MockConsole.getLines();
        expect(lines).toContain('[tool-debug] {"label":"configured-tool"}');
        expect(lines).toContain(
          '[perf] {"phase":"event","label":"configured-perf","elapsedMs":25}'
        );
      }).pipe(Effect.withConfigProvider(configuredDebugFlags))
    );
  });
});
