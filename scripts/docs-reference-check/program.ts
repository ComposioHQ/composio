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

const readJson = (path: string): unknown => {
  const { config, error } = ts.readConfigFile(path, ts.sys.readFile);
  if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
  return config;
};

const exportedTypes = (target: unknown): string | undefined =>
  typeof target === 'string'
    ? target
    : isRecord(target)
      ? exportedTypes(target.types ?? target.default)
      : undefined;

const exportPaths = (name: string, root: string) => {
  const manifest = readJson(`${root}/package.json`);
  const exports = isRecord(manifest) && isRecord(manifest.exports) ? manifest.exports : {};
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

export const referenceCompilerOptions = (coreRoot: string): ts.CompilerOptions => ({
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  moduleDetection: ts.ModuleDetectionKind.Force,
  jsx: ts.JsxEmit.Preserve,
  strict: true,
  esModuleInterop: true,
  skipLibCheck: true,
  resolveJsonModule: true,
  noEmit: true,
  types: ['node'],
  // Absolute targets: TypeScript 6 rejects `baseUrl`, and these options have no tsconfig to be relative to.
  paths: {
    ...Object.assign(
      {},
      ...sourcePackages(coreRoot).map(({ name, root }) => exportPaths(name, root))
    ),
    ...corePrivateImportPaths(coreRoot),
  },
});

export const createReferenceHost = (
  options: ts.CompilerOptions,
  coreRoot: string,
  files: ReadonlyMap<string, string>
): ts.CompilerHost => {
  const base = ts.createCompilerHost(options, true);
  const hidden = sourcePackages(coreRoot).flatMap(({ name, root }) => [
    `${root}/dist/`,
    `/node_modules/${name}/dist/`,
  ]);
  const isHidden = (fileName: string) => hidden.some(part => fileName.includes(part));
  return {
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
  oldProgram?: ts.Program
): Compilation => {
  const host = createReferenceHost(options, coreRoot, files);
  const program = ts.createProgram({ rootNames: [...files.keys()], options, host, oldProgram });
  const fileDiagnostics = new Map(
    [...files.keys()].map(fileName => {
      const sourceFile = program.getSourceFile(fileName);
      return [
        fileName,
        sourceFile
          ? [
              ...program.getSyntacticDiagnostics(sourceFile),
              ...program.getSemanticDiagnostics(sourceFile),
            ]
          : [],
      ] as const;
    })
  );
  return {
    program,
    fileDiagnostics,
    programDiagnostics: [...program.getOptionsDiagnostics(), ...program.getGlobalDiagnostics()],
  };
};
