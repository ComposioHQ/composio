import process from 'node:process';
import { Effect, Option } from 'effect';
import { Command } from '@effect/cli';
import { $defaultCmd } from './$default.cmd';
import { getVersion } from 'src/effects/version';
import { versionCmd } from './version.cmd';
import { upgradeCmd } from './upgrade.cmd';
import { whoamiCmd } from './whoami.cmd';
import { loginCmd } from './login.cmd';
import { listenCmd } from './listen.cmd';
import { logoutCmd } from './logout.cmd';
import { runCmd } from './run.cmd';
import { proxyCmd } from './proxy.cmd';
import { artifactsCmd } from './artifacts.cmd';
import { installCmd } from './install.cmd';
import { generateCmd } from './generate/generate.cmd';
import { devCmd } from './dev.cmd';
import {
  runParallelToolsExecuteFromArgv,
  showToolsExecuteInputHelp,
} from './tools/commands/tools.execute.cmd';
import { printRootHelp, matchSubcommandHelp, printSubcommandHelp } from './root-help';
import { rootToolsCmd$Search } from './tools/commands/tools.search.cmd';
import { rootToolsCmd$Execute } from './tools/commands/tools.execute.cmd';
import { rootToolsCmd } from './tools/tools.cmd';
import { rootTriggersCmd } from './triggers/root-triggers.cmd';
import { rootConnectedAccountsCmd$Link } from './connected-accounts/commands/connected-accounts.link.cmd';
import { orgsCmd } from './orgs/orgs.cmd';
import { configCmd } from './config/config.cmd';
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
import {
  experimental,
  type CommandVisibility,
  type TaggedValue,
  tagged,
  visibleValues,
} from './feature-tags';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ROOT_COMMANDS: ReadonlyArray<TaggedValue<Command.Command<any, any, any, any>>> = [
  tagged(versionCmd),
  tagged(upgradeCmd),
  tagged(whoamiCmd),
  tagged(loginCmd),
  experimental(CLI_EXPERIMENTAL_FEATURES.LISTEN, listenCmd),
  tagged(logoutCmd),
  tagged(runCmd),
  tagged(proxyCmd),
  tagged(artifactsCmd),
  tagged(installCmd),
  tagged(devCmd),
  tagged(rootToolsCmd),
  tagged(rootTriggersCmd),
  tagged(rootToolsCmd$Search),
  tagged(rootConnectedAccountsCmd$Link),
  tagged(rootToolsCmd$Execute),
  tagged(generateCmd),
  tagged(orgsCmd),
  tagged(configCmd),
];

export const buildRootCommand = (visibility: CommandVisibility) => {
  const subcommands = visibleValues(ROOT_COMMANDS, visibility);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return $defaultCmd.pipe(Command.withSubcommands(subcommands as any));
};

const parseExecuteInputHelpSlug = (argv: ReadonlyArray<string>): string | undefined => {
  const args = argv.slice(2);
  const isRootExecute = args[0] === 'execute';
  const isDevExecute = args[0] === 'dev' && args[1] === 'playground-execute';
  if (!isRootExecute && !isDevExecute) return undefined;

  const hasHelp = args.includes('--help') || args.includes('-h');
  if (!hasHelp) return undefined;

  const tail = isRootExecute ? args.slice(1) : args.slice(2);
  for (let i = 0; i < tail.length; i += 1) {
    const token = tail[i];
    if (!token) continue;

    // Stop option parsing after "--" and treat next positional as slug.
    if (token === '--') {
      const candidate = tail[i + 1];
      return candidate && !candidate.startsWith('-') ? candidate : undefined;
    }

    // Ignore help flags.
    if (token === '--help' || token === '-h') {
      continue;
    }

    // Skip known execute option values.
    if (
      token === '--data' ||
      token === '-d' ||
      token === '--parallel' ||
      token === '-p' ||
      token === '--user-id' ||
      token === '--project-name'
    ) {
      i += 1;
      continue;
    }
    if (
      token.startsWith('--data=') ||
      token.startsWith('-d=') ||
      token === '--parallel' ||
      token === '-p' ||
      token.startsWith('--user-id=') ||
      token.startsWith('--project-name=')
    ) {
      continue;
    }

    // Skip unknown flags.
    if (token.startsWith('-')) {
      continue;
    }

    // First positional token is the slug.
    return token;
  }

  return undefined;
};

const normalizeVersionShortFlag = (argv: ReadonlyArray<string>): ReadonlyArray<string> => {
  const args = argv.slice(2);
  if (args.length === 1 && args[0] === '-v') {
    return [...argv.slice(0, 2), '--version'];
  }
  return argv;
};

const normalizeListenStreamFlag = (argv: ReadonlyArray<string>): ReadonlyArray<string> => {
  const head = argv.slice(0, 2);
  const args = argv.slice(2);
  const isListen = args[0] === 'listen';
  if (!isListen) {
    return argv;
  }

  const normalized: string[] = [...head];
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token !== '--stream') {
      normalized.push(token ?? '');
      continue;
    }

    const next = args[i + 1];
    if (next === undefined || next.startsWith('-')) {
      normalized.push('--stream=');
      continue;
    }

    normalized.push(token);
  }

  return normalized;
};

