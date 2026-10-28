import { Array as Arr, Console, Effect, Schema } from 'effect';
import { CliError, CliOutput, Command } from 'effect/cli';
import type { TelemetryFamily } from 'src/analytics/types';
import {
  beginAtCommandPath,
  type CommandMetaShape,
  withCommandMeta,
} from 'src/invocation/command-identity';
import { $defaultCmd, withRootLogLevel } from './$default.cmd';
import { getVersion } from 'src/effects/version';
import { versionCmd } from './version.cmd';
import { upgradeCmd } from './upgrade/upgrade.cmd';
import { whoamiCmd } from './whoami.cmd';
import { loginCmd } from './login/login.cmd';
import { signupCmd } from './signup/signup.cmd';
import { setupCmd } from './setup.cmd';
import { listenCmd } from './listen.cmd';
import { logoutCmd } from './logout.cmd';
import { runCmd } from './run.cmd';
import { proxyCmd } from './proxy.cmd';
import { artifactsCmd } from './artifacts/artifacts.cmd';
import { installCmd } from './install/install.cmd';
import { generateCmd } from './generate/generate.cmd';
import { buildDevCommand } from './dev.cmd';
import { ExecuteInvocationArgs } from './tools/execute/tools.execute.parallel';
import {
  buildHelpCommand,
  RootHelpMarker,
  helpFormatter,
  RootHelpContext,
  showCommandHelp,
} from './root-help';
import { toolsCmd$Search } from './tools/search/tools.search.cmd';
import { rootToolsCmd$Execute } from './tools/execute/tools.execute.cmd';
import { rootToolsCmd } from './tools/tools.cmd';
import { rootTriggersCmd } from './triggers/root-triggers.cmd';
import { connectedAccountsCmd$Link } from './connected-accounts/link/connected-accounts.link.cmd';
import { orgsCmd } from './orgs/orgs.cmd';
import { configCmd } from './config/config.cmd';
import { rootConnectionsCmd } from './connections/connections.cmd';
import { agentCmd } from './agent/agent.cmd';
import { cliDebugFlagsLayer, CLI_DEBUG_GLOBAL_FLAGS } from 'src/services/runtime-flags';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { CLI_EXPERIMENTAL_FEATURES } from 'src/constants';
import { experimental, type CommandVisibility, tagged, visibleValues } from './feature-tags';
import { withRegisteredSubcommands } from './registration';
import { debugCmd } from './debug/debug.cmd';
import { normalizeListenStreamFlag, normalizeRunScriptArgs } from './argv-compat';
import { configureCliAnalyticsReleaseVersion } from 'src/analytics/events';
import { CommandSurface } from './surface';

// Lifecycle telemetry families are declared on root registrations only: every `dev` command,
// including `dev connected-accounts link` (the same `Command` value as the root `link`), reports the
// generic `CLI_COMMAND_*` events.
const family = (telemetryFamily: TelemetryFamily) => withCommandMeta({ telemetryFamily });

// Every invocation hook runs for every selected command (`src/invocation/invocation.ts`) except
// where a root registration below turns one off; its subcommands inherit that.
const hooks = (policies: NonNullable<CommandMetaShape['hooks']>) =>
  withCommandMeta({ hooks: policies });

/** `composio version --check` resolves releases itself, like `composio upgrade`. */
const isExplicitVersionCheck = Schema.is(Schema.Struct({ check: Schema.Literal(true) }));

/** `composio help …` only prints help, like `--help`. */
const NO_HOOKS = {
  backendMismatch: false,
  updateNotice: false,
  pluginHint: false,
  backgroundUpdateCheck: false,
} as const;

const ROOT_COMMANDS = [
  tagged(debugCmd),
  tagged(
    versionCmd.pipe(hooks({ backgroundUpdateCheck: input => !isExplicitVersionCheck(input) }))
  ),
  // `composio upgrade` resolves the latest release live and records it in the cache, so a cached
  // notice could only repeat or contradict it.
  tagged(upgradeCmd.pipe(hooks({ updateNotice: false, backgroundUpdateCheck: false }))),
  tagged(whoamiCmd),
  tagged(loginCmd.pipe(family('login'))),
  tagged(signupCmd),
  // `composio setup` installs the plugin the hint asks for.
  tagged(setupCmd.pipe(family('setup'), hooks({ pluginHint: false }))),
  tagged(agentCmd),
  experimental(CLI_EXPERIMENTAL_FEATURES.LISTEN, listenCmd),
  tagged(logoutCmd.pipe(family('logout'))),
  tagged(runCmd.pipe(family('run'))),
  tagged(proxyCmd.pipe(family('proxy'))),
  tagged(artifactsCmd),
  tagged(installCmd.pipe(family('install'))),
  tagged(rootToolsCmd),
  tagged(rootTriggersCmd),
  tagged(toolsCmd$Search.pipe(family('search'))),
  tagged(connectedAccountsCmd$Link.pipe(family('link'))),
  tagged(rootToolsCmd$Execute.pipe(family('execute'))),
  tagged(rootConnectionsCmd),
  tagged(generateCmd),
  tagged(orgsCmd),
  tagged(configCmd),
];

