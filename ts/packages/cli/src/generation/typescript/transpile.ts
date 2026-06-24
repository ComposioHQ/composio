import ts from 'typescript';
import { Effect, Data } from 'effect';
import {
  buildVirtualFileMap,
  patchCompilerHostWithVirtualFiles,
  formatDiagnostic,
} from './virtual-compiler-host';

export class TypeScriptTranspileError extends Data.TaggedError('error/TypeScriptTranspileError')<{
  readonly message: string;
  readonly cause: string;
}> {}

type TranspileTypeScriptFilesParams = {
  sources: (readonly [filePath: string, content: string])[];
  outputDir: string;
};

/**
 * Compiles TypeScript files to JavaScript using the TypeScript compiler.
 */
export function transpileTypeScriptSources({ sources, outputDir }: TranspileTypeScriptFilesParams) {
  return Effect.gen(function* () {
    if (sources.length === 0) {
      return yield* Effect.void;
    }

    const compilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      esModuleInterop: true,
      skipLibCheck: true,
      outDir: outputDir,
      rootDir: outputDir,
      declaration: true,
      emitDeclarationOnly: false,
      noEmitOnError: true,
    } satisfies ts.CompilerOptions;

    const virtualFileMap = buildVirtualFileMap(sources, compilerOptions.target);
    const virtualFileNames = Array.from(virtualFileMap.keys());

    const tsHost = ts.createCompilerHost(compilerOptions);
    patchCompilerHostWithVirtualFiles(tsHost, virtualFileMap, 'delegate');

    const program = ts.createProgram(virtualFileNames, compilerOptions, tsHost);
    const emitResult = program.emit();

    // Check for syntax or semantic errors
    const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);

    if (diagnostics.length > 0) {
      const errorMessages = diagnostics.map(d => formatDiagnostic(d)).join('\n');
      return yield* Effect.fail(
        new TypeScriptTranspileError({
          message: `TypeScript compilation failed`,
          cause: errorMessages,
        })
      );
    }

    return yield* Effect.void;
  });
}
