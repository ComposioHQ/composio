import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { cli, TestLive, MockConsole } from 'test/__utils__';

describe('CLI: composio generate', () => {
  layer(
    TestLive({
      fixture: 'python-project',
    })
  )(it => {
    it.effect('[Given] a valid Python project in cwd [Then] it detects its language', () =>
      Effect.gen(function* () {
        const args = ['generate'];
        yield* cli(args);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain('Project type detected: Python');
      })
    );
  });

  layer(
    TestLive({
      fixture: 'typescript-project',
    })
  )(it => {
    it.effect('[Given] a valid TypeScript project in cwd [Then] it detects its language', () =>
      Effect.gen(function* () {
        const args = ['generate'];
        yield* cli(args);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain('Project type detected: TypeScript');
      })
    );
  });
});
