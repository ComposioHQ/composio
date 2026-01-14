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

        expect(yield* sanitize(output)).toMatchInlineSnapshot(`
          "[0;1m[0;37;1mcomposio[0;1m[0m

          composio <VERSION>

          [0;1mUSAGE[0m

          $ composio [--log-level all | trace | debug | info | warning | error | fatal | none]

          [0;1mDESCRIPTION[0m

          Composio CLI - A tool for managing Python and TypeScript composio.dev projects.

          [0;1mOPTIONS[0m

          [0;1m--log-level all | trace | debug | info | warning | error | fatal | none[0m

            One of the following: all, trace, debug, info, warning, error, fatal, none

            Define log level

            This setting is optional.

          [0;1mCOMMANDS[0m

            - version  Display your account information.

          [0;1mCOMMANDS[0m

            - version                                                                                                  Display your account information.

            - upgrade                                                                                                  Upgrade your Composio CLI to the latest available version.

            - whoami                                                                                                   Display your account information.

            - login [--no-browser]                                                                                     Log in to the Composio SDK.

            - logout                                                                                                   Log out from the Composio SDK.

            - generate [(-o, --output-dir directory)] [--type-tools] --toolkits text...                                Updates the local type stubs with the latest app data, automatically detecting the language of the project in the current working directory (TypeScript | Python).

            - py                                                                                                       Handle Python projects.

            - py generate [(-o, --output-dir directory)] --toolkits text...                                            Generate Python type stubs for toolkits, tools, and triggers from the Composio API

            - ts                                                                                                       Handle TypeScript projects.

            - ts generate [(-o, --output-dir directory)] [--compact] [--transpiled] [--type-tools] --toolkits text...  Generate TypeScript types for toolkits, tools, and triggers from the Composio API
          "
        `);
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
