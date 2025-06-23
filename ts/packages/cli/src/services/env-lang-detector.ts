import { BunFileSystem } from '@effect/platform-bun';
import { pipe, Data, Effect } from 'effect';
import { FileSystem } from '@effect/platform';

export class EnvLangDetectorError extends Data.TaggedError('services/DetectEnvLangError')<{
  readonly cause: Error;
  readonly message: string;
}> {}

// Service that attempts to detect the language of the project in the current working directory.
export class EnvLangDetector extends Effect.Service<EnvLangDetector>()('services/EnvLangDetector', {
  effect: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    return {
      detectEnvLanguage: (
        cwd: string
      ): Effect.Effect<'TypeScript' | 'Python', EnvLangDetectorError, never> =>
        Effect.gen(function* () {
          const files = yield* pipe(
            fs.readDirectory(cwd),
            Effect.catchAll(e =>
              Effect.fail(
                new EnvLangDetectorError({ cause: e, message: `Failed to read directory ${cwd}` })
              )
            )
          );

          // Convert to lowercase for case-insensitive comparison
          const fileNames = files.map(f => f.toLowerCase());
          yield* Effect.logDebug(`Files in directory ${cwd}:\n${fileNames.join('\n')}`);

          // TypeScript project indicators (in order of precedence)
          const typescriptIndicators = [
            'tsconfig.json',
            'package.json',
            'yarn.lock',
            'package-lock.json',
            'pnpm-lock.yaml',
            'bun.lockb',
            'deno.json',
            'deno.jsonc',
          ];

          // Python project indicators (in order of precedence)
          const pythonIndicators = [
            'pyproject.toml',
            'setup.py',
            'requirements.txt',
            'pipfile',
            'pipfile.lock',
            'poetry.lock',
            'conda.yaml',
            'environment.yml',
            'setup.cfg',
            'tox.ini',
            'pytest.ini',
            '__pycache__',
          ];

          // Check for TypeScript indicators first
          const hasTypescriptIndicator = typescriptIndicators.some(indicator =>
            fileNames.includes(indicator)
          );

          // Check for Python indicators
          const hasPythonIndicator = pythonIndicators.some(indicator =>
            fileNames.includes(indicator)
          );

          yield* Effect.logDebug(`TypeScript indicators found: ${hasTypescriptIndicator}`);
          yield* Effect.logDebug(`Python indicators found: ${hasPythonIndicator}`);

          // Additional checks for file extensions if no clear indicators found
          if (!hasTypescriptIndicator && !hasPythonIndicator) {
            // Get actual file names (not lowercase) for extension checking
            const hasTypeScriptFiles = files.some(
              file =>
                file.endsWith('.ts') ||
                file.endsWith('.tsx') ||
                file.endsWith('.mts') ||
                file.endsWith('.cts')
            );

            const hasPythonFiles = files.some(
              file =>
                file.endsWith('.py') ||
                file.endsWith('.pyw') ||
                file.endsWith('.pyi') ||
                file.endsWith('.pyx')
            );

            if (hasTypeScriptFiles && !hasPythonFiles) {
              return 'TypeScript' as const;
            }

            if (hasPythonFiles && !hasTypeScriptFiles) {
              return 'Python' as const;
            }

            // If both or neither are found, check for more files by reading subdirectories
            // This is a more exhaustive check
            const allFiles: string[] = [];

            // Don't recurse into common directories that might contain false positives
            const skipDirs = [
              '.composio',
              'node_modules',
              '.git',
              '__pycache__',
              '.venv',
              'venv',
              'env',
              'dist',
              'build',
            ];

            // Recursively collect files from immediate subdirectories
            yield* Effect.logInfo('Checking subdirectories for more files...');

            for (const item of files) {
              const itemPath = `${cwd}/${item}`;
              const stat = yield* pipe(
                fs.stat(cwd),
                Effect.catchAll(e =>
                  Effect.fail(
                    new EnvLangDetectorError({
                      cause: e,
                      message: `Failed to read file ${itemPath}`,
                    })
                  )
                )
              );

              if (stat.type === 'Directory') {
                if (!skipDirs.includes(item.toLowerCase())) {
                  const subFiles = yield* pipe(
                    fs.readDirectory(item),
                    Effect.catchAll(e =>
                      Effect.fail(
                        new EnvLangDetectorError({
                          cause: e,
                          message: `Failed to read directory ${item}`,
                        })
                      )
                    )
                  );
                  allFiles.push(...subFiles);
                }
              }
            }

            const allFileNames = [...files, ...allFiles];

            const deepTsFiles = allFileNames.filter(
              file =>
                file.endsWith('.ts') ||
                file.endsWith('.tsx') ||
                file.endsWith('.mts') ||
                file.endsWith('.cts')
            ).length;

            const deepPyFiles = allFileNames.filter(
              file =>
                file.endsWith('.py') ||
                file.endsWith('.pyw') ||
                file.endsWith('.pyi') ||
                file.endsWith('.pyx')
            ).length;

            // Decide based on which has more files
            if (deepTsFiles > deepPyFiles && deepTsFiles > 0) {
              return 'TypeScript' as const;
            }

            if (deepPyFiles > deepTsFiles && deepPyFiles > 0) {
              return 'Python' as const;
            }
          }

          // Prioritize based on strength of indicators
          if (hasTypescriptIndicator && hasPythonIndicator) {
            // Both present - prioritize based on most definitive files
            const strongTsIndicators = ['tsconfig.json', 'package.json'];
            const strongPyIndicators = ['pyproject.toml', 'setup.py'];

            const hasStrongTs = strongTsIndicators.some(indicator => fileNames.includes(indicator));
            const hasStrongPy = strongPyIndicators.some(indicator => fileNames.includes(indicator));

            if (hasStrongTs && !hasStrongPy) {
              return 'TypeScript' as const;
            }
            if (hasStrongPy && !hasStrongTs) {
              return 'Python' as const;
            }

            // If both have strong indicators, default to TypeScript
            // (this is arbitrary but package.json is very common)
            return 'TypeScript' as const;
          }

          if (hasTypescriptIndicator) {
            return 'TypeScript' as const;
          }

          if (hasPythonIndicator) {
            return 'Python' as const;
          }

          // No clear indicators found
          return yield* Effect.fail(
            new EnvLangDetectorError({
              cause: new Error('Unable to detect project language'),
              message: `Could not determine if directory '${cwd}' contains a Python or TypeScript project. No recognizable project files or patterns found.`,
            })
          );
        }),
    };
  }),
  dependencies: [BunFileSystem.layer],
}) {}
