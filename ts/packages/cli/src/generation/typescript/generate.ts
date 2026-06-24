import * as ts from '@composio/ts-builders';
import path from 'node:path';
import { safeOutputPath, type SafeOutputPathError } from 'src/generation/safe-output-path';
import type { ToolkitIndex } from 'src/generation/create-toolkit-index';
import type { SourceFile } from 'src/generation/types';
import { generateTypeScriptToolkitSources } from './generate-toolkit-sources';
import { generateIndexSource } from './generate-index-source';
import { Effect } from 'effect';
import type { GenerateTypeFromJsonSchemaError } from './generate-type-from-json-schema';

type GenerateTypeScriptSourcesError = GenerateTypeFromJsonSchemaError | SafeOutputPathError;

type GenerateTypeScriptSourcesParams = {
  banner: string;
  emitSingleFile: boolean;
  outputDir: string;
  importExtension: 'ts' | 'js';
};

export function generateTypeScriptSources(params: GenerateTypeScriptSourcesParams) {
  return (
    index: ToolkitIndex
  ): Effect.Effect<Array<SourceFile>, GenerateTypeScriptSourcesError, never> =>
    Effect.gen(function* () {
      const toolkitSources = yield* generateTypeScriptToolkitSources(params.banner)(index);

      const indexSource = generateIndexSource(params)(index);
      const indexFilename = path.join(params.outputDir, 'index.ts');

      if (!params.emitSingleFile) {
        const safeToolkitSources = yield* Effect.all(
          toolkitSources.map(([filename, content]) =>
            safeOutputPath(params.outputDir, filename).pipe(
              Effect.map(filePath => [filePath, content] as const)
            )
          )
        );

        return [...safeToolkitSources, [indexFilename, indexSource] as const] as const;
      }

      const localToolkitsSources = toolkitSources.map(([_, content]) => content).join('\n');

      const indexSourceSingleFile = `${ts.stringify(ts.docComment(params.banner))}
  ${localToolkitsSources}
  ${indexSource}
  `;
      return [[indexFilename, indexSourceSingleFile] as const];
    });
}
