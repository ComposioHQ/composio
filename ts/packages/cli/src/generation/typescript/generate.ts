import * as ts from '@composio/ts-builders';
import { safeOutputPath, type SafeOutputPathError } from 'src/generation/safe-output-path';
import type { ToolkitIndex } from 'src/generation/create-toolkit-index';
import type { SourceFile } from 'src/generation/types';
import {
  generateToolkitModules,
  withImports,
  type Flavor,
  type ToolkitModule,
} from './generate-toolkit-sources';
import { generateIndexModule } from './generate-index-source';
import { Effect, Path } from 'effect';
import type { GenerateTypeFromJsonSchemaError } from './generate-type-from-json-schema';

type GenerateTypeScriptSourcesError = GenerateTypeFromJsonSchemaError | SafeOutputPathError;

type GenerateTypeScriptSourcesParams = {
  banner: string;
  emitSingleFile: boolean;
  outputDir: string;
  importExtension: 'ts' | 'js';
  /**
   * Also emit each file as ESM JavaScript (`.js`) and a declaration file (`.d.ts`), next to
   * its TypeScript source.
   */
  transpiled?: boolean;
  /** Write the doc comments printed from tool and trigger schemas; on unless `false`. */
  comments?: boolean;
};

const EXTENSIONS: Readonly<Record<Flavor, string>> = {
  typescript: '.ts',
  javascript: '.js',
  declarations: '.d.ts',
};

// A declaration file that is a module exports every top-level declaration unless it says
// otherwise: `export {}` keeps the per-tool types private.
const KEEP_PRIVATE = '\nexport {};\n';

const withExtension = (filename: string, flavor: Flavor) =>
  filename.replace(/\.ts$/, EXTENSIONS[flavor]);

const uniqueImports = (modules: ReadonlyArray<ToolkitModule>) => {
  const seen = new Set<string>();
  return modules
    .flatMap(module => module.imports)
    .filter(item => {
      const text = ts.stringify(item);
      if (seen.has(text)) return false;
      seen.add(text);
      return true;
    });
};

/** A toolkit's file in one flavor, with the imports that flavor needs. */
const moduleSource = (module: ToolkitModule, flavor: Flavor): string => {
  switch (flavor) {
    case 'typescript':
      return withImports(module.imports, module.body('typescript'));
    case 'javascript':
      // JavaScript keeps no import: the only one a toolkit needs is a type.
      return `${module.body('javascript')}\n`;
    case 'declarations':
      return `${withImports(module.imports, module.body('declarations'))}${KEEP_PRIVATE}`;
  }
};

export function generateTypeScriptSources(params: GenerateTypeScriptSourcesParams) {
  return (
    index: ToolkitIndex
  ): Effect.Effect<Array<SourceFile>, GenerateTypeScriptSourcesError, Path.Path> =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const modules = yield* generateToolkitModules(params.banner, {
        comments: params.comments ?? true,
      })(index);
      const indexModule = generateIndexModule(params)(index);
      const indexFilename = path.join(params.outputDir, 'index.ts');
      const flavors: ReadonlyArray<Flavor> = params.transpiled
        ? ['typescript', 'javascript', 'declarations']
        : ['typescript'];

      if (!params.emitSingleFile) {
        const safeModules = yield* Effect.all(
          modules.map(module =>
            safeOutputPath(params.outputDir, module.filename).pipe(
              Effect.map(filePath => ({ filePath, module }))
            )
          )
        );

        return flavors.flatMap(flavor => [
          ...safeModules.map(({ filePath, module }): SourceFile => [
            withExtension(filePath, flavor),
            moduleSource(module, flavor),
          ]),
          [withExtension(indexFilename, flavor), indexModule[flavor]] as const,
        ]);
      }

      const imports = uniqueImports(modules);
      const banner = ts.stringify(ts.docComment(params.banner));
      const importBlock = withImports(imports, '');
      const bodies = (flavor: Flavor) => modules.map(module => module.body(flavor)).join('\n');
      const singleFile: Record<Flavor, () => string> = {
        typescript: () => `${banner}
${importBlock}  ${bodies('typescript')}
  ${indexModule.typescript}
  `,
        javascript: () => `${banner}
${bodies('javascript')}
${indexModule.javascript}`,
        declarations: () => `${banner}
${importBlock}${bodies('declarations')}
${indexModule.declarations}${KEEP_PRIVATE}`,
      };
      return flavors.map((flavor): SourceFile => [
        withExtension(indexFilename, flavor),
        singleFile[flavor](),
      ]);
    });
}
