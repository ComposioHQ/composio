import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
const PYTHON_RELEASE_MARKER = '@composio/python-sdk';
const releaseDocumentationPlanSchema = z.object({
  releases: z.array(
    z.object({
      name: z.string(),
      newVersion: z.string(),
      language: z.enum(['typescript', 'python']),
    })
  ),
  changesets: z.array(z.object({ summary: z.string() })),
});
export type ReleaseDocumentationPlan = z.infer<typeof releaseDocumentationPlanSchema>;

const releaseNoteOptionsSchema = z.object({
  releaseId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  publicationStatusUrl: z.url().refine(value => {
    const url = new URL(value);
    return (
      url.origin === 'https://github.com' &&
      /^\/ComposioHQ\/composio\/(issues|pull)\/\d+$/.test(url.pathname)
    );
  }, 'Publication status must link to the repository release request or PR'),
});
export type ReleaseNoteOptions = z.infer<typeof releaseNoteOptionsSchema>;

function targets(plan: ReleaseDocumentationPlan): Record<string, string> {
  return Object.fromEntries(plan.releases.map(release => [release.name, release.newVersion]));
}

function versionTable(plan: ReleaseDocumentationPlan): string {
  return [
    '| SDK | Version |',
    '| --- | --- |',
    ...plan.releases.map(release =>
      release.name === PYTHON_RELEASE_MARKER
        ? `| Python \`composio\` | \`${release.newVersion}\` |`
        : `| TypeScript \`${release.name}\` | \`${release.newVersion}\` |`
    ),
  ].join('\n');
}

export async function generateSdkReleaseNotes(
  cwd: string,
  value: ReleaseDocumentationPlan,
  input: ReleaseNoteOptions
): Promise<{ path: string; preserved: boolean }> {
  const plan = releaseDocumentationPlanSchema.parse(value);
  const options = releaseNoteOptionsSchema.parse(input);
  if (!plan.releases.length) throw new Error('Nothing to document');
  const [year, month, day] = options.date.split('-');
  const path = resolve(
    cwd,
    'docs/content/changelog',
    `${month}-${day}-${year.slice(2)}-sdk-${options.releaseId}.mdx`
  );
  if (await Bun.file(path).exists()) {
    const contents = await readFile(path, 'utf8');
    const frontmatter = contents.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
    const existing = z
      .object({
        sdkRelease: z.string(),
        sdkReleaseTargets: z.record(z.string(), z.string()),
      })
      .parse(Bun.YAML.parse(frontmatter ?? ''));
    if (
      existing.sdkRelease !== options.releaseId ||
      JSON.stringify(Object.entries(existing.sdkReleaseTargets).sort()) !==
        JSON.stringify(Object.entries(targets(plan)).sort())
    ) {
      throw new Error('Release targets changed; refresh the entry explicitly and obtain approval');
    }
    return { path: relative(cwd, path), preserved: true };
  }
  const summaries = [...new Set(plan.changesets.map(note => note.summary.trim()).filter(Boolean))];
  const contents = `---\ntitle: ${JSON.stringify(`SDK release ${options.releaseId}`)}\ndate: ${JSON.stringify(options.date)}\nsdkRelease: ${JSON.stringify(options.releaseId)}\nsdkReleaseTargets: ${JSON.stringify(targets(plan))}\n---\n\nThis entry records the release targets. See [publication status](${options.publicationStatusUrl}) for package availability.\n\n### SDK Versions\n\n${versionTable(plan)}\n\n### Changes\n\n${summaries.join('\n\n')}\n`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, { flag: 'wx' });
  return { path: relative(cwd, path), preserved: false };
}

export function generateSdkReleaseReferences(
  cwd: string,
  value: ReleaseDocumentationPlan
): string[] {
  const plan = releaseDocumentationPlanSchema.parse(value);
  const languages = new Set(plan.releases.map(release => release.language));
  const paths: string[] = [];
  for (const language of languages) {
    const command =
      language === 'typescript'
        ? {
            executable: 'pnpm',
            args: ['--filter', '@composio/core', 'generate:docs'],
            directory: cwd,
          }
        : {
            executable: 'uv',
            args: ['run', '--with', 'griffe', 'python', 'scripts/generate-docs.py'],
            directory: join(cwd, 'python'),
          };
    const result = spawnSync(command.executable, command.args, {
      cwd: command.directory,
      stdio: 'inherit',
    });
    if (result.status !== 0)
      throw new Error(
        `${language} reference generation failed: ${result.error?.message ?? result.status}`
      );
    paths.push(`docs/content/reference/sdk-reference/${language}`);
  }
  return paths;
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      plan: { type: 'string' },
      id: { type: 'string' },
      date: { type: 'string' },
      'status-url': { type: 'string' },
      cwd: { type: 'string' },
      references: { type: 'boolean', default: false },
    },
  });
  if (!values.plan) throw new Error('--plan is required');
  const plan = releaseDocumentationPlanSchema.parse(await Bun.file(values.plan).json());
  const options = releaseNoteOptionsSchema.parse({
    releaseId: values.id,
    date: values.date,
    publicationStatusUrl: values['status-url'],
  });
  const cwd = resolve(values.cwd ?? process.cwd());
  if (values.references) generateSdkReleaseReferences(cwd, plan);
  console.log(JSON.stringify(await generateSdkReleaseNotes(cwd, plan, options)));
}