const normalizeHiddenDebugFlags = (argv: ReadonlyArray<string>): ReadonlyArray<string> => {
  const normalized: string[] = [...argv.slice(0, 2)];
  const args = argv.slice(2);
  let perfDebug: boolean | undefined;
  let toolDebug: boolean | undefined;
  let acpOnly: boolean | undefined;

  for (const arg of args) {
    if (arg === '--perf-debug') {
      perfDebug = true;
      continue;
    }
    if (arg === '--tool-debug') {
      toolDebug = true;
      continue;
    }
    if (arg === '--perf-debug=false') {
      perfDebug = false;
      continue;
    }
    if (arg === '--tool-debug=false') {
      toolDebug = false;
      continue;
    }
    if (arg === '--perf-debug=true') {
      perfDebug = true;
      continue;
    }
    if (arg === '--tool-debug=true') {
      toolDebug = true;
      continue;
    }
    if (arg === '--acp-only') {
      acpOnly = true;
      continue;
    }
    if (arg === '--acp-only=false') {
      acpOnly = false;
      continue;
    }
    if (arg === '--acp-only=true') {
      acpOnly = true;
      continue;
    }
    normalized.push(arg);
  }

  resetRuntimeDebugFlags();
  setRuntimeDebugFlags({
    ...(perfDebug === undefined ? {} : { perfDebug }),
    ...(toolDebug === undefined ? {} : { toolDebug }),
  });
  if (acpOnly === undefined) {
    delete process.env.COMPOSIO_RUN_ACP_ONLY;
  } else {
    process.env.COMPOSIO_RUN_ACP_ONLY = acpOnly ? '1' : '0';
  }

  return normalized;
};

const isRootHelp = (argv: ReadonlyArray<string>): boolean => {
  const args = argv.slice(2);
  return args.length === 0 || (args.length === 1 && (args[0] === '--help' || args[0] === '-h'));
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

export const runWithConfig = Effect.gen(function* () {
  const cliUserConfig = yield* ComposioCliUserConfig;
  const visibility: CommandVisibility = {
    isExperimentalFeatureEnabled: feature => cliUserConfig.isExperimentalFeatureEnabled(feature),
  };
  const version = yield* getVersion;
  const rootCommand = buildRootCommand(visibility);
  const run = Command.run(rootCommand, {
    name: 'composio',
    executable: 'composio',
    version,
  });

  return (argv: ReadonlyArray<string>) => {
    const normalizedArgv = normalizeHiddenDebugFlags(
      normalizeListenStreamFlag(normalizeVersionShortFlag(argv))
    );
    if (isRootHelp(normalizedArgv)) {
      return printRootHelp(visibility);
    }
    const subHelp = matchSubcommandHelp(normalizedArgv, visibility);
    if (subHelp) {
      return printSubcommandHelp(subHelp, visibility);
    }
    const parallelExecute = runParallelToolsExecuteFromArgv(normalizedArgv);
    if (parallelExecute) {
      return parallelExecute;
    }
    if (isGenerateGraph(normalizedArgv)) {
      return Effect.sync(() => {
        process.stdout.write(`${JSON.stringify(renderCommandHintGraph(), null, 2)}\n`);
      });
    }
    if (isDebugApiInfo(normalizedArgv)) {
      return Effect.gen(function* () {
        const ui = yield* TerminalUI;
        const confirmed = yield* ui.confirm(
          'This will print your current CLI API key and scoped identifiers to stdout. Continue?',
          { defaultValue: false }
        );
        if (!confirmed) {
          return yield* Effect.fail(new Error('Aborted printing API credentials.'));
        }
        const ctx = yield* ComposioUserContext;
        const apiKey = Option.getOrUndefined(ctx.data.apiKey);
        if (!apiKey) {
          return yield* Effect.fail(new Error('No user API key found in the current CLI session.'));
        }
        const orgId = Option.getOrUndefined(ctx.data.orgId);
        const consumerProject = yield* resolveCommandProject({ mode: 'consumer' }).pipe(
          Effect.mapError(formatResolveCommandProjectError),
          Effect.option
        );
        return yield* Effect.sync(() => {
          process.stdout.write(
            `${JSON.stringify(
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
            )}\n`
          );
        });
      });
    }
    if (isDebugWhoIsMyMaster(normalizedArgv)) {
      return Effect.sync(() => {
        process.stdout.write(`${JSON.stringify({ master: detectMaster() }, null, 2)}\n`);
      });
    }
    const executeHelpSlug = parseExecuteInputHelpSlug(normalizedArgv);
    if (executeHelpSlug) {
      return showToolsExecuteInputHelp(executeHelpSlug);
    }
    return run(normalizedArgv);
  };
});
