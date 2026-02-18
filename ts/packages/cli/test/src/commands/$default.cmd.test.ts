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
            HelpDoc.p("Invalid subcommand for composio - use 'version'")
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
        const sanitized = yield* sanitize(output);

        expect(sanitized).toContain('Composio CLI');
        expect(sanitized).toContain('generate');
        expect(sanitized).toContain('py generate');
        expect(sanitized).toContain('ts generate');
        expect(sanitized).toContain('tools list');
        expect(sanitized).toContain('toolkits info');
        expect(sanitized).toContain('auth_configs create');
        expect(sanitized).toContain('connected_accounts whoami');
        expect(sanitized).toContain('triggers status');
        expect(sanitized).toContain('create');
        expect(sanitized).toContain('session link');
        expect(sanitized).toContain('session toolkits');
        expect(sanitized).toContain('Create a Tool Router session');
        expect(sanitized).toContain('Manage Tool Router session workflows');
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

  // layer(TestLive())(it => {
  //   it.scoped('[Pressing] CTRL+C [Then] quit wizard mode', () =>
  //     Effect.gen(function* () {
  //       const args = ['--wizard'];

  //       const fiber = yield* Effect.fork(cli(args));
  //       yield* MockTerminal.inputKey('c', { ctrl: true });
  //       yield* Fiber.join(fiber);

  //       const lines = yield* MockConsole.getLines();
  //       const output = lines.join('\n');
  //       expect(output).toContain('Quitting wizard mode...');
  //     })
  //   );
  // });
});