const getVisibleRootCommands = (visibility: CommandVisibility) => {
  type RootCommand = (typeof ROOT_COMMANDS)[number]['value'];
  return Arr.append(
    visibleValues<RootCommand>(ROOT_COMMANDS, visibility),
    buildDevCommand(visibility)
  );
};

export const buildRootCommand = (visibility: CommandVisibility) => {
  const commands = getVisibleRootCommands(visibility);
  return $defaultCmd.pipe(
    Command.withHandler(() => showCommandHelp()),
    withRegisteredSubcommands([...commands, buildHelpCommand(commands).pipe(hooks(NO_HOOKS))]),
    Command.annotate(RootHelpMarker, true),
    Command.withGlobalFlags(CLI_DEBUG_GLOBAL_FLAGS),
    withRootLogLevel,
    // The `dev` group provides its own surface around its subcommands; everything else is root.
    Command.provide(CommandSurface.root)
  );
};

export const runWithConfig = Effect.gen(function* () {
  const cliUserConfig = yield* ComposioCliUserConfig;
  const visibility: CommandVisibility = {
    isDevModeEnabled: cliUserConfig.isDevModeEnabled(),
    isExperimentalFeatureEnabled: feature => cliUserConfig.isExperimentalFeatureEnabled(feature),
  };
  const version = yield* getVersion;
  configureCliAnalyticsReleaseVersion(version);
  const rootCommand = buildRootCommand(visibility);
  // v4's `Command.runWith` (unlike v3's `Command.run`) takes explicit arguments rather than
  // pulling them from `Stdio`, and expects them *without* the node/bun executable + script path
  // prefix — see `cli-main.ts` module docs for the full contract at this boundary.
  const run = (args: ReadonlyArray<string>) => {
    return Command.runWith(rootCommand, { version })(args).pipe(
      // A parse failure selects no command: begin the one `effect/cli` names (canonical names,
      // never the user's tokens). After a command began, this changes nothing.
      Effect.tapError(error =>
        error instanceof CliError.ShowHelp
          ? beginAtCommandPath(rootCommand, error.commandPath)
          : Effect.void
      ),
      Effect.provideService(RootHelpContext, { command: rootCommand, version }),
      Effect.provideService(CliOutput.Formatter, helpFormatter())
    );
  };

  // Effect renders help through Console.log. Route implicit help to stderr so stdout
  // stays available for command data; explicit help and version requests use stdout.
  const runWithDecorationOnStderr = (args: ReadonlyArray<string>) =>
    Effect.gen(function* () {
      const base = yield* Console.Console;
      // Node/Bun consoles carry their methods as own (bound) properties and the
      // test MockConsole is a plain object literal, so a spread copies every
      // method; only `log` needs overriding.
      return yield* Effect.provideService(run(args), Console.Console, {
        ...base,
        log: (...rest) => base.error(...rest),
      });
    });

  const EXPLICIT_STDOUT_FLAGS: ReadonlySet<string> = new Set(['--help', '-h', '--version', '-v']);

  const runCli = (args: ReadonlyArray<string>) =>
    args.length === 0 ||
    Arr.takeWhile(args, arg => arg !== '--').some(arg => EXPLICIT_STDOUT_FLAGS.has(arg))
      ? run(args)
      : runWithDecorationOnStderr(args);

  return (argv: ReadonlyArray<string>) => {
    const parsedArgv = normalizeRunScriptArgs(normalizeListenStreamFlag(argv));
    return runCli(parsedArgv.slice(2)).pipe(
      Effect.provideService(ExecuteInvocationArgs, parsedArgv.slice(2)),
      Effect.provide(cliDebugFlagsLayer())
    );
  };
});
