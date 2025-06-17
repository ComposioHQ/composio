import { describe, expect, layer, vi } from '@effect/vitest';
import { Effect } from 'effect';
import { cli, TestLive, MockConsole } from 'test/__utils__';

describe('CLI: composio whoami', () => {
  layer(TestLive())(it => {
    it.effect('[Given] `COMPOSIO_API_KEY` env var [Then] prints it in stdout', () =>
      Effect.gen(function* () {
        const apiKeyFromEnv = 'super-secret-key-123';
        vi.stubEnv('COMPOSIO_API_KEY', apiKeyFromEnv);

        const args = ['whoami'];
        yield* cli(args);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain(`API KEY: ${apiKeyFromEnv}`);
      })
    );
  });

  layer(
    TestLive({
      fixture: 'user-config-example',
    })
  )(it => {
    it.effect('[Given] `api_key` in JSON user config [Then] prints it in stdout', () =>
      Effect.gen(function* () {
        const apiKeyFromEnv = 'super-secret-key-123';

        const args = ['whoami'];
        yield* cli(args);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain(`API KEY: ${apiKeyFromEnv}`);
      })
    );
  });
});
