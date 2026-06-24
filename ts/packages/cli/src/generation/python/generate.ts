import type { ToolkitIndex } from 'src/generation/create-toolkit-index';
import type { SourceFile } from 'src/generation/types';
import { Effect } from 'effect';
import { safeOutputPath, type SafeOutputPathError } from 'src/generation/safe-output-path';
import { generatePythonToolkitSources } from './generate-toolkit-sources';

type GeneratePythonSourcesParams = {
  banner: string;
  outputDir: string;
};

export function generatePythonSources(params: GeneratePythonSourcesParams) {
  return (index: ToolkitIndex): Effect.Effect<Array<SourceFile>, SafeOutputPathError> => {
    const toolkiteSources = generatePythonToolkitSources(params.banner)(index);

    return Effect.all(
      toolkiteSources.map(([filename, content]) =>
        safeOutputPath(params.outputDir, filename).pipe(
          Effect.map(filePath => [filePath, content] as const)
        )
      )
    );
  };
}
