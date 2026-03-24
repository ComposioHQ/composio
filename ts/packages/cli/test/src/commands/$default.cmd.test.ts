import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { ValidationError, HelpDoc } from '@effect/cli';
import { cli, pkg, TestLive, MockConsole } from 'test/__utils__';
import { afterEach, vi } from 'vitest';

describe('CLI: composio', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  layer(TestLive())(it => {
    it.scoped('[Given] unknown argument [Then] print error message', () =>
      Effect.gen(function* () {
        const args = ['--bar'];

        const result = yield* cli(args).pipe(Effect.catchAll(e => Effect.succeed(e)));

        expect(result).toEqual(
          ValidationError.commandMismatch(
            HelpDoc.p(
              "Invalid subcommand for composio - use one of 'version', 'upgrade', 'whoami', 'login', 'logout', 'run', 'proxy', 'artifacts', 'install', 'dev', 'tools', 'search', 'link', 'execute', 'generate', 'manage'"
            )
          )
        );
      })
    );
  });

  layer(TestLive())(it => {
    it.scoped('[Given] --help flag [Then] prints help message', () =>
      Effect.gen(function* () {
        const args = ['--help'];
        yield* cli(args);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');
        expect(output).toContain('CORE COMMANDS');
        expect(output).toContain('composio search <query>');
        expect(output).toContain('composio execute <slug>');
        expect(output).toContain('composio link [<toolkit>]');
        expect(output).toContain('composio run <code>');
        expect(output).toContain('composio proxy <url> --toolkit text');
        expect(output).toContain('composio artifacts cwd');
        expect(output).toContain('DEVELOPER COMMANDS');
        expect(output).toContain('ACCOUNT');
        expect(output).toContain('Documentation: https://docs.composio.dev');
      })
    );
  });

  layer(TestLive())(it => {
    it.scoped("[Given] --version flag [Then] prints composio's version from package.json", () =>
      Effect.gen(function* () {
        const args = ['--version'];
        yield* cli(args);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain(pkg.version);
      })
    );
  });

  layer(TestLive())(it => {
    it.scoped("[Given] -v flag [Then] prints composio's version from package.json", () =>
      Effect.gen(function* () {
        const args = ['-v'];
        yield* cli(args);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain(pkg.version);
      })
    );
  });

  layer(TestLive())(it => {
    it.scoped('[Given] debug who-is-my-master [Then] it prints the detected master as json', () =>
      Effect.gen(function* () {
        vi.stubEnv('CODEX_THREAD_ID', 'thread_123');
        vi.stubEnv('CLAUDE_CODE_ENTRYPOINT', 'sdk-ts');
        const write = vi
          .spyOn(process.stdout, 'write')
          .mockImplementation((() => true) as typeof process.stdout.write);

        yield* cli(['debug', 'who-is-my-master']);
        const output = write.mock.calls.map(call => String(call[0])).join('\n');

        expect(output).toContain('"master": "codex"');
      })
    );
  });

  layer(TestLive())(it => {
    it.scoped('[Given] artifacts cwd [Then] it prints the current session artifact directory', () =>
      Effect.gen(function* () {
        const write = vi
          .spyOn(process.stdout, 'write')
          .mockImplementation((() => true) as typeof process.stdout.write);

        yield* cli(['artifacts', 'cwd']);
        const output = write.mock.calls
          .map(call => String(call[0]))
          .join('\n')
          .trim();

        expect(output).toContain('/tmp/composio');
      })
    );
  });
});
