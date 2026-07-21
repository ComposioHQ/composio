import process from 'node:process';
import { Array as Arr, Console, Data, Effect, HashSet, Option } from 'effect';
import { Command } from 'effect/unstable/cli';
import { $defaultCmd } from './$default.cmd';
import { getVersion } from 'src/effects/version';
import { versionCmd } from './version.cmd';
import { upgradeCmd } from './upgrade.cmd';
import { whoamiCmd } from './whoami.cmd';
import { loginCmd } from './login.cmd';
import { signupCmd } from './signup.cmd';
import { setupCmd } from './setup.cmd';
import { listenCmd } from './listen.cmd';
import { logoutCmd } from './logout.cmd';
import { RUN_PASSTHROUGH_ARG_MARKER, runCmd } from './run.cmd';
import { proxyCmd } from './proxy.cmd';
import { artifactsCmd } from './artifacts.cmd';
import { installCmd } from './install.cmd';
import { localToolsCmd } from './local-tools/local-tools.cmd';
import { generateCmd } from './generate/generate.cmd';
import { buildDevCommand } from './dev.cmd';
import {
  runParallelToolsExecuteFromArgv,
  showToolsExecuteInputHelp,
  TOOLS_EXECUTE_VALUE_OPTIONS,
} from './tools/commands/tools.execute.cmd';
import {
  printRootHelp,
  matchSubcommandHelp,
  parseHelpLevel,
  printSubcommandHelp,
} from './root-help';
import { rootToolsCmd$Search } from './tools/commands/tools.search.cmd';
import { rootToolsCmd$Execute } from './tools/commands/tools.execute.cmd';
import { rootToolsCmd } from './tools/tools.cmd';
import { rootTriggersCmd } from './triggers/root-triggers.cmd';
import { rootConnectedAccountsCmd$Link } from './connected-accounts/commands/connected-accounts.link.cmd';
import { orgsCmd } from './orgs/orgs.cmd';
import { configCmd } from './config/config.cmd';
import { rootConnectionsCmd } from './connections/connections.cmd';
import { agentCmd } from './agent/agent.cmd';
import { renderCommandHintGraph } from 'src/services/command-hints';
import { resetRuntimeDebugFlags, setRuntimeDebugFlags } from 'src/services/runtime-debug-flags';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { ComposioUserContext } from 'src/services/user-context';
import { TerminalUI } from 'src/services/terminal-ui';
import { detectMaster } from 'src/services/master-detector';
import {
  formatResolveCommandProjectError,
  resolveCommandProject,
} from 'src/services/command-project';
import { CLI_EXPERIMENTAL_FEATURES } from 'src/constants';
import { installSkill, type SkillInstallTarget } from 'src/effects/install-skill';
import { experimental, type CommandVisibility, tagged, visibleValues } from './feature-tags';

