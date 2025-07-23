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

/**
 * @example
 * ```bash
 * composio generate <command>
 * ```
 */
export const generateCmd = Command.make('generate', { outputOpt }).pipe(
  Command.withDescription(
    'Updates the local type stubs with the latest app data, automatically detecting the language of the project in the current working directory (TypeScript | Python).'
  ),
  Command.withHandler(({ outputOpt }) =>
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
          generateTypescriptTypeStubs({ outputOpt, compact: false, transpiled: false })
        ),
        Match.when('Python', () => generatePythonTypeStubs({ outputOpt })),
        Match.exhaustive
      );
    })
  )
);
