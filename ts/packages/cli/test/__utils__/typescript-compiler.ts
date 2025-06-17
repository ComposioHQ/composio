import { describe, it, expect } from 'vitest';
import ts from 'typescript';

interface AssertTypeScriptIsValidInput {
  files: {
    [filename: string]: string;
  };
}

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

  const virtualFileMap = new Map(
    Object.entries(files).map(
      ([filename, code]) =>
        [
          filename,
          ts.createSourceFile(filename, code, compilerOptions.target, true, ts.ScriptKind.TS),
        ] as const
    )
  );
  const virtualFileNames = Array.from(virtualFileMap.keys());

  const tsHost = ts.createCompilerHost(compilerOptions);
  tsHost.getSourceFile = (filename, _languageVersion) => {
    if (virtualFileMap.has(filename)) {
      return virtualFileMap.get(filename);
    }

    if (virtualFileMap.has(`./${filename}`)) {
      return virtualFileMap.get(filename);
    }

    throw new Error(`Unexpected filename ${filename}`);
  };

  const program = ts.createProgram(virtualFileNames, compilerOptions, tsHost);

  // Check for syntax or semantic errors
  const diagnostics = [...program.getSyntacticDiagnostics(), ...program.getSemanticDiagnostics()];

  // Assert that there are no TypeScript errors
  expect(diagnostics).toEqual([]);
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

    it('[Given] invalid TypeScript code [Then] errors are found', () => {
      const code = /* typescript */ `
        export const id<T> = (x: T) => T: x;
      `;
      expect(() => {
        assertTypeScriptIsValid({ files: { 'index.ts': code } });
      }).toThrowError();
    });
  });
}
