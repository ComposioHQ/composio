import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { ValidationError, HelpDoc } from '@effect/cli';
import { cli, pkg, TestLive, MockConsole } from 'test/__utils__';
import { sanitize } from 'test/__utils__/sanitize';

describe('CLI: composio', () => {
  layer(TestLive())(it => {
    it.scoped('[Given] unknown argument [Then] print error message', () =>
      Effect.gen(function* () {
        const args = ['--bar'];

        const result = yield* cli(args).pipe(Effect.catchAll(e => Effect.succeed(e)));

        expect(result).toEqual(
          ValidationError.commandMismatch(
            HelpDoc.p(
              "Invalid subcommand for composio - use one of 'version', 'upgrade', 'whoami', 'login', 'logout', 'init', 'generate', 'py', 'ts', 'toolkits', 'tools', 'auth-configs', 'connected-accounts', 'triggers', 'logs'"
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
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(yield* sanitize(output)).toMatchSnapshot();
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
});
