import { afterEach, describe, expect, layer, vi } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { logToolDebug, makePerfDebugLogger } from 'src/services/runtime-debug-logger';
import { configureRuntimeFlags, resetRuntimeFlags } from 'src/services/runtime-flags';
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
    resetRuntimeFlags();
    vi.restoreAllMocks();
  });

  layer(TestLive())(it => {
    it.scoped('writes tool diagnostics as the existing JSON line format', () =>
      Effect.gen(function* () {
        configureRuntimeFlags({ perfDebug: undefined, toolDebug: true, acpOnly: undefined });

        yield* logToolDebug('resolved', { slug: 'GITHUB_GET_REPO' });

        expect(yield* MockConsole.getLines()).toContain(
          '[tool-debug] {"label":"resolved","slug":"GITHUB_GET_REPO"}'
        );
      })
    );

    it.scoped('writes performance diagnostics with elapsed time', () =>
      Effect.gen(function* () {
        configureRuntimeFlags({ perfDebug: true, toolDebug: undefined, acpOnly: undefined });
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

    it.scoped('lets explicit false flags override enabled app config', () =>
      Effect.gen(function* () {
        configureRuntimeFlags({ perfDebug: false, toolDebug: false, acpOnly: undefined });
        const existingLineCount = (yield* MockConsole.getLines()).length;

        yield* logToolDebug('configured-tool');
        yield* makePerfDebugLogger(100)('configured-perf');

        expect((yield* MockConsole.getLines()).slice(existingLineCount)).toEqual([]);
      }).pipe(Effect.withConfigProvider(configuredDebugFlags))
    );
  });
});
