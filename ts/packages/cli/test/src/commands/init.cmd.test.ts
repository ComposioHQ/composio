import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { cli, TestLive, MockConsole } from 'test/__utils__';

describe('CLI: composio dev init', () => {
  describe('dev init --help', () => {
    layer(TestLive({ fixture: 'typescript-project' }))(it => {
      it.scoped('[Then] shows --no-browser and --yes, no --org-id or --project-id', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'init', '--help']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');
          expect(output).toContain('--no-browser');
          expect(output).toContain('--yes');
          expect(output).not.toContain('--org-id');
          expect(output).not.toContain('--project-id');
        })
      );
    });
  });
});
