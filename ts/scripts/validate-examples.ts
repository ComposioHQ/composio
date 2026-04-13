import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

const repoRoot = process.cwd();
const examplesRoot = path.join(repoRoot, 'ts', 'examples');
const allowedSourceExtensions = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
  '.json',
]);

type ValidationIssue = {
  example: string;
  file: string;
  message: string;
};

const issues: ValidationIssue[] = [];

const addIssue = (example: string, file: string, message: string) => {
  issues.push({ example, file, message });
};

const collectFiles = (dir: string): string[] => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectFiles(fullPath);
    }
    return [fullPath];
  });
};

const validatePackageJson = (exampleName: string, exampleDir: string) => {
  const packageJsonPath = path.join(exampleDir, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    addIssue(exampleName, packageJsonPath, 'Missing package.json');
    return;
  }

  try {
    const raw = fs.readFileSync(packageJsonPath, 'utf8');
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      name?: string;
      packageManager?: string;
      private?: boolean;
      scripts?: Record<string, string>;
    };

    if (!pkg.name?.endsWith('-example')) {
      addIssue(exampleName, packageJsonPath, 'Package name should end with "-example"');
    }

    if (pkg.private !== true) {
      addIssue(exampleName, packageJsonPath, 'Examples must be marked private');
    }

    if (!pkg.packageManager?.startsWith('pnpm@')) {
      addIssue(exampleName, packageJsonPath, 'Examples must declare a pnpm packageManager');
    }

    if (!pkg.scripts || (!pkg.scripts.start && !pkg.scripts.dev)) {
      addIssue(exampleName, packageJsonPath, 'Examples must expose a start or dev script');
    }

    const allDeps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    };

    if (!Object.keys(allDeps).some(dep => dep.startsWith('@composio/'))) {
      addIssue(exampleName, packageJsonPath, 'Examples must depend on at least one @composio package');
    }
  } catch (error) {
    addIssue(
      exampleName,
      packageJsonPath,
      `Invalid package.json: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

const validateTsconfig = (exampleName: string, exampleDir: string) => {
  const tsconfigPath = path.join(exampleDir, 'tsconfig.json');

  if (!fs.existsSync(tsconfigPath)) {
    addIssue(exampleName, tsconfigPath, 'Missing tsconfig.json');
    return;
  }

  try {
    const raw = fs.readFileSync(tsconfigPath, 'utf8');
    const parsed = ts.parseConfigFileTextToJson(tsconfigPath, raw);

    if (parsed.error) {
      const message = ts.flattenDiagnosticMessageText(parsed.error.messageText, '\n');
      addIssue(exampleName, tsconfigPath, `Invalid tsconfig.json: ${message}`);
      return;
    }

    const config = parsed.config as { include?: string[] } | undefined;
    if (!Array.isArray(config?.include) || config.include.length === 0) {
      addIssue(exampleName, tsconfigPath, 'tsconfig.json should define a non-empty include array');
    }
  } catch (error) {
    addIssue(
      exampleName,
      tsconfigPath,
      `Invalid tsconfig.json: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

const validateSourceFile = (exampleName: string, filePath: string) => {
  const extension = path.extname(filePath);
  const relativePath = path.relative(repoRoot, filePath);

  if (extension === '.json') {
    try {
      JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      addIssue(
        exampleName,
        relativePath,
        `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return;
  }

  const sourceText = fs.readFileSync(filePath, 'utf8');
  const isTsFile = ['.ts', '.tsx', '.mts', '.cts'].includes(extension);
  const scriptKind = extension === '.tsx'
    ? ts.ScriptKind.TSX
    : extension === '.jsx'
      ? ts.ScriptKind.JSX
      : extension === '.js'
        ? ts.ScriptKind.JS
        : extension === '.cjs'
          ? ts.ScriptKind.JS
          : extension === '.mjs'
            ? ts.ScriptKind.JS
            : ts.ScriptKind.TS;

  const transpiled = ts.transpileModule(sourceText, {
    compilerOptions: {
      allowJs: true,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
    reportDiagnostics: true,
  });

  for (const diagnostic of transpiled.diagnostics ?? []) {
    if (diagnostic.category !== ts.DiagnosticCategory.Error) {
      continue;
    }

    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    const location =
      diagnostic.start !== undefined
        ? ts.getLineAndCharacterOfPosition(
            ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.ES2022, true, scriptKind),
            diagnostic.start
          )
        : undefined;

    const formattedLocation = location
      ? `:${location.line + 1}:${location.character + 1}`
      : '';

    addIssue(exampleName, `${relativePath}${formattedLocation}`, `Syntax error: ${message}`);
  }

  if (isTsFile && sourceText.trim().length === 0) {
    addIssue(exampleName, relativePath, 'Source file must not be empty');
  }
};

const validateExample = (exampleDirName: string) => {
  const exampleDir = path.join(examplesRoot, exampleDirName);
  const srcDir = path.join(exampleDir, 'src');

  validatePackageJson(exampleDirName, exampleDir);
  validateTsconfig(exampleDirName, exampleDir);

  if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
    addIssue(exampleDirName, path.relative(repoRoot, srcDir), 'Missing src directory');
    return;
  }

  const sourceFiles = collectFiles(srcDir).filter(file =>
    allowedSourceExtensions.has(path.extname(file))
  );

  if (sourceFiles.length === 0) {
    addIssue(exampleDirName, path.relative(repoRoot, srcDir), 'No source files found');
    return;
  }

  for (const filePath of sourceFiles) {
    validateSourceFile(exampleDirName, filePath);
  }
};

const exampleDirs = fs
  .readdirSync(examplesRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort();

for (const exampleDirName of exampleDirs) {
  validateExample(exampleDirName);
}

if (issues.length > 0) {
  for (const issue of issues) {
    console.error(`[${issue.example}] ${issue.file}: ${issue.message}`);
  }
  console.error(`\nExample validation failed with ${issues.length} issue(s).`);
  process.exit(1);
}

console.log(`Validated ${exampleDirs.length} example packages.`);
