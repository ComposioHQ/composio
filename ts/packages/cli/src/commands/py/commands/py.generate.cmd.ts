import { Command, Options } from '@effect/cli';
import { pipe, Console, Effect, Option, Array } from 'effect';
import { FileSystem } from '@effect/platform';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { logMetrics } from 'src/effects/log-metrics';
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

export const toolkitsOpt = Options.text('toolkits').pipe(
  Options.repeated,
  Options.withDescription(
    'Only generate types for specific toolkits (e.g., --toolkits gmail --toolkits slack)'
  )
);

const _pyCmd$Generate = Command.make('generate', { outputOpt, toolkitsOpt }).pipe(
  Command.withDescription(
    'Generate Python type stubs for toolkits, tools, and triggers from the Composio API'
  )
);

export const pyCmd$Generate = _pyCmd$Generate.pipe(Command.withHandler(generatePythonTypeStubs));

export function generatePythonTypeStubs({
  outputOpt,
  toolkitsOpt,
}: GetCmdParams<typeof _pyCmd$Generate>) {
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
        onSome: Effect.succeed,
      })
    );

    yield* Effect.log(`Writing type stubs to ${outputDir}...`);
    yield* fs.makeDirectory(outputDir, { recursive: true });

    // Fetch data from Composio API
    yield* Console.log('Fetching latest data from Composio API. This may take a while...');

    // Validate toolkit slugs if specified
    const hasToolkitsFilter = Array.isNonEmptyArray(toolkitsOpt);
    const validatedToolkitSlugs = hasToolkitsFilter
      ? yield* client
          .validateToolkits(toolkitsOpt)
          .pipe(
            Effect.catchTag('services/InvalidToolkitsError', error =>
              Effect.fail(
                new Error(
                  `Invalid toolkit(s): ${error.invalidToolkits.join(', ')}. ` +
                    `Available toolkits: ${error.availableToolkits.slice(0, 10).join(', ')}${error.availableToolkits.length > 10 ? '...' : ''}`
                )
              )
            )
          )
      : [];

    const [allToolkits, tools, triggerTypes] = yield* Effect.all(
      [
        Effect.logDebug('Fetching toolkits...').pipe(Effect.flatMap(() => client.getToolkits())),
        Effect.logDebug('Fetching tools...').pipe(Effect.flatMap(() => client.getToolsAsEnums())),
        Effect.logDebug('Fetching trigger types...').pipe(
          Effect.flatMap(() => client.getTriggerTypes())
        ),
      ],
      { concurrency: 'unbounded' }
    );

    // Filter toolkits if --toolkits was specified
    const toolkits = hasToolkitsFilter
      ? client.filterToolkitsBySlugs(allToolkits, validatedToolkitSlugs)
      : allToolkits;

    if (hasToolkitsFilter) {
      yield* Console.log(
        `Filtering to ${toolkits.length} toolkit(s): ${toolkits.map(t => t.slug).join(', ')}`
      );
    }

    const typeableTools = { withTypes: false as const, tools };

    const index = createToolkitIndex({ toolkits, typeableTools, triggerTypes });

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

    // Log API metrics
    const metrics = yield* client.getMetrics();
    yield* logMetrics(metrics);

    return outputDir;
  });
}