const ROOT_COMMANDS = [
  tagged(versionCmd),
  tagged(upgradeCmd),
  tagged(whoamiCmd),
  tagged(loginCmd),
  tagged(signupCmd),
  tagged(setupCmd),
  tagged(agentCmd),
  experimental(CLI_EXPERIMENTAL_FEATURES.LISTEN, listenCmd),
  tagged(logoutCmd),
  tagged(runCmd),
  tagged(proxyCmd),
  tagged(artifactsCmd),
  tagged(installCmd),
  experimental(CLI_EXPERIMENTAL_FEATURES.LOCAL_TOOLS, localToolsCmd),
  tagged(rootToolsCmd),
  tagged(rootTriggersCmd),
  tagged(rootToolsCmd$Search),
  tagged(rootConnectedAccountsCmd$Link),
  tagged(rootToolsCmd$Execute),
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

export const buildRootCommand = (visibility: CommandVisibility) =>
  $defaultCmd.pipe(Command.withSubcommands(getVisibleRootCommands(visibility)));

const ROOT_INSTALL_SKILL_FLAGS = HashSet.make('--install-skill', '--instal-skill');
const SKILL_INSTALL_TARGETS: ReadonlyArray<SkillInstallTarget> = ['claude', 'codex', 'openclaw'];

class RootCommandError extends Data.TaggedError('commands/RootCommandError')<{
  readonly message: string;
}> {}

type RootInstallSkillRequest = {
  readonly skillName?: string;
  readonly target: SkillInstallTarget;
};

const isSkillInstallTarget = (value: string): value is SkillInstallTarget =>
  SKILL_INSTALL_TARGETS.some(target => target === value);

const rootCommandError = (message: string) => Effect.fail(new RootCommandError({ message }));

const findRootInstallSkillValues = (
  args: ReadonlyArray<string>
): Option.Option<ReadonlyArray<string>> =>
  Arr.matchLeft(args, {
    onEmpty: Option.none,
    onNonEmpty: (token, tail) => {
      if (HashSet.has(ROOT_INSTALL_SKILL_FLAGS, token)) {
        return Option.some(Arr.takeWhile(tail, value => !value.startsWith('-')));
      }
      if (token === '--log-level') {
        return findRootInstallSkillValues(Arr.drop(tail, 1));
      }
      if (token.startsWith('--log-level=') || token.startsWith('-')) {
        return findRootInstallSkillValues(tail);
      }
      return Option.none();
    },
  });

const parseRootInstallSkillValues = (
  rawValues: ReadonlyArray<string>
): Effect.Effect<RootInstallSkillRequest, RootCommandError> =>
  Arr.match(rawValues, {
    onEmpty: () =>
      rootCommandError(
        'Missing target for --install-skill. Usage: composio --install-skill [skill-name] <claude|codex|openclaw>'
      ),
    onNonEmpty: ([first, second, ...rest]) => {
      if (rest.length > 0) {
        return rootCommandError(
          'Too many arguments for --install-skill. Usage: composio --install-skill [skill-name] <claude|codex|openclaw>'
        );
      }
      const target = second ?? first;
      if (!isSkillInstallTarget(target)) {
        return rootCommandError(
          'Invalid target for --install-skill. Expected one of: claude, codex, openclaw.'
        );
      }
      return Effect.succeed(second === undefined ? { target } : { skillName: first, target });
    },
  });

export const parseRootInstallSkillRequest = (
  argv: ReadonlyArray<string>
): Effect.Effect<Option.Option<RootInstallSkillRequest>, RootCommandError> =>
  Option.match(findRootInstallSkillValues(Arr.drop(argv, 2)), {
    onNone: () => Effect.succeed(Option.none()),
    onSome: values => Effect.map(parseRootInstallSkillValues(values), Option.some),
  });

// v4 note: v3 pre-flight parsed `argv` to rewrite `ValidationError.CommandMismatch` messages
// (`scopeCommandMismatch` / `refineRootCommandMismatch`) before `Command.run` rendered them, using
// the private `CommandDescriptor` tree (see `command-introspection.ts`). `effect/unstable/cli`'s
// `Command.runWith` renders its own unknown-subcommand messaging (naming the resolved command's
// actual subcommands) internally before re-failing with `CliError.ShowHelp`, so `routeRootCommand`
// below now always delegates straight to `run` instead of pre-flight parsing and rewriting errors.

export const parseExecuteInputHelpSlug = (argv: ReadonlyArray<string>): string | undefined => {
  const args = Arr.drop(argv, 2);
  const isRootExecute = args[0] === 'execute';
  const isDevExecute = args[0] === 'dev' && args[1] === 'playground-execute';
  if (!isRootExecute && !isDevExecute) return undefined;

  const hasHelp = args.includes('--help') || args.includes('-h');
  if (!hasHelp) return undefined;

  const findSlug = (tail: ReadonlyArray<string>): string | undefined =>
    Arr.matchLeft(tail, {
      onEmpty: () => undefined,
      onNonEmpty: (token, rest) => {
        if (token === '--') {
          return Option.getOrUndefined(
            Option.filter(Arr.head(rest), candidate => !candidate.startsWith('-'))
          );
        }
        if (token === '--help' || token === '-h') {
          return findSlug(rest);
        }
        if (HashSet.has(TOOLS_EXECUTE_VALUE_OPTIONS, token)) {
          return findSlug(Arr.drop(rest, 1));
        }
        if (token.startsWith('-')) {
          return findSlug(rest);
        }
        return token;
      },
    });

  return findSlug(Arr.drop(args, isRootExecute ? 1 : 2));
};

const normalizeVersionShortFlag = (argv: ReadonlyArray<string>): ReadonlyArray<string> => {
  const args = argv.slice(2);
  if (args.length === 1 && args[0] === '-v') {
    return [...argv.slice(0, 2), '--version'];
  }
  return argv;
};

const normalizeListenStreamFlag = (argv: ReadonlyArray<string>): ReadonlyArray<string> => {
  const head = Arr.take(argv, 2);
  const args = Arr.drop(argv, 2);
  const isListen = args[0] === 'listen';
  if (!isListen) {
    return argv;
  }

  return Arr.appendAll(
    head,
    Arr.map(args, (token, index) => {
      const next = args[index + 1];
      return token === '--stream' && (next === undefined || next.startsWith('-'))
        ? '--stream='
        : token;
    })
  );
};

// `composio run` forwards arbitrary flag-looking tokens straight through to
// the user's script (`composio run 'code' --flag value`), but v4's CLI
// lexer treats every `-`-prefixed token as an option candidate, and its
// subcommand parser drops the trailing operands after a literal `--`
// instead of forwarding them to `run`'s own `Argument.variadic()` (see
// `RUN_PASSTHROUGH_ARG_MARKER`'s doc comment in `run.cmd.ts` for the full
// mechanism this works around). This rewrites every passthrough token that
// would otherwise be misparsed as an option with a marker `run.cmd.ts`
// strips back off after the CLI has parsed it as a plain positional value.
const RUN_KNOWN_BOOLEAN_FLAGS: ReadonlySet<string> = new Set([
  '--dry-run',
  '--debug',
  '--logs-off',
  '--skip-connection-check',
  '--skip-tool-params-check',
  '--skip-checks',
  '--help',
  '-h',
]);
const RUN_KNOWN_VALUE_FLAGS: ReadonlySet<string> = new Set(['--file', '-f']);

const normalizeRunPassthroughArgs = (argv: ReadonlyArray<string>): ReadonlyArray<string> => {
  const args = Arr.drop(argv, 2);
  if (args[0] !== 'run') {
    return argv;
  }

  const normalized: Array<string> = [];
  let sawPositional = false;
  let droppedSeparator = false;
  let index = 1;
  while (index < args.length) {
    const token = args[index];
    if (!sawPositional) {
      // A `--flag=value` token must be recognized by its name, not the whole
      // token: `--file=script.ts` is a `run` option, and treating it as the
      // first positional would demote every later flag (including safety
      // flags like `--dry-run`) to passthrough script arguments.
      const equalsIndex = token.indexOf('=');
      const flagName = equalsIndex === -1 ? token : token.slice(0, equalsIndex);
      if (RUN_KNOWN_VALUE_FLAGS.has(flagName)) {
        normalized.push(token);
        if (equalsIndex === -1) {
          const value = args[index + 1];
          if (value !== undefined) {
            normalized.push(value);
          }
          index += 2;
          continue;
        }
        index += 1;
        continue;
      }
      if (RUN_KNOWN_BOOLEAN_FLAGS.has(flagName)) {
        normalized.push(token);
        index += 1;
        continue;
      }
      // First token that isn't a `run`-recognized flag: everything from here
      // on is a passthrough positional, not a `run` option. A literal `--`
      // here is just the (now unnecessary) boundary marker itself.
      sawPositional = true;
      if (token !== '--') {
        normalized.push(token);
      } else {
        droppedSeparator = true;
      }
      index += 1;
      continue;
    }
    if (token === '--') {
      // Only the first `--` is the run/script boundary; later ones are script
      // arguments and must reach the script verbatim (marker-escaped so the
      // parser reads them as positionals, matching v3's forwarding behavior).
      if (!droppedSeparator) {
        droppedSeparator = true;
        index += 1;
        continue;
      }
      normalized.push(`${RUN_PASSTHROUGH_ARG_MARKER}--`);
      index += 1;
      continue;
    }
    normalized.push(token.startsWith('-') ? `${RUN_PASSTHROUGH_ARG_MARKER}${token}` : token);
    index += 1;
  }

  return [...Arr.take(argv, 2), 'run', ...normalized];
};

const parseBooleanFlag = (argument: string, name: string): Option.Option<boolean> => {
  if (argument === name || argument === `${name}=true`) {
    return Option.some(true);
  }
  return argument === `${name}=false` ? Option.some(false) : Option.none();
};

const normalizeHiddenDebugFlags = (argv: ReadonlyArray<string>): ReadonlyArray<string> => {
  const retainedArgs: Array<string> = [];
  let perfDebug: boolean | undefined;
  let toolDebug: boolean | undefined;
  let acpOnly: boolean | undefined;

  for (const argument of Arr.drop(argv, 2)) {
    const parsedPerfDebug = Option.getOrUndefined(parseBooleanFlag(argument, '--perf-debug'));
    if (parsedPerfDebug !== undefined) {
      perfDebug = parsedPerfDebug;
      continue;
    }
    const parsedToolDebug = Option.getOrUndefined(parseBooleanFlag(argument, '--tool-debug'));
    if (parsedToolDebug !== undefined) {
      toolDebug = parsedToolDebug;
      continue;
    }
    const parsedAcpOnly = Option.getOrUndefined(parseBooleanFlag(argument, '--acp-only'));
    if (parsedAcpOnly !== undefined) {
      acpOnly = parsedAcpOnly;
      continue;
    }
    retainedArgs.push(argument);
  }

  resetRuntimeDebugFlags();
  setRuntimeDebugFlags({
    ...(perfDebug === undefined ? {} : { perfDebug }),
    ...(toolDebug === undefined ? {} : { toolDebug }),
  });
  // The hidden --acp-only flag is stripped from argv before @effect/cli parses it, so its value
  // travels to run.cmd.ts through the environment; effect/Config cannot write or delete env vars.
  if (acpOnly === undefined) {
    // eslint-disable-next-line no-restricted-syntax -- env delete clears a stale hidden-flag value
    delete process.env.COMPOSIO_RUN_ACP_ONLY;
  } else {
    // eslint-disable-next-line no-restricted-syntax -- env write hands the stripped flag to run.cmd
    process.env.COMPOSIO_RUN_ACP_ONLY = acpOnly ? '1' : '0';
  }

  return Arr.appendAll(Arr.take(argv, 2), retainedArgs);
};

const isRootHelp = (argv: ReadonlyArray<string>): boolean => {
  const args = argv.slice(2);
  return (
    args.length === 0 ||
    (args.length >= 1 &&
      args.length <= 2 &&
      (args[0] === '--help' || args[0] === '-h') &&
      (args.length === 1 || parseHelpLevel(args[1]) !== undefined))
  );
};

const isGenerateGraph = (argv: ReadonlyArray<string>): boolean => {
  const args = argv.slice(2);
  return args.length === 2 && args[0] === 'debug' && args[1] === 'generate-graph';
};

const isDebugApiInfo = (argv: ReadonlyArray<string>): boolean => {
  const args = argv.slice(2);
  return args.length === 2 && args[0] === 'debug' && args[1] === 'api-info';
};

const isDebugWhoIsMyMaster = (argv: ReadonlyArray<string>): boolean => {
  const args = argv.slice(2);
  return args.length === 2 && args[0] === 'debug' && args[1] === 'who-is-my-master';
};

const normalizeDangerouslyAllowFlag = (argv: ReadonlyArray<string>) => {
  const retainedArgs: Array<string> = [];
  let dangerouslyAllow = false;
  for (const argument of Arr.drop(argv, 2)) {
    if (argument === '--dangerously-allow') {
      dangerouslyAllow = true;
    } else {
      retainedArgs.push(argument);
    }
  }

  return {
    argv: Arr.appendAll(Arr.take(argv, 2), retainedArgs),
    dangerouslyAllow,
  };
};

const isHelpRequest = (args: ReadonlyArray<string>) =>
  args.includes('--help') || args.includes('-h');

const isDevModeOnlyInvocation = (args: ReadonlyArray<string>) => {
  if (args[0] !== 'dev') return false;
  if (isHelpRequest(args)) return true;
  if (args.length === 1) return true;
  if (args.length === 2 && (args[1] === '--mode' || args[1].startsWith('--mode='))) return true;
  if (args.length === 3 && args[1] === '--mode') return true;
  return false;
};

const isDangerousDevCommand = (args: ReadonlyArray<string>): boolean => {
  if (args[0] !== 'dev' || isHelpRequest(args)) return false;

  if (args[1] === 'triggers') {
    return args[2] === 'disable';
  }

  return false;
};

const printCommandHintGraph = Effect.suspend(() =>
  Effect.flatMap(TerminalUI, ui =>
    ui.output(JSON.stringify(renderCommandHintGraph(), null, 2), { force: true })
  )
);

const printDebugApiInfo = Effect.gen(function* () {
  const ui = yield* TerminalUI;
  const confirmed = yield* ui.confirm(
    'This will print your current CLI API key and scoped identifiers to stdout. Continue?',
    { defaultValue: false }
  );
  if (!confirmed) {
    return yield* rootCommandError('Aborted printing API credentials.');
  }
  const ctx = yield* ComposioUserContext;
  const apiKey = Option.getOrUndefined(ctx.data.apiKey);
  if (!apiKey) {
    return yield* rootCommandError('No user API key found in the current CLI session.');
  }
  const orgId = Option.getOrUndefined(ctx.data.orgId);
  const consumerProject = yield* resolveCommandProject({ mode: 'consumer' }).pipe(
    Effect.mapError(formatResolveCommandProjectError),
    Effect.option
  );
  return yield* ui.output(
    JSON.stringify(
      {
        apiKey,
        orgId: orgId ?? null,
        consumerUserId:
          Option.isSome(consumerProject) && consumerProject.value.projectType === 'CONSUMER'
            ? (consumerProject.value.consumerUserId ?? null)
            : null,
      },
      null,
      2
    ),
    { force: true }
  );
});

const printDetectedMaster = Effect.suspend(() =>
  Effect.flatMap(TerminalUI, ui =>
    ui.output(JSON.stringify({ master: detectMaster() }, null, 2), { force: true })
  )
);

const printDevModeDisabled = Effect.gen(function* () {
  const ui = yield* TerminalUI;
  yield* ui.log.error('Developer mode is off.');
  yield* ui.log.step('Run `composio dev --mode on` in an interactive terminal to enable it.');
});

export const runWithConfig = Effect.gen(function* () {
  const cliUserConfig = yield* ComposioCliUserConfig;
  const visibility: CommandVisibility = {
    isDevModeEnabled: cliUserConfig.isDevModeEnabled(),
    isExperimentalFeatureEnabled: feature => cliUserConfig.isExperimentalFeatureEnabled(feature),
  };
  const version = yield* getVersion;
  const rootCommand = buildRootCommand(visibility);
  // v4's `Command.runWith` (unlike v3's `Command.run`) takes explicit arguments rather than
  // pulling them from `Stdio`, and expects them *without* the node/bun executable + script path
  // prefix — see `cli-main.ts` module docs for the full contract at this boundary.
  const run = Command.runWith(rootCommand, { version });

  // `Command.runWith` renders the help document for a failed parse through the
  // ambient Console's `log` (stdout) before re-failing with `ShowHelp` (see
  // the vendored `Command.ts` `showHelp`). Composio's output contract reserves
  // stdout for data: help belongs there only when the user explicitly asked
  // for it (`--help`/`-h`/`--version`/`-v`). For every other invocation the
  // framework's rendering is decoration, so the runner gets a Console whose
  // `log` writes through `error`. No CLI code emits data via the Effect
  // Console service (handlers write through `TerminalUI`), so this only
  // affects the framework's own help/error rendering.
  const runWithDecorationOnStderr = (args: ReadonlyArray<string>) =>
    Effect.gen(function* () {
      const base = yield* Console.Console;
      return yield* Effect.provideService(run(args), Console.Console, {
        ...base,
        assert: (condition, ...rest) => base.assert(condition, ...rest),
        clear: () => base.clear(),
        count: label => base.count(label),
        countReset: label => base.countReset(label),
        debug: (...rest) => base.debug(...rest),
        dir: (item, options) => base.dir(item, options),
        dirxml: (...rest) => base.dirxml(...rest),
        error: (...rest) => base.error(...rest),
        group: (...rest) => base.group(...rest),
        groupCollapsed: (...rest) => base.groupCollapsed(...rest),
        groupEnd: () => base.groupEnd(),
        info: (...rest) => base.info(...rest),
        log: (...rest) => base.error(...rest),
        table: (tabularData, properties) => base.table(tabularData, properties),
        time: label => base.time(label),
        timeEnd: label => base.timeEnd(label),
        timeLog: (label, ...rest) => base.timeLog(label, ...rest),
        trace: (...rest) => base.trace(...rest),
        warn: (...rest) => base.warn(...rest),
      });
    });

  const EXPLICIT_STDOUT_FLAGS: ReadonlySet<string> = new Set(['--help', '-h', '--version', '-v']);

  const runCli = (args: ReadonlyArray<string>) =>
    args.some(arg => EXPLICIT_STDOUT_FLAGS.has(arg)) ? run(args) : runWithDecorationOnStderr(args);

  const routeRootCommand = (normalizedArgv: ReadonlyArray<string>, dangerouslyAllow: boolean) => {
    const args = normalizedArgv.slice(2);
    if (isRootHelp(normalizedArgv)) {
      return printRootHelp(visibility, parseHelpLevel(normalizedArgv[3]) ?? 'default');
    }
    const subHelp = matchSubcommandHelp(normalizedArgv, visibility);
    if (subHelp) {
      const helpLevel = parseHelpLevel(normalizedArgv[normalizedArgv.length - 1]) ?? 'default';
      return printSubcommandHelp(subHelp, visibility, helpLevel);
    }
    const parallelExecute = runParallelToolsExecuteFromArgv(normalizedArgv);
    if (parallelExecute) {
      return parallelExecute;
    }
    if (isGenerateGraph(normalizedArgv)) {
      return printCommandHintGraph;
    }
    if (isDebugApiInfo(normalizedArgv)) {
      return printDebugApiInfo;
    }
    if (isDebugWhoIsMyMaster(normalizedArgv)) {
      return printDetectedMaster;
    }
    const executeHelpSlug = parseExecuteInputHelpSlug(normalizedArgv);
    if (executeHelpSlug) {
      return showToolsExecuteInputHelp(executeHelpSlug);
    }
    if (!visibility.isDevModeEnabled && args[0] === 'dev' && !isDevModeOnlyInvocation(args)) {
      return printDevModeDisabled;
    }
    if (isDangerousDevCommand(args)) {
      return Effect.gen(function* () {
        const ui = yield* TerminalUI;
        if (!cliUserConfig.areDeveloperDangerousCommandsEnabled()) {
          yield* ui.log.error('This developer command is disabled by config.');
          yield* ui.log.step(
            'Set `developer.destructive_actions` to `true` in `~/.composio/config.json` to allow dangerous developer commands.'
          );
          return;
        }
        if (!dangerouslyAllow) {
          yield* ui.log.error('This developer command requires explicit acknowledgement.');
          yield* ui.log.step('Re-run the command with `--dangerously-allow`.');
          return;
        }
        return yield* runCli(args);
      });
    }
    return runCli(args);
  };

  return (argv: ReadonlyArray<string>) => {
    const { argv: argvWithoutDangerouslyAllow, dangerouslyAllow } =
      normalizeDangerouslyAllowFlag(argv);
    const normalizedArgv = normalizeRunPassthroughArgs(
      normalizeHiddenDebugFlags(
        normalizeListenStreamFlag(normalizeVersionShortFlag(argvWithoutDangerouslyAllow))
      )
    );

    return parseRootInstallSkillRequest(normalizedArgv).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => routeRootCommand(normalizedArgv, dangerouslyAllow),
          onSome: installSkill,
        })
      )
    );
  };
});
