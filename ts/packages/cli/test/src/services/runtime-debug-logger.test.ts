import { afterEach, describe, expect, layer, vi } from '@effect/vitest';
import { Effect } from 'effect';
import { logToolDebug, makePerfDebugLogger } from 'src/services/runtime-debug-logger';
import { resetRuntimeDebugFlags, setRuntimeDebugFlags } from 'src/services/runtime-debug-flags';
import { MockConsole, TestLive } from 'test/__utils__';

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
  });
});
