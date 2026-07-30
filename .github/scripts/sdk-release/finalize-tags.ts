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

function argumentValue(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index === -1 ? undefined : args[index + 1];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function main(args: string[]): Promise<void> {
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
