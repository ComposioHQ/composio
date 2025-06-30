import { Command, Options } from '@effect/cli';
import { pipe, Console, Effect, Option } from 'effect';
import { FileSystem } from '@effect/platform';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import type { GetCmdParams } from 'src/type-utils';
import { NodeProcess } from 'src/services/node-process';
import { createToolkitIndex } from 'src/generation/create-toolkit-index';
import { pyFindComposioCoreGenerated } from 'src/effects/find-composio-core-generated';
import { BANNER } from 'src/generation/constants';
import { generatePythonSources } from 'src/generation/python/generate';

export const outputOpt = Options.optional(
  Options.directory('output-dir', {
    exists: 'either',
  })
).pipe(
  Options.withAlias('o'),
  Options.withDescription('Output directory for the generated Python type stubs')
);

const _pyCmd$Generate = Command.make('generate', { outputOpt }).pipe(
  Command.withDescription('Updates the local type stubs with the latest app data.')
);

export const pyCmd$Generate = _pyCmd$Generate.pipe(Command.withHandler(generatePythonTypeStubs));

export function generatePythonTypeStubs({ outputOpt }: GetCmdParams<typeof _pyCmd$Generate>) {
  return Effect.gen(function* () {
    const process = yield* NodeProcess;
    const cwd = process.cwd;
    const fs = yield* FileSystem.FileSystem;
    const client = yield* ComposioToolkitsRepository;

    // Determine the actual output directory
    const outputDir = yield* outputOpt.pipe(
      Option.match({
        // If no output directory is specified, use the default
        onNone: () => pyFindComposioCoreGenerated(cwd),

        // If an output directory is specified, validate and create it
        onSome: outputDir =>
          pipe(
            Effect.succeed(outputDir),
            Effect.tap(fs.makeDirectory(outputDir, { recursive: true }))
          ),
      })
    );

    yield* Effect.log(`Writing type stubs to ${outputDir}...`);

    // Fetch data from Composio API
    yield* Console.log('Fetching latest data from Composio API...');

    const [toolkits, tools, triggerTypes] = yield* Effect.all(
      [
        Effect.logDebug('Fetching toolkits...').pipe(Effect.flatMap(() => client.getToolkits())),
        Effect.logDebug('Fetching tools...').pipe(Effect.flatMap(() => client.getTools())),
        Effect.logDebug('Fetching trigger types...').pipe(
          Effect.flatMap(() => client.getTriggerTypes())
        ),
      ],
      { concurrency: 'unbounded' }
    );

    const index = createToolkitIndex({ toolkits, tools, triggerTypes });

    // Generate Python sources
    const sources = generatePythonSources({
      banner: BANNER,
      outputDir,
    })(index);

    // Write all generated files
    yield* pipe(
      Effect.all(
        sources.map(([filePath, content]) =>
          fs
            .writeFileString(filePath, content)
            .pipe(Effect.mapError(error => new Error(`Failed to write file ${filePath}: ${error}`)))
        ),
        { concurrency: 1 }
      ),
      Effect.mapError(error => new Error(`Failed to write generated files: ${error}`))
    );

    yield* Option.isNone(outputOpt)
      ? Console.log(
          '✅ Type stubs generated successfully.\n' +
            'You can now import generated types via `from composio.generated.<toolkit_name> import <TOOLKIT_NAME>`.\n'
        )
      : Console.log(
          `✅ Type stubs generated successfully.\n` +
            `Generated files are available at: ${outputDir}`
        );

    return outputDir;
  });
}
