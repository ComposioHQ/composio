import { isAbsolute } from 'node:path';
import ts from 'typescript6';

/**
 * Workspace packages the checker resolves from source. CI installs without building, and a stale
 * local build could pass broken code, so their built output is hidden rather than used as a fallback.
 */
const sourcePackages = (coreRoot: string) => [
  { name: '@composio/core', root: ts.sys.resolvePath(coreRoot) },
  {
    name: '@composio/json-schema-to-zod',
    root: ts.sys.resolvePath(`${coreRoot}/../json-schema-to-zod`),
  },
];

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type ResolutionMode = 'workspace' | 'built';

const readJson = (path: string): unknown => {
  const { config, error } = ts.readConfigFile(path, fileName => ts.sys.readFile(fileName));
  if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
  return config;
};

const exportedTypes = (target: unknown): string | undefined =>
  typeof target === 'string'
    ? target
    : isRecord(target)
      ? exportedTypes(target.types ?? target.default)
      : undefined;

const packageExports = (root: string) => {
  const manifest = readJson(`${root}/package.json`);
  return isRecord(manifest) && isRecord(manifest.exports) ? manifest.exports : {};
};

const exportPaths = (name: string, root: string) => {
  const exports = packageExports(root);
  const paths: Record<string, string[]> = {};
  for (const [subpath, target] of Object.entries(exports)) {
    const types = exportedTypes(target);
    if (types === undefined) continue;
    const source = types.replace(/^\.\/dist\/(.*)\.d\.mts$/, './src/$1.ts');
    paths[subpath === '.' ? name : `${name}/${subpath.slice(2)}`] = [
      ts.sys.resolvePath(`${root}/${source}`),
    ];
  }
  return paths;
};

const corePrivateImportPaths = (coreRoot: string) => {
  const tsconfig = readJson(`${coreRoot}/tsconfig.json`);
  const paths =
    isRecord(tsconfig) &&
    isRecord(tsconfig.compilerOptions) &&
    isRecord(tsconfig.compilerOptions.paths)
      ? tsconfig.compilerOptions.paths
      : {};
  return Object.fromEntries(
    Object.entries(paths).map(([specifier, targets]) => [
      specifier,
      (Array.isArray(targets) ? targets : []).map(target =>
        ts.sys.resolvePath(`${coreRoot}/${target}`)
      ),
    ])
  );
};

export const referenceCompilerOptions = (
  mode: ResolutionMode = 'workspace'
): ts.CompilerOptions => ({
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  moduleDetection: ts.ModuleDetectionKind.Force,
  jsx: ts.JsxEmit.Preserve,
  strict: true,
  esModuleInterop: true,
  skipLibCheck: mode === 'workspace',
  resolveJsonModule: true,
  noUncheckedSideEffectImports: true,
  noEmit: true,
  types: ['node'],
});

const CORE_NAME = '@composio/core';
const isPackageImport = (specifier: string, name: string) =>
  specifier === name || specifier.startsWith(`${name}/`);

