import { Context, Effect, Option } from 'effect';
import { CommandSurface, type CommandTree } from 'src/commands/surface';
import { CLI_DEBUG_FLAG_NAMES } from 'src/services/runtime-flags';
import { invalidArguments } from './tools.execute.errors';
import type { ParallelExecuteSpec } from './tools.execute.parallel';

/**
 * The invocation's argv without the executable prefix, as `src/commands/index.ts` hands it to
 * `effect/cli`. Only `--parallel` reads it: `effect/cli` cannot pair each repeated `--data` and
 * `--account` with the tool slug before it.
 */
export const ExecuteInvocationArgs = Context.Reference<ReadonlyArray<string>>(
  'commands/ExecuteInvocationArgs',
  { defaultValue: () => [] }
);

/** What `--parallel` takes from argv itself; `effect/cli` supplies the batch-wide booleans. */
export type ParallelExecuteArgv = {
  readonly specs: ReadonlyArray<ParallelExecuteSpec>;
  readonly userId: Option.Option<string>;
  readonly projectName: Option.Option<string>;
};

/**
 * Parses the argv after the command name into ordered tool slug groups. Boolean flags are
 * accepted and skipped here: their values come from `effect/cli`.
 */
export const parseParallelExecuteArgs = (
  args: ReadonlyArray<string>,
  config: {
    readonly allowUserId: boolean;
    readonly allowProjectName: boolean;
  }
) =>
  Effect.gen(function* () {
    let account = Option.none<string>();
    let userId = Option.none<string>();
    let projectName = Option.none<string>();
    const specs: ParallelExecuteSpec[] = [];
    let currentSpec: ParallelExecuteSpec | null = null;

    const pushCurrentSpec = () => {
      if (!currentSpec) return;
      specs.push(currentSpec);
      currentSpec = null;
    };

    const readValue = (token: string, index: number) => {
      if (token.includes('=')) {
        return Effect.succeed({
          value: token.slice(token.indexOf('=') + 1),
          nextIndex: index,
        });
      }

      const next = args[index + 1];
      if (!next) {
        return Effect.fail(invalidArguments(`Missing value for ${token}.`));
      }
      return Effect.succeed({ value: next, nextIndex: index + 1 });
    };

    for (let i = 0; i < args.length; i += 1) {
      const token = args[i];
      if (!token) continue;

      const flagName = token.split('=')[0];
      if (
        CLI_DEBUG_FLAG_NAMES.some(name => flagName === `--${name}` || flagName === `--no-${name}`)
      )
        continue;
      if (flagName === '--log-level') {
        if (!token.includes('=')) i += 1;
        continue;
      }
      // The framework supplies these values; this parser only preserves tool/data grouping.
      if (
        [
          'parallel',
          'get-schema',
          'dry-run',
          'skip-connection-check',
          'skip-tool-params-check',
          'skip-checks',
        ].some(name => flagName === `--${name}` || flagName === `--no-${name}`) &&
        (token !== flagName || flagName.startsWith('--no-'))
      )
        continue;
      if (
        token === '--parallel' ||
        token === '-p' ||
        token === '--get-schema' ||
        token === '--dry-run' ||
        token === '--skip-connection-check' ||
        token === '--skip-tool-params-check' ||
        token === '--skip-checks'
      ) {
        continue;
      }
      if (token === '--account' || token.startsWith('--account=')) {
        const parsed = yield* readValue(token, i);
        if (currentSpec) {
          currentSpec = {
            slug: currentSpec.slug,
            data: currentSpec.data,
            account: Option.some(parsed.value),
          };
        } else {
          account = Option.some(parsed.value);
        }
        i = parsed.nextIndex;
        continue;
      }
      if (token === '--user-id' || token.startsWith('--user-id=')) {
        if (!config.allowUserId) {
          return yield* Effect.fail(
            invalidArguments(`${token} is not supported for this execute command.`)
          );
        }
        const parsed = yield* readValue(token, i);
        userId = Option.some(parsed.value);
        i = parsed.nextIndex;
        continue;
      }
      if (token === '--project-name' || token.startsWith('--project-name=')) {
        if (!config.allowProjectName) {
          return yield* Effect.fail(
            invalidArguments(`${token} is not supported for this execute command.`)
          );
        }
        const parsed = yield* readValue(token, i);
        projectName = Option.some(parsed.value);
        i = parsed.nextIndex;
        continue;
      }
      if (
        token === '--data' ||
        token === '-d' ||
        token.startsWith('--data=') ||
        token.startsWith('-d=')
      ) {
        if (!currentSpec) {
          return yield* Effect.fail(
            invalidArguments(
              `Expected a tool slug before ${token}. Use: composio execute --parallel TOOL_SLUG -d '{}' TOOL_SLUG_2 -d '{}'.`
            )
          );
        }
        const parsed = yield* readValue(token, i);
        currentSpec = {
          slug: currentSpec.slug,
          data: Option.some(parsed.value),
          account: currentSpec.account,
        };
        i = parsed.nextIndex;
        continue;
      }
      if (token.startsWith('-')) {
        return yield* Effect.fail(
          invalidArguments(`Unknown option for parallel execute: ${token}`)
        );
      }

      pushCurrentSpec();
      currentSpec = {
        slug: token,
        data: Option.none(),
        account,
      };
    }

    pushCurrentSpec();

    if (specs.length === 0) {
      return yield* Effect.fail(
        invalidArguments(
          "No tool slugs were provided. Use: composio execute --parallel TOOL_SLUG -d '{}' TOOL_SLUG_2 -d '{}'."
        )
      );
    }

    return { specs, userId, projectName } satisfies ParallelExecuteArgv;
  });

// Flags that can precede the command name and take the next token as their value
// (`$default.cmd.ts`, `dev.cmd.ts`), so a value equal to the command name is not the command.
const VALUE_FLAGS_BEFORE_COMMAND = new Set([
  '--log-level',
  '--mode',
  '--user-id',
  '--project-name',
]);

/** The index of the command name in argv, skipping a flag value that spells the same word. */
const commandNameIndex = (argv: ReadonlyArray<string>, name: string) =>
  argv.findIndex(
    (token, index) => token === name && !VALUE_FLAGS_BEFORE_COMMAND.has(argv[index - 1] ?? '')
  );

/** Reads the `--parallel` batch from the invocation's argv after the command name. */
export const readParallelExecuteArgv = (tree: CommandTree) =>
  Effect.gen(function* () {
    const argv = yield* ExecuteInvocationArgs;
    const name = tree === 'root' ? 'execute' : 'playground-execute';
    const tail = argv.slice(commandNameIndex(argv, name) + 1);
    const parsed = yield* parseParallelExecuteArgs(tail, {
      allowUserId: tree === 'dev',
      allowProjectName: tree === 'dev',
    });
    // The tail starts after the command name, so the `dev` group's shared flags given before
    // it reach the command only through the surface; the tail's own win.
    const surface = yield* CommandSurface;
    return {
      specs: parsed.specs,
      userId: Option.orElse(parsed.userId, () => surface.userId),
      projectName: Option.orElse(parsed.projectName, () => surface.projectName),
    } satisfies ParallelExecuteArgv;
  });
