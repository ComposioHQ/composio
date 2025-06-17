import path from 'node:path';
import { Command, Options } from '@effect/cli';
import { Console, Effect, Option } from 'effect';
import { FileSystem } from '@effect/platform';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import type { GetCmdParams } from 'src/type-utils';
import { NodeProcess } from 'src/services/node-process';
import { createToolkitIndex } from 'src/generation/create-toolkit-index';
import { generatePythonToolkitSources } from 'src/generation/python/generate-toolkit-sources';

export const outputOpt = Options.optional(
  Options.directory('output-dir', {
    exists: 'either',
  })
).pipe(
  Options.withAlias('o'),
  Options.withDescription(
    'Output directory for the generated Python type stubs (default: `./.generated/composio-py`)'
  )
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

    const output = outputOpt.pipe(
      Option.getOrElse(() => path.join(cwd, '.generated', 'composio-py'))
    );
    yield* fs.makeDirectory(output, { recursive: true });

    yield* Console.log('Fetching latest data from Composio API...');
    const client = yield* ComposioToolkitsRepository;

    yield* Effect.logDebug('Fetching toolkits...');
    const toolkits = yield* client.getToolkits();

    yield* Effect.logDebug('Fetching tools...');
    const tools = yield* client.getTools();

    yield* Effect.logDebug('Fetching trigger types...');
    const triggerTypes = yield* client.getTriggerTypes();

    const index = createToolkitIndex({ toolkits, tools, triggerTypes });
    const sourceFiles = generatePythonToolkitSources(index).map(
      ([filename, content]) => [path.join(output, filename), content] as const
    );

    yield* Console.log(`Writing type stubs to ${output}...`);

    yield* Effect.all(
      sourceFiles.map(([filePath, content]) => fs.writeFileString(filePath, content))
    );

    return yield* Console.log('✅ Type stubs generated successfully.');
  });
}
