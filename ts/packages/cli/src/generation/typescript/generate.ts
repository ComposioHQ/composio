import * as ts from '@composio/ts-builders';
import path from 'node:path';
import type { ToolkitIndex } from 'src/generation/create-toolkit-index';
import { generateTypeScriptToolkitSources } from './generate-toolkit-sources';
import { generateIndexSource } from './generate-index-source';
import { Effect } from 'effect';
import type { GenerateTypeFromJsonSchemaError } from './generate-type-from-json-schema';

type SourceFile = readonly [filename: string, content: string];

type GenerateTypeScriptSourcesParams = {
  banner: string;
  emitSingleFile: boolean;
  outputDir: string;
  importExtension: 'ts' | 'js';
};

export function generateTypeScriptSources(params: GenerateTypeScriptSourcesParams) {
  return (
    index: ToolkitIndex
  ): Effect.Effect<Array<SourceFile>, GenerateTypeFromJsonSchemaError, never> =>
    Effect.gen(function* () {
      const toolkitSources = yield* generateTypeScriptToolkitSources(params.banner)(index);

      const indexSource = generateIndexSource(params)(index);
      const indexFilename = path.join(params.outputDir, 'index.ts');

      if (!params.emitSingleFile) {
        return [
          ...toolkitSources.map(
            ([filename, content]) => [path.join(params.outputDir, filename), content] as const
          ),
          [indexFilename, indexSource] as const,
        ] as const;
      }

      const localToolkitsSources = toolkitSources.map(([_, content]) => content).join('\n');

      const indexSourceSingleFile = `${ts.stringify(ts.docComment(params.banner))}
  ${localToolkitsSources}
  ${indexSource}
  `;
      return [[indexFilename, indexSourceSingleFile] as const];
    });
}
