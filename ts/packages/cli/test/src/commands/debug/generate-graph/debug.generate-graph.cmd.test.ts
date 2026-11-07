import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { renderCommandHintGraph } from 'src/services/command-hints';
import { cli, MockConsole, TestLive } from 'test/__utils__';

describe('CLI: composio debug generate-graph', () => {
  layer(TestLive())(it => {
    it.effect('[Then] prints the command-hint graph as indented JSON on stdout', () =>
      Effect.gen(function* () {
        yield* cli(['debug', 'generate-graph']);

        expect(yield* MockConsole.getLines({ stream: 'stdout' })).toEqual([
          JSON.stringify(renderCommandHintGraph(), null, 2),
        ]);
        expect(yield* MockConsole.getLines({ stream: 'stderr' })).toEqual([]);
      })
    );
  });
});
