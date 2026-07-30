import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { ArtifactSchema, PackageSchema } from './contracts';

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const PreparationReceiptSchema = z
  .object({
    release_id: z.string().min(1),
    manifest_id: Sha256Schema,
    selection: z
      .object({
        typescript: z.enum(['selected', 'skipped']),
        python: z.enum(['selected', 'skipped']),
      })
      .strict(),
    packages: z.array(PackageSchema),
    artifacts: z.array(ArtifactSchema),
    changelog: z
      .object({
        draft_path: z
          .string()
          .startsWith('.github/sdk-release/drafts/')
          .refine(path => !path.startsWith('docs/content/changelog/')),
        sha256: Sha256Schema,
      })
      .strict(),
    generation: z
      .object({
        action: z.enum(['generated', 'no_op', 'preserved_human_edit']),
        model: z.string().min(1),
        response_id: z.string().min(1),
        generation_key: Sha256Schema,
        reset_count: z.number().int().nonnegative(),
        review_invalidated: z.boolean(),
      })
      .strict(),
    prepare_run: z
      .object({
        repository: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
        run_id: z.number().int().positive(),
        run_attempt: z.number().int().positive(),
      })
      .strict(),
    legacy_comparison: z
      .object({
        status: z.enum(['exact', 'mismatch']),
        coordinator: z.array(z.string()),
        legacy: z.array(z.string()),
      })
      .strict(),
  })
  .strict();

export type PreparationReceipt = z.infer<typeof PreparationReceiptSchema>;

function inlineCode(value: string): string {
  const safe = value
    .replace(/[\r\n]+/g, ' ')
    .replace(/\|/g, '&#124;')
    .replace(/`/g, '&#96;');
  return `\`${safe}\``;
}

export function renderPreparationReceipt(rawReceipt: PreparationReceipt): string {
  const receipt = PreparationReceiptSchema.parse(rawReceipt);
  const packageRows = receipt.packages.map(
    releasePackage =>
      `| ${releasePackage.ecosystem === 'typescript' ? 'TypeScript' : 'Python'} | ${inlineCode(releasePackage.name)} | ${inlineCode(releasePackage.version)} |`
  );
  const artifactRows = receipt.artifacts.map(
    artifact =>
      `| ${inlineCode(artifact.filename)} | ${inlineCode(artifact.package_name)} | ${inlineCode(artifact.sha256)} | ${artifact.ecosystem === 'typescript' ? inlineCode(artifact.integrity) : '—'} |`
  );
  return [
    `<!-- sdk-release-receipt:${receipt.release_id} -->`,
    '## SDK release preparation receipt',
    '',
    `Release: ${inlineCode(receipt.release_id)}`,
    `Manifest identity: ${inlineCode(receipt.manifest_id)}`,
    `Run ${receipt.prepare_run.run_id}, attempt ${receipt.prepare_run.run_attempt} in ${inlineCode(receipt.prepare_run.repository)}`,
    '',
    '### Ecosystems',
    '',
    '| Ecosystem | State |',
    '| --- | --- |',
    `| TypeScript | ${receipt.selection.typescript} |`,
    `| Python | ${receipt.selection.python} |`,
    '',
    '### Versions',
    '',
    '| Ecosystem | Package | Version |',
    '| --- | --- | --- |',
    ...packageRows,
    '',
    '### Primary artifacts',
    '',
    '| Artifact | Package | SHA-256 | npm SRI |',
    '| --- | --- | --- | --- |',
    ...artifactRows,
    '',
    '### Changelog generation',
    '',
    `Draft: ${inlineCode(receipt.changelog.draft_path)}`,
    `Draft SHA-256: ${inlineCode(receipt.changelog.sha256)}`,
    `Model: ${inlineCode(receipt.generation.model)}`,
    `Response: ${inlineCode(receipt.generation.response_id)}`,
    `Generation key: ${inlineCode(receipt.generation.generation_key)}`,
    `Retry action: ${inlineCode(receipt.generation.action)}`,
    `Reset count: ${receipt.generation.reset_count}`,
    `Review invalidated: ${receipt.generation.review_invalidated ? 'yes' : 'no'}`,
    '',
    `Legacy writer comparison: ${receipt.legacy_comparison.status}`,
    '',
    `- Coordinator: ${receipt.legacy_comparison.coordinator.map(inlineCode).join(', ') || 'none'}`,
    `- Legacy: ${receipt.legacy_comparison.legacy.map(inlineCode).join(', ') || 'none'}`,
    '',
    '> Observe-only: registry publishers are disabled. This receipt records preparation evidence only.',
    '',
  ].join('\n');
}

async function main(args: string[]): Promise<void> {
  const inputIndex = args.indexOf('--input');
  const outputIndex = args.indexOf('--output');
  const input = inputIndex === -1 ? undefined : args[inputIndex + 1];
  if (!input) throw new Error('Missing --input');
  const rendered = renderPreparationReceipt(JSON.parse(readFileSync(input, 'utf8')));
  const output = outputIndex === -1 ? undefined : args[outputIndex + 1];
  if (output) {
    writeFileSync(output, rendered);
  } else {
    process.stdout.write(rendered);
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
