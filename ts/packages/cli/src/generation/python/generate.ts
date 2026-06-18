import type { ToolkitIndex } from 'src/generation/create-toolkit-index';
import type { SourceFile } from 'src/generation/types';
import { safeOutputPath } from 'src/generation/safe-output-path';
import { generatePythonToolkitSources } from './generate-toolkit-sources';

type GeneratePythonSourcesParams = {
  banner: string;
  outputDir: string;
};

export function generatePythonSources(params: GeneratePythonSourcesParams) {
  return (index: ToolkitIndex): Array<SourceFile> => {
    const toolkiteSources = generatePythonToolkitSources(params.banner)(index);

    return [
      ...toolkiteSources.map(
        ([filename, content]) => [safeOutputPath(params.outputDir, filename), content] as const
      ),
    ] as const;
  };
}