export const createReferenceHost = (
  options: ts.CompilerOptions,
  coreRoot: string,
  files: ReadonlyMap<string, string>,
  mode: ResolutionMode = 'workspace'
): ts.CompilerHost => {
  const base = ts.createCompilerHost(options, true);
  const packages = mode === 'workspace' ? sourcePackages(coreRoot) : [];
  const hidden = packages.flatMap(({ name, root }) => [
    `${root}/dist/`,
    `/node_modules/${name}/dist/`,
  ]);
  const isHidden = (fileName: string) => hidden.some(part => fileName.includes(part));
  const exports = mode === 'built' ? packageExports(coreRoot) : {};
  const sourcePaths = Object.fromEntries(
    packages.flatMap(({ name, root }) => Object.entries(exportPaths(name, root)))
  );
  const publicOptions = { ...options, paths: sourcePaths };
  const internalOptions =
    mode === 'workspace' ? { ...options, paths: corePrivateImportPaths(coreRoot) } : options;
  const host: ts.CompilerHost = {
    ...base,
    fileExists: fileName =>
      files.has(fileName) || (!isHidden(fileName) && base.fileExists(fileName)),
    readFile: fileName =>
      files.get(fileName) ?? (isHidden(fileName) ? undefined : base.readFile(fileName)),
    getSourceFile: (fileName, languageVersion, onError, shouldCreate) => {
      const text = files.get(fileName);
      if (text !== undefined) return ts.createSourceFile(fileName, text, languageVersion, true);
      return isHidden(fileName)
        ? undefined
        : base.getSourceFile(fileName, languageVersion, onError, shouldCreate);
    },
  };

  const canonical = (file: string) => host.realpath?.(file) ?? file;
  const packageRoot = canonical(coreRoot);
  const cache = ts.createModuleResolutionCache(base.getCurrentDirectory(), fileName =>
    base.getCanonicalFileName(fileName)
  );
  host.resolveModuleNameLiterals = (literals, importer, redirected, _, source) =>
    literals.map(literal => {
      const specifier = literal.text;
      const fence = files.has(importer);
      const resolutionMode = ts.getModeForUsageLocation(source, literal, options);
      const resolveFrom = (from: string, settings: ts.CompilerOptions) =>
        ts.resolveModuleName(specifier, from, settings, host, cache, redirected, resolutionMode);
      const missing = { resolvedModule: undefined };

      // Each fence is a standalone consumer. Only SDK-internal source imports get the private aliases.
      if (
        fence &&
        (specifier.startsWith('.') || specifier.startsWith('#') || isAbsolute(specifier))
      ) {
        return missing;
      }
      if (packages.some(({ name }) => isPackageImport(specifier, name))) {
        const target = sourcePaths[specifier]?.[0];
        if (!target || !host.fileExists(target)) return missing;
        const result = resolveFrom(importer, publicOptions);
        const resolved = result.resolvedModule?.resolvedFileName;
        return resolved && canonical(resolved) === canonical(target) ? result : missing;
      }
      if (fence && mode === 'built' && isPackageImport(specifier, CORE_NAME)) {
        const subpath = specifier === CORE_NAME ? '.' : `.${specifier.slice(CORE_NAME.length)}`;
        if (!Object.hasOwn(exports, subpath)) return missing;
        // Use the selected package's self-reference so TypeScript applies the real export
        // conditions, even when another copy is installed in the consumer's node_modules.
        const result = resolveFrom(`${coreRoot}/package.json`, options);
        const target = result.resolvedModule?.resolvedFileName;
        return target &&
          canonical(target).startsWith(`${packageRoot}/`) &&
          /\.d\.[cm]?ts$/.test(target)
          ? result
          : missing;
      }
      return resolveFrom(
        importer,
        !fence && importer.startsWith(`${coreRoot}/src/`) ? internalOptions : options
      );
    });
  return host;
};

export interface Compilation {
  readonly program: ts.Program;
  readonly fileDiagnostics: ReadonlyMap<string, ReadonlyArray<ts.Diagnostic>>;
  readonly programDiagnostics: ReadonlyArray<ts.Diagnostic>;
}

export const compile = (
  files: ReadonlyMap<string, string>,
  options: ts.CompilerOptions,
  coreRoot: string,
  mode: ResolutionMode = 'workspace',
  oldProgram?: ts.Program
): Compilation => {
  const host = createReferenceHost(options, coreRoot, files, mode);
  const program = ts.createProgram({ rootNames: [...files.keys()], options, host, oldProgram });
  const programDiagnostics = [
    ...program.getOptionsDiagnostics(),
    ...program.getGlobalDiagnostics(),
  ];
  const diagnosticsOf = (file: ts.SourceFile) => [
    ...program.getSyntacticDiagnostics(file),
    ...program.getSemanticDiagnostics(file),
  ];
  const fileDiagnostics = new Map<string, ReadonlyArray<ts.Diagnostic>>();
  for (const fileName of files.keys()) {
    const sourceFile = program.getSourceFile(fileName);
    if (sourceFile) {
      fileDiagnostics.set(fileName, diagnosticsOf(sourceFile));
    } else {
      programDiagnostics.push({
        file: undefined,
        start: undefined,
        length: undefined,
        category: ts.DiagnosticCategory.Error,
        code: 0,
        messageText: `Missing virtual root: ${fileName}`,
      });
    }
  }
  const roots =
    mode === 'workspace'
      ? sourcePackages(coreRoot).map(({ root }) => `${root}/src/`)
      : [`${coreRoot}/dist/`, `${host.realpath?.(coreRoot) ?? coreRoot}/dist/`];
  for (const file of program.getSourceFiles()) {
    if (roots.some(root => file.fileName.startsWith(root))) {
      programDiagnostics.push(...diagnosticsOf(file));
    }
  }
  return { program, fileDiagnostics, programDiagnostics };
};
