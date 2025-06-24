import ts from 'typescript';
import { Effect, Data } from 'effect';

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
 * TODO: unify with `test/__utils__/typescript-compiler.ts`.
 */
export function transpileTypeScriptSources({ sources, outputDir }: TranspileTypeScriptFilesParams) {
  return Effect.gen(function* () {
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

    const virtualFileMap = new Map(
      sources.map(
        ([filename, code]) =>
          [
            filename,
            ts.createSourceFile(filename, code, compilerOptions.target, true, ts.ScriptKind.TS),
          ] as const
      )
    );
    const virtualFileNames = Array.from(virtualFileMap.keys());
    const tsFiles = sources.map(([filePath, _]) => filePath);

    if (tsFiles.length === 0) {
      return yield* Effect.void;
    }

    const tsHost = ts.createCompilerHost(compilerOptions);
    const ogGetSourceFile = tsHost.getSourceFile;
    tsHost.getSourceFile = (filename, languageVersion, onError, shouldCreateNewSourceFile) => {
      if (virtualFileMap.has(filename)) {
        return virtualFileMap.get(filename);
      }

      return ogGetSourceFile(filename, languageVersion, onError, shouldCreateNewSourceFile);
    };

    const program = ts.createProgram(virtualFileNames, compilerOptions, tsHost);
    const emitResult = program.emit();

    // Check for syntax or semantic errors
    const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);

    if (diagnostics.length > 0) {
      const formatDiagnostic = (diagnostic: ts.Diagnostic): string => {
        if (diagnostic.file && diagnostic.start !== undefined) {
          const { line, character } = ts.getLineAndCharacterOfPosition(
            diagnostic.file,
            diagnostic.start
          );
          const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
          return `${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`;
        } else {
          return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        }
      };

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
