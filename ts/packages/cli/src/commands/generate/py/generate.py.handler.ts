/**
 * The `composio generate py` command can be configured as follows:
 * - `--output-dir`: Output directory for the generated Python type stubs.
 * - `--toolkits`: Filter output to only include the specified toolkits. Can be specified multiple times (e.g., --toolkits gmail --toolkits slack)
 *
 * Environment variables:
 * - `COMPOSIO_TOOLKIT_VERSION_<TOOLKIT>`: Override a toolkit version (e.g., COMPOSIO_TOOLKIT_VERSION_GMAIL=20250901_00).
 *   Use "latest" or unset to use the latest version.
 */

import { Array, Effect, Option, pipe, String } from 'effect';
import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import { commandInputError } from 'src/commands/errors';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { logMetrics } from 'src/effects/log-metrics';
import { NodeProcess } from 'src/services/node-process';
import { pyFindComposioCoreGenerated } from 'src/effects/find-composio-core-generated';
import { generationOutcome, loadGenerationRuntime } from 'src/effects/generation-runtime';
import {
  getToolkitVersionOverrides,
  type ToolkitVersionOverrides,
} from 'src/effects/toolkit-version-overrides';
import { validateToolkitVersionOverrides } from 'src/effects/validate-toolkit-versions';
import { TerminalUI } from 'src/services/terminal-ui';
import { PythonGenerationWriteError } from './generate.py.errors';

export type GeneratePyParams = {
  readonly outputDir: Option.Option<string>;
  readonly toolkits: ReadonlyArray<string>;
};

const invalidGenerateValue = commandInputError('generate py');

export const runGeneratePy = (params: GeneratePyParams) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const process = yield* NodeProcess;
    const cwd = process.cwd;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const client = yield* ComposioToolkitsRepository;

    yield* ui.intro('composio generate py');

    // Determine the actual output directory
    const outputDir = yield* params.outputDir.pipe(
      Option.match({
        // If no output directory is specified, use the default
        onNone: () => pyFindComposioCoreGenerated(cwd),

        // If an output directory is specified, validate and create it
        onSome: outputDir => {
          const normalizedPath = path.normalize(outputDir);
          if (normalizedPath.includes('node_modules')) {
            return Effect.fail(
              invalidGenerateValue(
                'Output directory cannot be inside node_modules. Please specify a different directory.',
                '--output-dir'
              )
            );
          }
          return Effect.succeed(outputDir);
        },
      })
    );

    yield* ui.log.step(`Writing type stubs to ${outputDir}`);
    yield* fs.makeDirectory(outputDir, { recursive: true });

    // Read toolkit version overrides from environment variables
    const versionOverrides = yield* getToolkitVersionOverrides;

    // Validate toolkit slugs if specified
    const hasToolkitsFilter = Array.isReadonlyArrayNonEmpty(params.toolkits);
    const toolkitSlugsFilter = hasToolkitsFilter ? params.toolkits.map(s => s.toLowerCase()) : null;

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
              .validateToolkits(params.toolkits)
              .pipe(
                Effect.catchTag('services/InvalidToolkitsError', error =>
                  Effect.fail(
                    invalidGenerateValue(
                      `Invalid toolkit(s): ${error.invalidToolkits.join(', ')}. ` +
                        `Available toolkits: ${error.availableToolkits.slice(0, 10).join(', ')}${error.availableToolkits.length > 10 ? '...' : ''}`,
                      '--toolkits'
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
          const normalizedSlug = String.toLowerCase(toolkit.slug);
          const version = validatedOverrides.get(normalizedSlug);
          if (version && version !== 'latest') {
            versionMap.set(normalizedSlug, version);
          }
        }

        const typeableTools = { withTypes: false as const, tools };

        yield* spinner.message('Generating Python type stubs...');
        // The generation pipeline lives in the `generation-runtime` companion
        // module, loaded from disk here so no other command pays for it at startup.
        const generation = yield* loadGenerationRuntime;
        const index = generation.createToolkitIndex({
          toolkits,
          typeableTools,
          triggerTypes,
          versionMap,
        });

        // Generate Python sources
        const sources = yield* generationOutcome(() =>
          generation.generatePythonSourceFiles({ banner: generation.BANNER, outputDir }, index)
        );

        yield* spinner.message('Writing files to disk...');

        // Write all generated files
        yield* pipe(
          Effect.all(
            sources.map(([filePath, content]) =>
              fs.writeFileString(filePath, content).pipe(
                Effect.mapError(
                  cause =>
                    new PythonGenerationWriteError({
                      cause,
                      filePath,
                      message: `Failed to write file ${filePath}`,
                    })
                )
              )
            ),
            { concurrency: 1 }
          )
        );

        yield* spinner.stop('Type stubs generated successfully');
      })
    );

    yield* Option.isNone(params.outputDir)
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
