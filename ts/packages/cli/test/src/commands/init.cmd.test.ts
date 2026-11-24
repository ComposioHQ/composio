import { describe, expect, layer } from '@effect/vitest';
import { Effect, FileSystem, Path, PlatformError } from 'effect';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import { retryHint } from 'src/effects/retry-advice';
import { NodeProcess } from 'src/services/node-process';
import { exitCodeOf } from 'test/__utils__/exit-code';
import { makeOrgProject, makeSessionInfo } from 'test/__utils__/models/account';
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
          expect(lines.slice(0, -2)).toEqual([
            '-- composio dev init --',
            'Could not fetch projects from the server.',
            projectGuidance,
            '--  --',
            'Unexpected response from the server.',
            projectGuidance,
            '--  --',
          ]);
          // The command fails with the client's error after its guidance, which the invocation
          // reports as a defect, then says the request is safe to send again.
          expect(lines.at(-2)).toContain('@composio/client/APIConnectionError');
          expect(lines.at(-1)).toBe(retryHint('safe'));
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

  describe('dev init .env.local permissions', () => {
    const FAKE_PROJECT_KEY = 'ak_fake_project_key';
    const testData = {
      fixture: 'user-config-with-global-context',
      accountData: {
        projects: [makeOrgProject({ id: 'p1', name: 'One' })],
        sessionInfo: makeSessionInfo({ apiKey: FAKE_PROJECT_KEY, orgMemberId: 'member_fake' }),
      },
    } as const;
    const generatedEnv = `COMPOSIO_API_KEY=${FAKE_PROJECT_KEY}\nCOMPOSIO_TEST_USER_ID=pg-test-member_fake\n`;

    const envFile = Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const proc = yield* NodeProcess;
      return { fs, path, envPath: path.join(proc.cwd, '.env.local') };
    });
    const modeOf = (fs: FileSystem.FileSystem, target: string) =>
      fs.stat(target).pipe(Effect.map(info => info.mode & 0o777));

    layer(TestLive(testData))(it => {
      it.effect('[Given] no .env.local [Then] creates it owner-only', () =>
        Effect.gen(function* () {
          const { fs, envPath } = yield* envFile;

          yield* cli(['dev', 'init', '--yes']);

          expect(yield* fs.readFileString(envPath)).toBe(generatedEnv);
          expect(yield* modeOf(fs, envPath)).toBe(0o600);
        })
      );
    });

    layer(TestLive(testData))(it => {
      it.effect(
        '[Given] a world-readable .env.local with both keys [Then] tightens it and keeps its contents',
        () =>
          Effect.gen(function* () {
            const { fs, envPath } = yield* envFile;
            const existing =
              'OTHER=1\nCOMPOSIO_API_KEY=ak_fake_existing\nCOMPOSIO_TEST_USER_ID=pg-test-existing\n';
            yield* fs.writeFileString(envPath, existing);
            yield* fs.chmod(envPath, 0o644);

            yield* cli(['dev', 'init', '--yes']);

            expect(yield* fs.readFileString(envPath)).toBe(existing);
            expect(yield* modeOf(fs, envPath)).toBe(0o600);
          })
      );
    });

    layer(TestLive(testData))(it => {
      it.effect(
        '[Given] a world-readable .env.local without the keys [Then] appends them and leaves it owner-only',
        () =>
          Effect.gen(function* () {
            const { fs, envPath } = yield* envFile;
            yield* fs.writeFileString(envPath, 'OTHER=1\n');
            yield* fs.chmod(envPath, 0o644);

            yield* cli(['dev', 'init', '--yes']);

            expect(yield* fs.readFileString(envPath)).toBe(`OTHER=1\n${generatedEnv}`);
            expect(yield* modeOf(fs, envPath)).toBe(0o600);
          })
      );
    });

    layer(TestLive(testData))(it => {
      it.effect.each([true, false])(
        '[Given] .env.local is a symbolic link with target present=%s [Then] refuses it',
        targetExists =>
          Effect.gen(function* () {
            const { fs, path, envPath } = yield* envFile;
            const linkTarget = path.join(
              path.dirname(envPath),
              targetExists ? 'shared.env' : 'missing.env'
            );
            if (targetExists) {
              yield* fs.writeFileString(linkTarget, generatedEnv);
              yield* fs.chmod(linkTarget, 0o644);
            }
            yield* fs.symlink(linkTarget, envPath);
            yield* Effect.addFinalizer(() => fs.remove(envPath).pipe(Effect.orDie));

            const failure = yield* cli(['dev', 'init', '--yes']).pipe(Effect.flip);

            expect(failure).toMatchObject({
              _tag: 'commands/CommandInputError',
              message: expect.stringContaining('Refusing to use a symbolic link for .env.local'),
            });
            expect(yield* fs.readLink(envPath)).toBe(linkTarget);
            if (targetExists) {
              expect(yield* fs.readFileString(linkTarget)).toBe(generatedEnv);
              expect(yield* modeOf(fs, linkTarget)).toBe(0o644);
            } else {
              expect(yield* fs.exists(linkTarget)).toBe(false);
            }
          })
      );
    });

    layer(TestLive(testData))(it => {
      it.effect('[Given] .env.local is a directory [Then] refuses it without chmod', () =>
        Effect.gen(function* () {
          const { fs, envPath } = yield* envFile;
          yield* fs.makeDirectory(envPath);
          yield* fs.chmod(envPath, 0o755);

          const failure = yield* cli(['dev', 'init', '--yes']).pipe(Effect.flip);

          expect(failure).toMatchObject({
            _tag: 'commands/CommandInputError',
            message: expect.stringContaining('.env.local because it is not a regular file'),
          });
          expect(yield* modeOf(fs, envPath)).toBe(0o755);
        })
      );
    });

    layer(TestLive(testData))(it => {
      it.effect(
        '[Given] chmod fails [Then] init reports the failure before reading .env.local',
        () =>
          Effect.gen(function* () {
            const { fs, envPath } = yield* envFile;
            yield* fs.writeFileString(envPath, generatedEnv);
            yield* fs.chmod(envPath, 0o644);
            const chmodError = PlatformError.systemError({
              _tag: 'PermissionDenied',
              module: 'FileSystem',
              method: 'chmod',
              pathOrDescriptor: envPath,
            });
            const guardedFs: FileSystem.FileSystem = {
              ...fs,
              chmod: (target, mode) =>
                target === envPath ? Effect.fail(chmodError) : fs.chmod(target, mode),
              readFileString: (target, encoding) =>
                target === envPath
                  ? Effect.die(new Error('Read .env.local after chmod failed'))
                  : fs.readFileString(target, encoding),
            };
            const terminal = redirectedTerminalUI();

            const exit = yield* cli(['dev', 'init', '--yes']).pipe(
              Effect.provideService(FileSystem.FileSystem, guardedFs),
              Effect.provide(terminal.layer),
              Effect.exit
            );

            expect(exitCodeOf(exit)).toBe(1);
            expect(terminal.stderr()).toContain('Could not make .env.local private.');
            expect(terminal.stderr()).toContain('set its permissions to 0600');
            expect(terminal.stdout()).toBe('');
            expect(yield* fs.readFileString(envPath)).toBe(generatedEnv);
            expect(yield* modeOf(fs, envPath)).toBe(0o644);
          })
      );
    });
  });
});
