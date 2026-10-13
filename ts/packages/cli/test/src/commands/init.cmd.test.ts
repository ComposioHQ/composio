import { describe, expect, layer } from '@effect/vitest';
import { DecodeError } from '@composio/client/effect';
import { Effect } from 'effect';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import { makeOrgProject } from 'test/__utils__/models/account';

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

  describe('dev init with the API unreachable', () => {
    const projectGuidance =
      'Create a project at https://platform.composio.dev, then run `composio dev init` again.';

    layer(TestLive({ fixture: 'user-config-with-global-context' }))(it => {
      it.effect('[Given] no project list [Then] fails with the project guidance', () =>
        Effect.gen(function* () {
          const result = yield* Effect.result(cli(['dev', 'init', '--yes']));
          const lines = yield* MockConsole.getLines({ stripAnsi: true });

          expect(result._tag).toBe('Failure');
          expect(lines).toEqual([
            '-- composio dev init --',
            'Could not fetch projects from the server.',
            projectGuidance,
            '--  --',
            'Unexpected response from the server.',
            projectGuidance,
            '--  --',
          ]);
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

    layer(
      TestLive({
        fixture: 'user-config-with-global-context',
        accountData: {
          projects: [makeOrgProject({ id: 'p1', name: 'One' })],
          sessionInfo: () => {
            throw new DecodeError({
              message:
                "The response body does not match the schema of 'auth.session.retrieveInfo'.",
              method: 'GET',
              url: 'https://backend.composio.dev/api/v3.1/auth/session/info',
              status: 200,
              requestId: 'req_session',
              operation: 'auth.session.retrieveInfo',
              issues: [{ path: ['project'], kind: 'MissingKey' }],
            });
          },
        },
      })
    )(it => {
      it.effect('[Given] session info in an unexpected shape [Then] suggests an upgrade', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'init', '--yes']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });

          expect(lines.slice(2, 5)).toEqual([
            'Could not create .env.local from session info.',
            "The API response for 'auth.session.retrieveInfo' is not in the shape this version of the CLI expects (request id: req_session).",
            'Upgrade the CLI, then retry:\n> composio upgrade',
          ]);
        })
      );
    });
  });
});
