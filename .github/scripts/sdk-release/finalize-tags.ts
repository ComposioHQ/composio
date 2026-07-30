import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { SealedManifestSchema, type SealedManifest } from './contracts';
import { computeManifestId } from './manifest';

const GitShaSchema = z.string().regex(/^[a-f0-9]{40}$/);
const ManifestIdSchema = z.string().regex(/^[a-f0-9]{64}$/);
const ExistingTagSchema = z
  .object({
    name: z.string().min(1),
    target: GitShaSchema,
    message: z.string(),
  })
  .strict();

export interface ReleaseTagPlan {
  name: string;
  target: string;
  message: string;
}

function releaseTagNames(manifest: SealedManifest): string[] {
  const names = manifest.packages
    .filter(releasePackage => releasePackage.ecosystem === 'typescript')
    .map(releasePackage => `${releasePackage.name}@${releasePackage.version}`);
  const pythonVersions = new Set(
    manifest.packages
      .filter(releasePackage => releasePackage.ecosystem === 'python')
      .map(releasePackage => releasePackage.version)
  );
  if (pythonVersions.size > 1) throw new Error('Python release family contains divergent versions');
  const pythonVersion = [...pythonVersions][0];
  if (pythonVersion) names.push(`py@${pythonVersion}`);
  return names;
}

export function planReleaseTags(options: {
  manifest: SealedManifest;
  manifest_id: string;
  source_commit: string;
  verified: boolean;
  existing_tags: Array<z.infer<typeof ExistingTagSchema>>;
}): ReleaseTagPlan[] {
  const manifest = SealedManifestSchema.parse(options.manifest);
  const manifestId = ManifestIdSchema.parse(options.manifest_id);
  const sourceCommit = GitShaSchema.parse(options.source_commit);
  if (computeManifestId(manifest) !== manifestId) {
    throw new Error('Release tags must use the exact sealed manifest identity');
  }
  if (!options.verified) throw new Error('Release tags require a verified registry receipt');
  const existing = new Map(
    options.existing_tags.map(tag => {
      const parsed = ExistingTagSchema.parse(tag);
      return [parsed.name, parsed] as const;
    })
  );
  const names = releaseTagNames(manifest);

  return names.flatMap(name => {
    const message = `SDK release ${manifest.release_id}\nmanifest_id: ${manifestId}`;
    const found = existing.get(name);
    if (!found) return [{ name, target: sourceCommit, message }];
    if (
      found.target !== sourceCommit ||
      found.message !== message ||
      !found.message.includes(manifestId)
    ) {
      throw new Error(`Existing release tag ${name} conflicts with sealed manifest ${manifestId}`);
    }
    return [];
  });
}

type CommandRunner = (command: string, args: string[]) => string;

function commandOutput(command: string, args: string[]): string {
  const result = Bun.spawnSync([command, ...args]);
  if (result.exitCode !== 0) {
    const detail = new TextDecoder().decode(result.stderr).trim();
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return new TextDecoder().decode(result.stdout).trim();
}

export function applyReleaseTags(options: {
  manifest: SealedManifest;
  manifest_id: string;
  source_commit: string;
  run?: CommandRunner;
}): ReleaseTagPlan[] {
  const manifest = SealedManifestSchema.parse(options.manifest);
  const run = options.run ?? commandOutput;
  run('git', ['fetch', '--tags', '--force']);
  const existingTags = releaseTagNames(manifest).flatMap(name => {
    let target: string;
    try {
      target = run('git', ['rev-list', '-n', '1', name]);
    } catch {
      return [];
    }
    return [
      {
        name,
        target,
        message: run('git', ['for-each-ref', '--format=%(contents)', `refs/tags/${name}`]),
      },
    ];
  });
  const plan = planReleaseTags({
    manifest,
    manifest_id: options.manifest_id,
    source_commit: options.source_commit,
    verified: true,
    existing_tags: existingTags,
  });
  for (const tag of plan) {
    run('git', ['tag', '-a', tag.name, tag.target, '-m', tag.message]);
  }
  if (plan.length > 0) {
    run('git', ['push', '--atomic', 'origin', ...plan.map(tag => `refs/tags/${tag.name}`)]);
  }
  return plan;
}

function argumentValue(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index === -1 ? undefined : args[index + 1];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function main(args: string[]): Promise<void> {
  if (args[0] === 'apply') {
    const plan = applyReleaseTags({
      manifest: JSON.parse(readFileSync(argumentValue(args, '--manifest'), 'utf8')),
      manifest_id: argumentValue(args, '--manifest-id'),
      source_commit: argumentValue(args, '--source-commit'),
    });
    if (args.includes('--output')) {
      writeFileSync(argumentValue(args, '--output'), `${JSON.stringify(plan, null, 2)}\n`);
    }
    return;
  }
  const input = JSON.parse(readFileSync(argumentValue(args, '--input'), 'utf8'));
  const plan = planReleaseTags(input);
  const bytes = `${JSON.stringify(plan, null, 2)}\n`;
  if (args.includes('--output')) writeFileSync(argumentValue(args, '--output'), bytes);
  else process.stdout.write(bytes);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
