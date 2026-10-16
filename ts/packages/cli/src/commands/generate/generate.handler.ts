import { Effect, Match, Option } from 'effect';
import { ProjectEnvironmentDetector } from 'src/services/project-environment-detector';
import { NodeProcess } from 'src/services/node-process';
import { TerminalUI } from 'src/services/terminal-ui';
import { generateTypescriptTypeStubs, resolveTranspiled } from './ts/generate.ts.handler';
import { runGeneratePy } from './py/generate.py.handler';

export type GenerateParams = {
  readonly outputDir: Option.Option<string>;
  readonly typeTools: boolean;
  readonly toolkits: ReadonlyArray<string>;
};

/**
 * Detects the project language in the current directory and runs the matching generator.
 */
export const runGenerate = ({ outputDir, typeTools, toolkits }: GenerateParams) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const process = yield* NodeProcess;
    const cwd = process.cwd;

    yield* Effect.logDebug('Identifying project type...');
    const envDetector = yield* ProjectEnvironmentDetector;
    const env = yield* envDetector.detectProjectEnvironment(cwd);
    const displayLang = env.kind === 'js' ? 'TypeScript' : 'Python';
    yield* ui.log.step(`Project type detected: ${displayLang}`);

    yield* Match.value(env.kind).pipe(
      Match.when('js', () =>
        generateTypescriptTypeStubs({
          outputDir,
          compact: false,
          // `generate` has no --transpiled flag, so the `generate ts` default rule applies.
          transpiled: resolveTranspiled({ transpiled: false, outputDir }),
          typeTools,
          toolkits,
        })
      ),
      Match.when('python', () => runGeneratePy({ outputDir, toolkits })),
      Match.exhaustive
    );
  });
