import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import { exitCodeOf } from 'test/__utils__/exit-code';
import { makeOrgProject } from 'test/__utils__/models/account';
import { redirectedTerminalUI } from 'test/__utils__/services/redirected-terminal-ui';

describe('CLI: composio dev init', () => {
  describe('dev init --help', () => {
    layer(TestLive({ fixture: 'typescript-project' }))(it => {
      it.effect('[Then] shows --no-browser and --yes, no --org-id or --project-id', () =>
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

  describe('dev init without a usable login', () => {
    layer(TestLive({ fixture: 'user-config-example' }))(it => {
      it.effect('[Given] an API key but no org [Then] fails with a usage error', () =>
        Effect.gen(function* () {
          const failure = yield* cli(['dev', 'init', '--yes']).pipe(Effect.flip);

          expect(failure).toMatchObject({
            _tag: 'commands/CommandInputError',
            command: 'dev init',
            message: 'No global API key or org ID found. Please try `composio login` first.',
          });
        })
      );
    });
  });

  describe('dev init in an org without projects', () => {
    layer(TestLive({ fixture: 'user-config-with-global-context', accountData: { projects: [] } }))(
      it => {
        it.effect('[Given] no projects [Then] says so on a redirected stderr and exits 1', () =>
          Effect.gen(function* () {
            const terminal = redirectedTerminalUI();
            const exit = yield* Effect.exit(
              cli(['dev', 'init', '--yes']).pipe(Effect.provide(terminal.layer))
            );

            expect(terminal.stderr()).toBe(
              'No projects found for your organization.\nCreate a project at https://platform.composio.dev, then run `composio dev init` again.\n'
            );
            expect(terminal.stdout()).toBe('');
            expect(exitCodeOf(exit)).toBe(1);
          })
        );
      }
    );
  });

  describe('dev init with the API unreachable', () => {
    const projectGuidance =
      'Create a project at https://platform.composio.dev, then run `composio dev init` again.';

    layer(TestLive({ fixture: 'user-config-with-global-context' }))(it => {
      it.effect('[Given] no project list [Then] fails with the project guidance', () =>
        Effect.gen(function* () {
          const result = yield* Effect.result(cli(['dev', 'init', '--yes']));
          const lines = yield* MockConsole.getLines({ stripAnsi: true });

          expect(result._tag).toBe('Failure');
          expect(lines.slice(0, -1)).toEqual([
            '-- composio dev init --',
            'Could not fetch projects from the server.',
            projectGuidance,
            '--  --',
            'Unexpected response from the server.',
            projectGuidance,
            '--  --',
          ]);
          // The command fails with the client's error after its guidance, which the invocation
          // reports as a defect.
          expect(lines.at(-1)).toContain('@composio/client/APIConnectionError');
        })
      );
    });

    layer(
      TestLive({
        fixture: 'user-config-with-global-context',
        accountData: { projects: [makeOrgProject({ id: 'p1', name: 'One' })] },
      })
    )(it => {
      it.effect('[Given] no session info [Then] warns with the transport reason and finishes', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'init', '--yes']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });

          expect(lines.slice(0, 4)).toEqual([
            '-- composio dev init --',
            'Using developer project "One"',
            'Could not create .env.local from session info.',
            'No test data for auth.session.retrieveInfo',
          ]);
          expect(lines[4]).toMatch(/^Project initialized in /);
        })
      );
    });
  });
});
