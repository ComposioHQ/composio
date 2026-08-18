import { Array as Arr, Data, Effect, HashSet, Layer, Option } from 'effect';
import { Command, HelpDoc, ValidationError } from '@effect/cli';
import {
  hasCommandName,
  listSubcommandNames,
  preflightParse,
  type AnyCommandDescriptor,
} from './command-introspection';
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
import { runCmd } from './run.cmd';
import { proxyCmd } from './proxy.cmd';
import { artifactsCmd } from './artifacts.cmd';
import { installCmd } from './install.cmd';
import { localToolsCmd } from './local-tools/local-tools.cmd';
import { generateCmd } from './generate/generate.cmd';
import { buildDevCommand, devSubcommands } from './dev.cmd';
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
import { cliDebugFlagsLayer, type CliDebugFlagOverrides } from 'src/services/runtime-flags';
import { cliRunIdLayer } from 'src/services/runtime-cli-context';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { ComposioUserContext } from 'src/services/user-context';
import { TerminalUI } from 'src/services/terminal-ui';
import { detectMasterFromHost } from 'src/services/master-detector';
import {
  formatResolveCommandProjectError,
  resolveCommandProject,
} from 'src/services/command-project';
import { CLI_EXPERIMENTAL_FEATURES } from 'src/constants';
import { installSkill, type SkillInstallTarget } from 'src/effects/install-skill';
import { experimental, type CommandVisibility, tagged, visibleValues } from './feature-tags';
import { withBackgroundUpdateCheck } from './background-update-check';
import { configureCliAnalyticsReleaseVersion } from 'src/analytics/events';

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

const scopeCommandMismatch = (
  commandPath: string,
  descriptor: AnyCommandDescriptor,
  error: unknown
) => {
  if (!ValidationError.isValidationError(error) || !ValidationError.isCommandMismatch(error)) {
    return error;
  }
  const childNames = listSubcommandNames(descriptor).map(name => `'${name}'`);
  if (childNames.length === 0) return error;

  const oneOf = childNames.length === 1 ? '' : ' one of';
  return ValidationError.commandMismatch(
    HelpDoc.p(
      `Invalid subcommand for composio ${commandPath} - use${oneOf} ${childNames.join(', ')}`
    )
  );
};

const refineRootCommandMismatch = (
  argv: ReadonlyArray<string>,
  visibility: CommandVisibility,
  originalError: ValidationError.ValidationError
) => {
  const rootCommandName = argv[2];
  if (!rootCommandName || !ValidationError.isCommandMismatch(originalError)) {
    return Effect.fail(originalError);
  }

  const rootCommand = Arr.findFirst(getVisibleRootCommands(visibility), command =>
    hasCommandName(command, rootCommandName)
  );
  if (Option.isNone(rootCommand)) {
    return Effect.fail(originalError);
  }

  const nestedCommandName = argv[3];
  const nestedDevCommand =
    rootCommandName === 'dev' && visibility.isDevModeEnabled && nestedCommandName
      ? Arr.findFirst(devSubcommands, command => hasCommandName(command, nestedCommandName))
      : Option.none();
  const descriptor = Option.match(nestedDevCommand, {
    onNone: () => rootCommand.value.descriptor,
    onSome: command => command.descriptor,
  });
  const commandPath = Option.isSome(nestedDevCommand)
    ? `${rootCommandName} ${nestedCommandName}`
    : rootCommandName;

  return Effect.fail(scopeCommandMismatch(commandPath, descriptor, originalError));
};

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

const parseBooleanFlag = (argument: string, name: string): Option.Option<boolean> => {
  if (argument === name || argument === `${name}=true`) {
    return Option.some(true);
  }
  return argument === `${name}=false` ? Option.some(false) : Option.none();
};

/**
 * Splits the hidden debug flags off argv and returns their parsed values.
 *
 * The values are inputs to the command that follows — `src/commands/index.ts` provides them as
 * `CliDebugFlags` — rather than process-wide state, so an explicit `--perf-debug=false` on one
 * invocation cannot leak into the next.
 */
const normalizeHiddenDebugFlags = (
  argv: ReadonlyArray<string>
): { readonly argv: ReadonlyArray<string>; readonly overrides: CliDebugFlagOverrides } => {
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

  return {
    argv: Arr.appendAll(Arr.take(argv, 2), retainedArgs),
    overrides: { perfDebug, toolDebug, acpOnly },
  };
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

const printDetectedMaster = Effect.gen(function* () {
  const ui = yield* TerminalUI;
  const master = yield* detectMasterFromHost;
  yield* ui.output(JSON.stringify({ master }, null, 2), { force: true });
});

const printDevModeDisabled = Effect.gen(function* () {
  const ui = yield* TerminalUI;
  yield* ui.log.error('Developer mode is off.');
  yield* ui.log.step('Run `composio dev --mode on` in an interactive terminal to enable it.');
});

/**
 * Values the CLI bootstrap resolved before the root command runs and that the command tree needs
 * as an input. Empty for callers that drive the root command on their own (tests, `--install-skill`
 * style entry points), which is why every field is optional.
 */
export type RootCommandBootstrap = {
  /** Run id minted for a `composio run` invocation, shared with its telemetry events. */
  readonly runId?: string;
};

export const runWithConfig = Effect.gen(function* () {
  const cliUserConfig = yield* ComposioCliUserConfig;
  const visibility: CommandVisibility = {
    isDevModeEnabled: cliUserConfig.isDevModeEnabled(),
    isExperimentalFeatureEnabled: feature => cliUserConfig.isExperimentalFeatureEnabled(feature),
  };
  const version = yield* getVersion;
  configureCliAnalyticsReleaseVersion(version);
  const rootCommand = withBackgroundUpdateCheck(buildRootCommand(visibility));
  const run = Command.run(rootCommand, {
    name: 'composio',
    executable: 'composio',
    version,
  });

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
        return yield* run(normalizedArgv);
      });
    }
    return preflightParse(rootCommand, normalizedArgv).pipe(
      Effect.matchEffect({
        onFailure: error =>
          ValidationError.isCommandMismatch(error)
            ? refineRootCommandMismatch(normalizedArgv, visibility, error)
            : run(normalizedArgv),
        onSuccess: () => run(normalizedArgv),
      })
    );
  };

  return (argv: ReadonlyArray<string>, bootstrap: RootCommandBootstrap = {}) => {
    const { argv: argvWithoutDangerouslyAllow, dangerouslyAllow } =
      normalizeDangerouslyAllowFlag(argv);
    const { argv: normalizedArgv, overrides } = normalizeHiddenDebugFlags(
      normalizeListenStreamFlag(normalizeVersionShortFlag(argvWithoutDangerouslyAllow))
    );

    return parseRootInstallSkillRequest(normalizedArgv).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => routeRootCommand(normalizedArgv, dangerouslyAllow),
          onSome: installSkill,
        })
      ),
      Effect.provide(Layer.merge(cliDebugFlagsLayer(overrides), cliRunIdLayer(bootstrap.runId)))
    );
  };
});
