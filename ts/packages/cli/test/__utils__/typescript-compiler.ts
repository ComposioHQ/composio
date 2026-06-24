import { describe, it, expect, vi } from 'vitest';
import { Effect, Stream, String } from 'effect';
import { Command } from '@effect/platform';
import ts from 'typescript';
import {
  buildVirtualFileMap,
  formatDiagnostic,
  patchCompilerHostWithVirtualFiles,
} from 'src/generation/typescript/virtual-compiler-host';

interface AssertTypeScriptIsValidInput {
  files: {
    [filename: string]: string;
  };
}

const VALIDATION_TYPE_STUBS = /* typescript */ `
  type Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  declare module "@composio/core" {
    export type TriggerEvent<TPayload> = { payload: TPayload };
  }
`;

/**
 * Asserts that the provided TypeScript code is syntactically and semantically valid.
 */
export function assertTypeScriptIsValid({ files }: AssertTypeScriptIsValidInput) {
  const compilerOptions = {
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    skipLibCheck: false,
    types: [],
    lib: [],
    jsx: ts.JsxEmit.None,
    isolatedModules: true,
    allowJs: false,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
  } satisfies ts.CompilerOptions;

  const virtualFileMap = buildVirtualFileMap(
    Object.entries({
      './__validation-stubs.d.ts': VALIDATION_TYPE_STUBS,
      ...files,
    }),
    compilerOptions.target
  );
  const virtualFileNames = Array.from(virtualFileMap.keys());

  const tsHost = ts.createCompilerHost(compilerOptions);
  patchCompilerHostWithVirtualFiles(tsHost, virtualFileMap, 'throw');

  const program = ts.createProgram(virtualFileNames, compilerOptions, tsHost);

  // Check for syntax or semantic errors
  const diagnostics = [...program.getSyntacticDiagnostics(), ...program.getSemanticDiagnostics()];

  // Assert that there are no TypeScript errors
  expect(diagnostics.map(formatDiagnostic)).toEqual([]);
}

type AssertTranspiledTypeScriptIsValidInput = {
  cwd: string;
  testSourceCodePath: string;
};

export function assertTranspiledTypeScriptIsValid({
  cwd,
  testSourceCodePath,
}: AssertTranspiledTypeScriptIsValidInput) {
  return Effect.gen(function* () {
    const installCmd = Command.make('node', testSourceCodePath);
    const [exitCode, stdout, stderr] = yield* installCmd.pipe(
      Command.workingDirectory(cwd),
      Command.start,
      Effect.andThen(process =>
        Effect.all(
          [
            // Wait for exit code
            process.exitCode,
            // Get stdout as lines
            process.stdout.pipe(Stream.decodeText(), Stream.runFold(String.empty, String.concat)),
            // Get stderr as lines
            process.stderr.pipe(Stream.decodeText(), Stream.runFold(String.empty, String.concat)),
          ],
          { concurrency: 3 }
        )
      )
    );

    expect(stderr).toBe('');
    expect(exitCode).toBe(0);

    return stdout;
  });
}

if (import.meta.vitest) {
  describe('assertTypeScriptIsValid', () => {
    it('[Given] valid TypeScript code [Then] no errors are found', () => {
      const code = /* typescript */ `
        export const id = <T>(x: T): T => x;
      `;
      assertTypeScriptIsValid({ files: { 'index.ts': code } });
    });

    it('[Given] valid TypeScript code with resolvable imports [Then] no errors are found', () => {
      const doubleSource = /* typescript */ `
        import { multiply } from './multiply.ts';
        
        export const double = (x: number) => multiply(x, 2);
      `;
      const multiplySource = /* typescript */ `
        export const multiply = (x: number, y: number) => x * y;
      `;

      assertTypeScriptIsValid({
        files: { './index.ts': doubleSource, './multiply.ts': multiplySource },
      });
    });

    it('[Given] generated code imports Composio core types [Then] no errors are found', () => {
      const code = /* typescript */ `
        import { type TriggerEvent } from '@composio/core';

        export type Event = TriggerEvent<{ id: string }>;
      `;

      assertTypeScriptIsValid({ files: { 'index.ts': code } });
    });

    it('[Given] invalid TypeScript code [Then] errors are found', () => {
      const code = /* typescript */ `
        export const id<T> = (x: T) => T: x;
      `;
      expect(() => {
        assertTypeScriptIsValid({ files: { 'index.ts': code } });
      }).toThrowError();
    });

    it('[Given] throw fallback [Then] the virtual host does not delegate misses to disk', () => {
      const compilerOptions = {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
      } satisfies ts.CompilerOptions;
      const virtualFileMap = buildVirtualFileMap(
        [['index.ts', 'export const ok = true;']],
        compilerOptions.target
      );
      const tsHost = ts.createCompilerHost(compilerOptions);
      const getSourceFile = vi.fn(() => {
        throw new Error('delegated getSourceFile');
      });
      const fileExists = vi.fn(() => {
        throw new Error('delegated fileExists');
      });

      tsHost.getSourceFile = getSourceFile;
      tsHost.fileExists = fileExists;
      patchCompilerHostWithVirtualFiles(tsHost, virtualFileMap, 'throw');

      expect(tsHost.fileExists('node_modules/@composio/core/index.d.ts')).toBe(false);
      expect(() =>
        tsHost.getSourceFile('node_modules/@composio/core/index.d.ts', compilerOptions.target)
      ).toThrowError('Unexpected filename node_modules/@composio/core/index.d.ts');
      expect(fileExists).not.toHaveBeenCalled();
      expect(getSourceFile).not.toHaveBeenCalled();
    });
  });
}
