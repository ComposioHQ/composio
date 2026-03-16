import { Command, Options } from '@effect/cli';
import { Effect, Match } from 'effect';
import { ProjectEnvironmentDetector } from 'src/services/project-environment-detector';
import { NodeProcess } from 'src/services/node-process';
import { TerminalUI } from 'src/services/terminal-ui';
import { generateTypescriptTypeStubs } from './ts/commands/ts.generate.cmd';
import { generatePythonTypeStubs } from './py/commands/py.generate.cmd';

export const outputOpt = Options.optional(
  Options.directory('output-dir', {
    exists: 'either',
  })
).pipe(Options.withAlias('o'), Options.withDescription('Output directory for type stubs'));

export const typeTools = Options.boolean('type-tools').pipe(
  Options.withDefault(false),
  Options.withDescription(
    'Generate typed input/output schemas for each tool (TypeScript only, slower)'
  )
);

export const toolkitsOpt = Options.text('toolkits').pipe(
  Options.repeated,
  Options.withDescription(
    'Only generate types for specific toolkits (e.g., --toolkits gmail --toolkits slack)'
  )
);

/**
 * @example
 * ```bash
 * composio generate <command>
 * ```
 */
export const generateCmd = Command.make('generate', { outputOpt, typeTools, toolkitsOpt }).pipe(
  Command.withDescription(
    'Generate type stubs for toolkits, tools, and triggers, auto-detecting project language (TypeScript | Python)'
  ),
  Command.withHandler(({ outputOpt, typeTools, toolkitsOpt }) =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const process = yield* NodeProcess;
      const cwd = process.cwd;

      yield* Effect.logDebug('Identifying project type...');
      const envDetector = yield* ProjectEnvironmentDetector;
      const env = yield* envDetector.detectProjectEnvironment(cwd);
      const displayLang = env.kind === 'js' ? 'TypeScript' : 'Python';
      yield* ui.log.step(`Project type detected: ${displayLang}`);

      // Redirect to either `ts generate` or `py generate` commands
      yield* Match.value(env.kind).pipe(
        Match.when('js', () =>
          generateTypescriptTypeStubs({
            outputOpt,
            compact: false,
            transpiled: false,
            typeTools,
            toolkitsOpt,
          })
        ),
        Match.when('python', () => generatePythonTypeStubs({ outputOpt, toolkitsOpt })),
        Match.exhaustive
      );
    })
  )
);
