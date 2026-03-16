import { describe, expect, layer } from '@effect/vitest';
import { vi, afterEach } from 'vitest';
import { Effect } from 'effect';
import { cli, MockConsole, TestLive } from 'test/__utils__';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CLI: composio login', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('login --help', () => {
    layer(TestLive())(it => {
      it.scoped(
        '[Then] shows --no-browser, --no-wait, --key and -y/--yes (skip picker), no --api-key',
        () =>
          Effect.gen(function* () {
            yield* cli(['login', '--help']);
            const lines = yield* MockConsole.getLines();
            const output = lines.join('\n');
            expect(output).toContain('--no-browser');
            expect(output).toContain('--no-wait');
            expect(output).toContain('--key');
            expect(output).toContain('--yes');
            expect(output).toContain('-y');
            expect(output).not.toContain('--api-key');
          })
      );
    });
  });
});
