import { describe, expect, layer } from '@effect/vitest';
import { Effect, Fiber } from 'effect';
import { ValidationError, HelpDoc } from '@effect/cli';
import { cli, pkg, TestLive, MockConsole } from 'test/__utils__';
import { sanitize } from 'test/__utils__/sanitize';

describe('CLI: composio', () => {
  layer(TestLive())(it => {
    it.effect.skip('[Given] unknown argument [Then] print error message', () =>
      Effect.gen(function* () {
        const args = ['--bar'];
        const fiber = yield* Effect.fork(cli(args));
        yield* Fiber.join(fiber);

        const result = yield* Effect.flip(fiber);
        expect(result).toEqual(
          ValidationError.invalidValue(HelpDoc.p("Received unknown argument: '--bar'"))
        );
      })
    );

    it.effect('[Given] --help flag [Then] prints help message', () =>
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

            - version                                                     Display your account information.

            - whoami                                                      Display your account information.

            - login                                                       Log in to the Composio SDK.

            - generate [(-o, --output-dir directory)]                     Updates the local type stubs with the latest app data, automatically detecting the language of the project in the current working directory (TypeScript | Python).

            - py                                                          Handle Python projects.

            - py generate [(-o, --output-dir directory)]                  Updates the local type stubs with the latest app data.

            - ts                                                          Handle TypeScript projects.

            - ts generate [(-o, --output-dir directory)] [--single-file]  Updates the local type stubs with the latest app data.
          "
        `);
      })
    );

    it.effect("[Given] --version flag [Then] prints composio's version from package.json", () =>
      Effect.gen(function* () {
        const args = ['--version'];
        yield* cli(args);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain(pkg.version);
      })
    );

    // it.effect('[Pressing] CTRL+C [Then] quit wizard mode', () =>
    //   Effect.gen(function* () {
    //     const args = ['--wizard'];

    //     const fiber = yield* Effect.fork(cli(args));
    //     yield* MockTerminal.inputKey('c', { ctrl: true });
    //     yield* Fiber.join(fiber);

    //     const lines = yield* MockConsole.getLines();
    //     const output = lines.join('\n');
    //     expect(output).toContain('Quitting wizard mode...');
    //   })
    // );
  });
});
