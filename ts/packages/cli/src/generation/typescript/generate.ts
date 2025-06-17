import * as ts from '@composio/ts-builders';
import path from 'node:path';
import type { ToolkitIndex } from 'src/generation/create-toolkit-index';
import { generateTypeScriptToolkitSources } from './generate-toolkit-sources';
import { generateIndexSource } from './generate-index-source';

type GenerateTypeScriptSourcesParams = {
  banner: string;
  emitSingleFile: boolean;
  outputDir: string;
};

export function generateTypeScriptSources(params: GenerateTypeScriptSourcesParams) {
  return (index: ToolkitIndex): Array<readonly [string, string]> => {
    const toolkiteSources = generateTypeScriptToolkitSources(params)(index);

    const indexSource = generateIndexSource(params)(index);
    const indexFilename = path.join(params.outputDir, 'index.ts');

    if (!params.emitSingleFile) {
      return [
        ...toolkiteSources.map(
          ([filename, content]) => [path.join(params.outputDir, filename), content] as const
        ),
        [indexFilename, indexSource] as const,
      ] as const;
    }

    const localToolkitsSources = toolkiteSources.map(([_, content]) => content).join('\n');

    const indexSourceSingleFile = `${ts.stringify(ts.docComment(params.banner))}
${localToolkitsSources}
${indexSource}
`;
    return [[indexFilename, indexSourceSingleFile] as const];
  };
}
