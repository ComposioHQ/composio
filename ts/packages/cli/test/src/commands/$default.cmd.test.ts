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
              "Invalid subcommand for composio - use one of 'version', 'upgrade', 'whoami', 'login', 'logout', 'generate', 'py', 'ts', 'toolkits', 'tools', 'auth-configs', 'connected-accounts', 'triggers'"
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

            - version                                                                                                                                                                                             Display the current Composio CLI version.

            - upgrade                                                                                                                                                                                             Upgrade your Composio CLI to the latest available version.

            - whoami                                                                                                                                                                                              Display your account information.

            - login [--no-browser]                                                                                                                                                                                Log in to the Composio SDK.

            - logout                                                                                                                                                                                              Log out from the Composio SDK.

            - generate [(-o, --output-dir directory)] [--type-tools] --toolkits text...                                                                                                                           Generate type stubs for toolkits, tools, and triggers, auto-detecting project language (TypeScript | Python)

            - py                                                                                                                                                                                                  Handle Python projects.

            - py generate [(-o, --output-dir directory)] --toolkits text...                                                                                                                                       Generate Python type stubs for toolkits, tools, and triggers from the Composio API.

          Environment Variables:
            COMPOSIO_TOOLKIT_VERSION_<TOOLKIT>  Override toolkit version (e.g., COMPOSIO_TOOLKIT_VERSION_GMAIL=20250901_00)
                                                Use "latest" or unset to use the latest version.

            - ts                                                                                                                                                                                                  Handle TypeScript projects.

            - ts generate [(-o, --output-dir directory)] [--compact] [--transpiled] [--type-tools] --toolkits text...                                                                                             Generate TypeScript types for toolkits, tools, and triggers from the Composio API.

          Environment Variables:
            COMPOSIO_TOOLKIT_VERSION_<TOOLKIT>  Override toolkit version (e.g., COMPOSIO_TOOLKIT_VERSION_GMAIL=20250901_00)
                                                Use "latest" or unset to use the latest version.

            - toolkits                                                                                                                                                                                            Discover and inspect Composio toolkits.

            - toolkits list [--query text] [--limit integer]                                                                                                                                                      List available toolkits.

            - toolkits info [<slug>]                                                                                                                                                                              View details of a specific toolkit.

            - toolkits search [--limit integer] <query>                                                                                                                                                           Search toolkits by use case.

            - tools                                                                                                                                                                                               Discover and inspect Composio tools.

            - tools list [--query text] [--toolkits text] [--tags text] [--limit integer]                                                                                                                         List available tools.

            - tools info [<slug>]                                                                                                                                                                                 View details of a specific tool.

            - tools search [--toolkits text] [--limit integer] <query>                                                                                                                                            Search tools by use case.

            - tools execute [(-d, --data text)] [--user-id text] [--connected-account-id text] [--toolkit-version text] <slug>                                                                                    Execute a tool by slug with JSON arguments.

            - auth-configs                                                                                                                                                                                        View and manage Composio auth configs.

            - auth-configs list [--toolkits text] [--query text] [--limit integer]                                                                                                                                List auth configs.

            - auth-configs info [<id>]                                                                                                                                                                            View details of a specific auth config.

            - auth-configs create --toolkit text [--auth-scheme text] [--scopes text] [--custom-credentials text] [<name>]                                                                                        Create a new auth config.

            - auth-configs delete [(-y, --yes)] [<id>]                                                                                                                                                            Delete an auth config.

            - connected-accounts                                                                                                                                                                                  View and manage Composio connected accounts.

            - connected-accounts list [--toolkits text] [--user-id text] [--status INITIALIZING | INITIATED | ACTIVE | FAILED | EXPIRED | INACTIVE] [--limit integer]                                             List connected accounts.

            - connected-accounts info [<id>]                                                                                                                                                                      View details of a specific connected account.

            - connected-accounts whoami [<id>]                                                                                                                                                                    Show the external account profile for a connected account.

            - connected-accounts delete [(-y, --yes)] [<id>]                                                                                                                                                      Delete a connected account.

            - connected-accounts link --auth-config text [--user-id text] [--no-browser]                                                                                                                          Link an external account via OAuth redirect.

            - triggers                                                                                                                                                                                            Subscribe to realtime trigger events.

            - triggers listen [--toolkits text] [--trigger-id text] [--connected-account-id text] [--trigger-slug text] [--user-id text] [--json] [--table] [--max-events integer] [--forward text] [--out text]  Listen to realtime trigger events for your project.
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
