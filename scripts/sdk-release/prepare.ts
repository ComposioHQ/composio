import { spawnSync } from 'node:child_process';
import { runPreparationCommand } from './commands';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { applySdkReleasePlan } from './plan';
import {
  batchPath,
  releaseBatchSchema,
  releasePatchSchema,
  validateReleaseDiff,
  type ReleaseBatch,
} from './source';
import {
  generateSdkReleaseNotes,
  generateSdkReleaseReferences,
} from '../../docs/scripts/generate-sdk-release-notes';

/** Runs in a fresh source checkout without a controller token or registry identity. */
export async function prepareRelease(
  cwd: string,
  input: ReleaseBatch
): Promise<z.infer<typeof releasePatchSchema>> {
  if (process.env.SDK_RELEASE_TOKEN)
    throw new Error('Preparation must not receive a controller credential');
  const batch = releaseBatchSchema.parse(input);
  if (runPreparationCommand('git', ['rev-parse', 'HEAD'], cwd).trim() !== batch.inputBase)
    throw new Error('Preparation checkout does not match the frozen input base');
  if (runPreparationCommand('git', ['status', '--porcelain'], cwd).trim())
    throw new Error('Preparation requires a clean source checkout');
  await applySdkReleasePlan(cwd, batch.plan);
  runPreparationCommand('pnpm', ['install', '--lockfile-only', '--ignore-scripts'], cwd);
  generateSdkReleaseReferences(cwd, batch.plan);
  await generateSdkReleaseNotes(cwd, batch.plan, {
    releaseId: batch.id,
    date: batch.date,
    publicationStatusUrl: batch.statusUrl,
  });
  await writeFile(resolve(cwd, batchPath), `${JSON.stringify(batch, null, 2)}\n`);
  const tracked = runPreparationCommand('git', ['diff', '--name-only', '-z', batch.inputBase], cwd)
    .split('\0')
    .filter(Boolean);
  const untracked = runPreparationCommand(
    'git',
    ['ls-files', '--others', '--exclude-standard', '-z'],
    cwd
  )
    .split('\0')
    .filter(Boolean);
  const files = await Promise.all(
    [...new Set([...tracked, ...untracked])].sort().map(async path => {
      const original = spawnSync('git', ['show', `${batch.inputBase}:${path}`], {
        cwd,
        encoding: 'utf8',
      });
      const after = (await Bun.file(resolve(cwd, path)).exists())
        ? await readFile(resolve(cwd, path), 'utf8')
        : null;
      return { path, before: original.status === 0 ? original.stdout : null, after };
    })
  );
  validateReleaseDiff(files, batch.plan, batch.outputs);
  return releasePatchSchema.parse({ batch, files });
}

if (import.meta.main) {
  const path = Bun.argv[2];
  if (!path) throw new Error('Expected authorized batch JSON path');
  const result = await prepareRelease(
    process.cwd(),
    releaseBatchSchema.parse(await Bun.file(path).json())
  );
  await writeFile(
    process.env.SDK_RELEASE_PATCH_PATH ?? '/tmp/sdk-release-patch.json',
    `${JSON.stringify(result)}\n`
  );
}
