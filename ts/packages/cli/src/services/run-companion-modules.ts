import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RUN_COMPANION_MODULE_BASENAMES = [
  'run-subagent-shared',
  'run-subagent-acp',
  'run-subagent-legacy',
] as const;

export const RUN_COMPANION_MODULE_FILENAMES = RUN_COMPANION_MODULE_BASENAMES.map(
  name => `${name}.mjs`
);

export const resolveRunCompanionModulePath = ({
  callerImportMetaUrl,
  execPath,
  relativeNoExtensionFromCaller,
}: {
  callerImportMetaUrl: string;
  execPath: string;
  relativeNoExtensionFromCaller: string;
}): string => {
  const currentFilePath = fileURLToPath(callerImportMetaUrl);
  const currentDirectory = path.dirname(currentFilePath);
  const executableDirectory = path.dirname(execPath);
  const baseName = path.basename(relativeNoExtensionFromCaller);

  const candidates = [
    path.resolve(currentDirectory, `${relativeNoExtensionFromCaller}.ts`),
    path.resolve(currentDirectory, `${relativeNoExtensionFromCaller}.js`),
    path.resolve(currentDirectory, 'services', `${baseName}.mjs`),
    path.resolve(currentDirectory, 'services', `${baseName}.js`),
    path.resolve(currentDirectory, `${baseName}.mjs`),
    path.resolve(currentDirectory, `${baseName}.js`),
    path.resolve(executableDirectory, `${baseName}.mjs`),
    path.resolve(executableDirectory, `${baseName}.js`),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return currentFilePath.startsWith('/$bunfs/')
    ? path.resolve(executableDirectory, `${baseName}.mjs`)
    : path.resolve(currentDirectory, `${baseName}.mjs`);
};
