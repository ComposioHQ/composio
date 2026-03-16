import { Command, Options } from '@effect/cli';
import { pipe, Effect, Option, Array } from 'effect';
import { FileSystem } from '@effect/platform';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { logMetrics } from 'src/effects/log-metrics';
import type { GetCmdParams } from 'src/type-utils';
import { NodeProcess } from 'src/services/node-process';
import { createToolkitIndex } from 'src/generation/create-toolkit-index';
import { pyFindComposioCoreGenerated } from 'src/effects/find-composio-core-generated';
import { BANNER } from 'src/generation/constants';
import { generatePythonSources } from 'src/generation/python/generate';
import {
  getToolkitVersionOverrides,
  type ToolkitVersionOverrides,
} from 'src/effects/toolkit-version-overrides';
import { validateToolkitVersionOverrides } from 'src/effects/validate-toolkit-versions';
import { TerminalUI } from 'src/services/terminal-ui';

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
    'Generate Python type stubs for toolkits, tools, and triggers from the Composio API.\n\n' +
      'Environment Variables:\n' +
      '  COMPOSIO_TOOLKIT_VERSION_<TOOLKIT>  Override toolkit version (e.g., COMPOSIO_TOOLKIT_VERSION_GMAIL=20250901_00)\n' +
      '                                      Use "latest" or unset to use the latest version.'
  )
);

export const pyCmd$Generate = _pyCmd$Generate.pipe(Command.withHandler(generatePythonTypeStubs));

export function generatePythonTypeStubs({
  outputOpt,
  toolkitsOpt,
}: GetCmdParams<typeof _pyCmd$Generate>) {
  return Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const process = yield* NodeProcess;
    const cwd = process.cwd;
    const fs = yield* FileSystem.FileSystem;
    const client = yield* ComposioToolkitsRepository;

    yield* ui.intro('composio py generate');

    // Determine the actual output directory
    const outputDir = yield* outputOpt.pipe(
      Option.match({
        // If no output directory is specified, use the default
        onNone: () => pyFindComposioCoreGenerated(cwd),

        // If an output directory is specified, validate and create it
        onSome: Effect.succeed,
      })
    );

    yield* ui.log.step(`Writing type stubs to ${outputDir}`);
    yield* fs.makeDirectory(outputDir, { recursive: true });

    // Read toolkit version overrides from environment variables
    const versionOverrides = yield* getToolkitVersionOverrides;

    // Validate toolkit slugs if specified
    const hasToolkitsFilter = Array.isNonEmptyArray(toolkitsOpt);
    const toolkitSlugsFilter = hasToolkitsFilter ? toolkitsOpt.map(s => s.toLowerCase()) : null;

    // Validate toolkit version overrides before fetching data
    const { validatedOverrides } = yield* validateToolkitVersionOverrides({
      versionOverrides,
      toolkitSlugsFilter,
      client,
    });

    // Fetch, generate, and write with a spinner that auto-cleans up on error
    yield* ui.useMakeSpinner('Fetching data from Composio API...', spinner =>
      Effect.gen(function* () {
        // Validate toolkit slugs if specified (separate from version validation)
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
            Effect.logDebug('Fetching toolkits...').pipe(
              Effect.flatMap(() => client.getToolkits())
            ),
            Effect.logDebug('Fetching tools...').pipe(
              Effect.flatMap(() => client.getToolsAsEnums())
            ),
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
          yield* spinner.message(
            `Found ${toolkits.length} toolkit(s): ${toolkits.map(t => t.slug).join(', ')}`
          );
        }

        // Build version map for toolkits being generated (using validated overrides)
        const versionMap: ToolkitVersionOverrides = new Map();
        for (const toolkit of toolkits) {
          const version = validatedOverrides.get(toolkit.slug.toLowerCase() as Lowercase<string>);
          if (version && version !== 'latest') {
            versionMap.set(toolkit.slug.toLowerCase() as Lowercase<string>, version);
          }
        }

        const typeableTools = { withTypes: false as const, tools };

        yield* spinner.message('Generating Python type stubs...');
        const index = createToolkitIndex({ toolkits, typeableTools, triggerTypes, versionMap });

        // Generate Python sources
        const sources = generatePythonSources({
          banner: BANNER,
          outputDir,
        })(index);

        yield* spinner.message('Writing files to disk...');

        // Write all generated files
        yield* pipe(
          Effect.all(
            sources.map(([filePath, content]) =>
              fs
                .writeFileString(filePath, content)
                .pipe(
                  Effect.mapError(error => new Error(`Failed to write file ${filePath}: ${error}`))
                )
            ),
            { concurrency: 1 }
          ),
          Effect.mapError(error => new Error(`Failed to write generated files: ${error}`))
        );

        yield* spinner.stop('Type stubs generated successfully');
      })
    );

    yield* Option.isNone(outputOpt)
      ? ui.note(
          'from composio.generated.<toolkit_name> import <TOOLKIT_NAME>',
          'Import your generated types'
        )
      : ui.log.info(`Generated files are available at: ${outputDir}`);

    // Log API metrics
    const metrics = yield* client.getMetrics();
    yield* logMetrics(metrics);

    yield* ui.outro('Done');
    yield* ui.output(outputDir);

    return outputDir;
  });
}
