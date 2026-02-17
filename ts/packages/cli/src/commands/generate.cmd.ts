import { Command, Options } from '@effect/cli';
import { Effect, Console, Match } from 'effect';
import { EnvLangDetector } from 'src/services/env-lang-detector';
import { NodeProcess } from 'src/services/node-process';
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
      const process = yield* NodeProcess;
      const cwd = process.cwd;

      yield* Effect.logDebug('Identifying project type...');
      const envLangDetector = yield* EnvLangDetector;
      const envLang = yield* envLangDetector.detectEnvLanguage(cwd);
      yield* Console.log(`Project type detected: ${envLang}`);

      // Redirect to either `ts generate` or `py generate` commands
      yield* Match.value(envLang).pipe(
        Match.when('TypeScript', () =>
          generateTypescriptTypeStubs({
            outputOpt,
            compact: false,
            transpiled: false,
            typeTools,
            toolkitsOpt,
          })
        ),
        Match.when('Python', () => generatePythonTypeStubs({ outputOpt, toolkitsOpt })),
        Match.exhaustive
      );
    })
  )
);
