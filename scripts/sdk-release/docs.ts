import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import semver from 'semver';
import { z } from 'zod';
import {
  GitHubReleaseApiError,
  GitHubReleaseClient,
  SDK_RELEASE_REPOSITORY,
  releaseRunSchema,
} from './github';
import { committedBatch, publicationState } from './coordination';
import { readPublicationStatus, writePublicationStatus } from './publication';
import { releaseBatchSchema, sourceShaSchema } from './source';
import { runPreparationCommand } from './commands';
export { isSdkChangelog } from './changelog-filter';

const repo = `/repos/${SDK_RELEASE_REPOSITORY}`;
const branch = 'docs/auto-sdk-sync';
const marker = '<!-- sdk-release-docs -->';
const fileSchema = z.object({
  path: z.string(),
  before: z.string().nullable(),
  after: z.string().nullable(),
});
const manifestSchema = z
  .object({
    dependencies: z.record(z.string(), z.string()).optional(),
    devDependencies: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();
export const docsInputSchema = z.object({
  runId: z.number().int().positive(),
  batch: releaseBatchSchema,
  sourceSha: sourceShaSchema,
  verifiedRunId: z.number().int().positive(),
  verifiedSourceSha: sourceShaSchema,
  branchHead: sourceShaSchema.nullable(),
  pendingFiles: z.array(fileSchema),
  targets: z.record(z.string(), z.string()),
  verifiedLanguages: z.array(z.enum(['typescript', 'python'])),
  summaries: z.array(z.string()),
});
type DocsInput = z.infer<typeof docsInputSchema>;
const docsPatchSchema = z.object({ input: docsInputSchema, files: z.array(fileSchema) });

export function pinDocsSdkVersions(
  value: unknown,
  targets: Record<string, string>,
  installed: Record<string, string> = {}
) {
  const manifest = manifestSchema.parse(value);
  for (const section of ['dependencies', 'devDependencies'] as const) {
    const dependencies = manifest[section];
    if (!dependencies) continue;
    for (const [name, current] of Object.entries(dependencies)) {
      if (!name.startsWith('@composio/')) continue;
      const target = targets[name];
      const floor = semver.minVersion(current);
      if (!target || !semver.valid(target) || !floor)
        throw new Error(`Missing verified SDK target: ${name}`);
      if (semver.lt(target, floor) || (installed[name] && semver.lt(target, installed[name])))
        throw new Error(`Docs pin must not decrease: ${name}`);
      dependencies[name] = target;
    }
  }
  return manifest;
}

function lockedSdkVersions(lock: string): Record<string, string> {
  const packages = z
    .object({ packages: z.record(z.string(), z.array(z.unknown())) })
    .parse(Bun.JSONC.parse(lock)).packages;
  const installed: Record<string, string> = {};
  for (const [name, entry] of Object.entries(packages)) {
    if (!/^@composio\/[^/]+$/.test(name)) continue;
    const resolution = z.string().parse(entry[0]);
    const version = resolution.slice(`${name}@`.length);
    if (!resolution.startsWith(`${name}@`) || !semver.valid(version))
      throw new Error(`Invalid locked SDK version: ${name}`);
    installed[name] = version;
  }
  return installed;
}

export function requireFreshDocsInput(
  selected: Pick<DocsInput, 'sourceSha' | 'verifiedRunId' | 'branchHead'>,
  current: Pick<DocsInput, 'sourceSha' | 'verifiedRunId' | 'branchHead'>
) {
  if (
    selected.sourceSha !== current.sourceSha ||
    selected.verifiedRunId !== current.verifiedRunId ||
    selected.branchHead !== current.branchHead
  )
    throw new Error(
      'Protected docs, verified release or pending guide edits changed; regenerate from current inputs'
    );
}

type LiveRelease = Pick<DocsInput['batch'], 'date' | 'statusUrl'> & {
  plan: {
    releases: Pick<
      DocsInput['batch']['plan']['releases'][number],
      'name' | 'newVersion' | 'language'
    >[];
  };
};
export async function verifyLiveReleaseDocs(
  batch: LiveRelease,
  fetcher: (url: string) => Promise<Response> = url =>
    fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30_000) })
) {
  const path = `/docs/changelog/${batch.date.replaceAll('-', '/')}`;
  for (const suffix of ['', '.md']) {
    const response = await fetcher(`https://docs.composio.dev${path}${suffix}`);
    if (!response.ok) throw new Error(`Release documentation unavailable (${response.status})`);
    const text = (await response.text()).replaceAll('&#x40;', '@').replaceAll('&commat;', '@');
    const rows = (
      suffix
        ? text.split('\n').filter(line => line.startsWith('|'))
        : (text.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? [])
    ).map(row => {
      const cells = suffix
        ? row.split('|').slice(1, -1)
        : [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => cell[1]);
      return cells.map(cell =>
        cell
          .replace(/<[^>]*>/g, '')
          .replaceAll('`', '')
          .trim()
          .replace(/\s+/g, ' ')
      );
    });
    if (
      !text.includes(batch.statusUrl) ||
      !batch.plan.releases.every(release =>
        rows.some(
          cells =>
            cells[0] ===
              (release.language === 'python' ? 'Python composio' : `TypeScript ${release.name}`) &&
            cells[1] === release.newVersion
        )
      )
    )
      throw new Error(
        'Live documentation does not yet contain the reviewed release targets and publication status'
      );
  }
  for (const language of new Set(batch.plan.releases.map(release => release.language))) {
    const response = await fetcher(
      `https://docs.composio.dev/reference/sdk-reference/${language}/tools`
    );
    if (!response.ok || !(await response.text()).includes('Tools'))
      throw new Error(`Live ${language} SDK reference unavailable`);
  }
}

async function contents(github: GitHubReleaseClient, path: string, ref: string) {
  try {
    const file = await github.request(
      'GET',
      `${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`,
      z.object({ encoding: z.literal('base64'), content: z.string() })
    );
    return Buffer.from(file.content, 'base64').toString('utf8');
  } catch (error) {
    if (error instanceof GitHubReleaseApiError && error.status === 404) return null;
    throw error;
  }
}
async function refSha(github: GitHubReleaseClient, name: string) {
  try {
    return (
      await github.request(
        'GET',
        `${repo}/git/ref/heads/${name}`,
        z.object({ object: z.object({ sha: sourceShaSchema }) })
      )
    ).object.sha;
  } catch (error) {
    if (error instanceof GitHubReleaseApiError && error.status === 404) return null;
    throw error;
  }
}
export async function newestVerifiedRelease(github: GitHubReleaseClient) {
  for (let page = 1; ; page++) {
    const runs = await github.request(
      'GET',
      `${repo}/actions/workflows/sdk.release.yml/runs?event=push&per_page=100&page=${page}`,
      z.object({ workflow_runs: z.array(releaseRunSchema) })
    );
    for (const run of runs.workflow_runs) {
      if (!/^sdk-release\/\d+$/.test(run.head_branch ?? '') || !run.head_sha) continue;
      if ((await publicationState(github, run)).verified)
        return { run, batch: (await committedBatch(github, run.head_sha))! };
    }
    if (runs.workflow_runs.length < 100) throw new Error('No verified SDK release is available');
  }
}
function allowedDocsPath(path: string) {
  return (
    /^docs\/content\/docs\/(?!.*(?:^|\/)\.\.\/)[a-zA-Z0-9_./-]+\.mdx$/.test(path) ||
    ['docs/package.json', 'docs/bun.lock'].includes(path)
  );
}

export async function selectDocsInput(
  github: GitHubReleaseClient,
  runId: string
): Promise<DocsInput> {
  const run = await github.getRun(runId);
  if (!(await publicationState(github, run)).verified)
    throw new Error('Public registry verification must succeed before SDK docs maintenance');
  const batch = (await committedBatch(github, run.head_sha!))!;
  const latest = await newestVerifiedRelease(github);
  const sourceSha = await refSha(github, 'next');
  if (!sourceSha) throw new Error('Protected next is unavailable');
  const branchHead = await refSha(github, branch);
  const pendingFiles: DocsInput['pendingFiles'] = [];
  if (branchHead) {
    const comparison = await github.request(
      'GET',
      `${repo}/compare/${sourceSha}...${branchHead}`,
      z.object({ files: z.array(z.object({ filename: z.string() })).max(299) })
    );
    for (const file of comparison.files) {
      if (!allowedDocsPath(file.filename))
        throw new Error('Pending docs branch contains changes outside guides and SDK pins');
      pendingFiles.push({
        path: file.filename,
        before: await contents(github, file.filename, sourceSha),
        after: await contents(github, file.filename, branchHead),
      });
    }
  }
  const tree = await github.request(
    'GET',
    `${repo}/git/trees/${latest.run.head_sha}?recursive=1`,
    z.object({
      truncated: z.literal(false),
      tree: z.array(z.object({ path: z.string(), type: z.string() })),
    })
  );
  const targets: Record<string, string> = {};
  for (const item of tree.tree.filter(
    item =>
      item.type === 'blob' &&
      /^ts\/packages\/(?:[^/]+|providers\/[^/]+)\/package\.json$/.test(item.path)
  )) {
    const manifest = z
      .object({ name: z.string(), version: z.string(), private: z.boolean().optional() })
      .parse(JSON.parse((await contents(github, item.path, latest.run.head_sha!))!));
    if (!manifest.private) targets[manifest.name] = manifest.version;
  }
  for (const item of tree.tree.filter(
    item =>
      item.type === 'blob' && /^python\/(?:providers\/[^/]+\/)?pyproject\.toml$/.test(item.path)
  )) {
    const project = z
      .object({ project: z.object({ name: z.string(), version: z.string() }) })
      .parse(Bun.TOML.parse((await contents(github, item.path, latest.run.head_sha!))!)).project;
    targets[project.name] = project.version;
  }
  // A corrective source can still contain unselected, unverified versions from the failed batch.
  for (const outstanding of latest.batch.plan.corrective?.releases ?? []) {
    if (latest.batch.plan.releases.some(release => release.name === outstanding.name)) continue;
    if (outstanding.language === 'typescript') targets[outstanding.name] = outstanding.oldVersion;
    else
      for (const name of Object.keys(targets).filter(name => !name.startsWith('@')))
        targets[name] = outstanding.oldVersion;
  }
  return docsInputSchema.parse({
    runId: run.id,
    batch,
    sourceSha,
    verifiedRunId: latest.run.id,
    verifiedSourceSha: latest.run.head_sha,
    branchHead,
    pendingFiles,
    targets,
    verifiedLanguages: [...new Set(latest.batch.plan.releases.map(release => release.language))],
    summaries: latest.batch.plan.changesets.map(note => note.summary),
  });
}

async function prepareDocs(cwd: string, input: DocsInput) {
  if (process.env.SDK_RELEASE_TOKEN)
    throw new Error('Docs generation must not receive controller credentials');
  if (runPreparationCommand('git', ['rev-parse', 'HEAD'], cwd).trim() !== input.sourceSha)
    throw new Error('Docs source differs from current protected input');
  // Keep pending human guide edits, but regenerate managed pins from protected package scripts.
  for (const file of input.pendingFiles) {
    if (!allowedDocsPath(file.path)) throw new Error('Invalid pending docs path');
    if (file.path.startsWith('docs/content/docs/')) {
      const previous = spawnSync('git', ['show', `${input.sourceSha}:${file.path}`], {
        cwd,
        encoding: 'utf8',
      });
      if ((previous.status === 0 ? previous.stdout : null) !== file.before)
        throw new Error('Pending guide baseline differs');
      // A three-way merge preserves current protected edits and reports conflicts instead of overwriting.
      const old = input.branchHead
        ? runPreparationCommand(
            'git',
            ['merge-base', input.sourceSha, input.branchHead],
            cwd
          ).trim()
        : input.sourceSha;
      const ancestor = spawnSync('git', ['show', `${old}:${file.path}`], { cwd, encoding: 'utf8' });
      if (file.after === null) {
        if (file.before !== (ancestor.status === 0 ? ancestor.stdout : null))
          throw new Error('Pending guide deletion conflicts with newer docs');
        await Bun.$`rm -- ${file.path}`.cwd(cwd).quiet();
      } else if (file.before === null) {
        if (ancestor.status === 0)
          throw new Error('Pending guide edits conflict with a newer protected deletion');
        await Bun.$`mkdir -p -- ${file.path.split('/').slice(0, -1).join('/')}`.cwd(cwd).quiet();
        await writeFile(`${cwd}/${file.path}`, file.after);
      } else {
        const current = `/tmp/sdk-guide-current-${crypto.randomUUID()}`;
        const base = `${current}-base`,
          pending = `${current}-pending`;
        await writeFile(current, file.before);
        await writeFile(base, ancestor.status === 0 ? ancestor.stdout : '');
        await writeFile(pending, file.after);
        const merged = spawnSync('git', ['merge-file', '-p', current, base, pending], {
          cwd,
          encoding: 'utf8',
        });
        if (merged.status !== 0)
          throw new Error(
            'Pending guide edits conflict with current protected docs; resolve the maintenance PR'
          );
        await writeFile(`${cwd}/${file.path}`, merged.stdout);
      }
    }
  }
  const installed = lockedSdkVersions(await readFile(`${cwd}/docs/bun.lock`, 'utf8'));
  const pendingLock = input.pendingFiles.find(file => file.path === 'docs/bun.lock')?.after;
  if (pendingLock)
    for (const [name, version] of Object.entries(lockedSdkVersions(pendingLock))) {
      if (!installed[name] || semver.gt(version, installed[name])) installed[name] = version;
    }
  const manifest = pinDocsSdkVersions(
    JSON.parse(await readFile(`${cwd}/docs/package.json`, 'utf8')),
    input.targets,
    installed
  );
  await writeFile(`${cwd}/docs/package.json`, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function captureDocsPatch(cwd: string, input: DocsInput) {
  const paths = [
    ...new Set(
      [
        ...runPreparationCommand('git', ['diff', '--name-only', '-z', input.sourceSha], cwd).split(
          '\0'
        ),
        ...runPreparationCommand(
          'git',
          ['ls-files', '--others', '--exclude-standard', '-z'],
          cwd
        ).split('\0'),
      ].filter(Boolean)
    ),
  ];
  const files = [];
  for (const path of paths) {
    if (!allowedDocsPath(path))
      throw new Error(`Docs maintenance changed an unowned path: ${path}`);
    const before = spawnSync('git', ['show', `${input.sourceSha}:${path}`], {
      cwd,
      encoding: 'utf8',
    });
    files.push({
      path,
      before: before.status === 0 ? before.stdout : null,
      after: (await Bun.file(`${cwd}/${path}`).exists())
        ? await readFile(`${cwd}/${path}`, 'utf8')
        : null,
    });
  }
  return docsPatchSchema.parse({ input, files });
}

export async function commitDocsPatch(github: GitHubReleaseClient, value: unknown) {
  const patch = docsPatchSchema.parse(value);
  const latest = await selectDocsInput(github, String(patch.input.runId));
  requireFreshDocsInput(patch.input, latest);
  for (const file of patch.files) {
    if (
      !allowedDocsPath(file.path) ||
      (await contents(github, file.path, latest.sourceSha)) !== file.before
    )
      throw new Error('Docs patch source or path differs');
    if (file.path === 'docs/package.json') {
      const lock = await contents(github, 'docs/bun.lock', latest.sourceSha);
      if (
        !lock ||
        !file.before ||
        !file.after ||
        JSON.stringify(JSON.parse(file.after)) !==
          JSON.stringify(
            pinDocsSdkVersions(JSON.parse(file.before), latest.targets, lockedSdkVersions(lock))
          )
      )
        throw new Error('Docs manifest changes more than exact verified SDK pins');
    }
  }
  if (!patch.files.length) return { changed: false };
  const commit = await github.request(
    'GET',
    `${repo}/git/commits/${latest.sourceSha}`,
    z.object({ tree: z.object({ sha: sourceShaSchema }) })
  );
  const tree = await github.request(
    'POST',
    `${repo}/git/trees`,
    z.object({ sha: sourceShaSchema }),
    {
      base_tree: commit.tree.sha,
      tree: patch.files.map(file => ({
        path: file.path,
        mode: '100644',
        type: 'blob',
        ...(file.after === null ? { sha: null } : { content: file.after }),
      })),
    }
  );
  const next = await github.request(
    'POST',
    `${repo}/git/commits`,
    z.object({ sha: sourceShaSchema }),
    {
      message: 'docs: align guides and pins with verified SDK releases',
      tree: tree.sha,
      parents: [latest.sourceSha, ...(latest.branchHead ? [latest.branchHead] : [])],
    }
  );
  // Recheck after data preparation; no stale generation may replace newer guide edits.
  requireFreshDocsInput(latest, await selectDocsInput(github, String(patch.input.runId)));
  if (latest.branchHead)
    await github.request(
      'PATCH',
      `${repo}/git/refs/heads/${branch}`,
      z.object({ object: z.object({ sha: sourceShaSchema }) }),
      { sha: next.sha, force: false }
    );
  else
    await github.request(
      'POST',
      `${repo}/git/refs`,
      z.object({ object: z.object({ sha: sourceShaSchema }) }),
      { ref: `refs/heads/${branch}`, sha: next.sha }
    );
  const prs = await github.request(
    'GET',
    `${repo}/pulls?state=open&base=next&head=ComposioHQ:${branch}`,
    z.array(z.object({ number: z.number(), body: z.string().nullable() }))
  );
  const body = `${marker}\n## Summary\nUpdate guides and exact SDK pins from verified source ${latest.verifiedSourceSha}.\n\nThese maintenance changes receive ordinary review and docs example/build checks. Package publication and release completion do not wait for this PR.\n\nVerified publication run: https://github.com/${SDK_RELEASE_REPOSITORY}/actions/runs/${latest.verifiedRunId}`;
  if (prs.length > 1) throw new Error('Multiple SDK docs maintenance PRs are open');
  if (prs[0])
    await github.request(
      'PATCH',
      `${repo}/pulls/${prs[0].number}`,
      z.object({ number: z.number() }),
      { body, title: 'docs: align guides and pins with verified SDK releases' }
    );
  else
    await github.request('POST', `${repo}/pulls`, z.object({ number: z.number() }), {
      head: branch,
      base: 'next',
      title: 'docs: align guides and pins with verified SDK releases',
      body,
    });
  return { changed: true };
}

async function finishDocs(
  github: GitHubReleaseClient,
  runId: string,
  appId: number,
  successful: boolean | undefined,
  maintenance: string
) {
  const run = await github.getRun(runId);
  if (!(await publicationState(github, run)).verified)
    throw new Error('Cannot report docs completion before registry verification');
  const batch = (await committedBatch(github, run.head_sha!))!;
  const previous = await readPublicationStatus(github, batch, appId);
  const pulls = await github.request(
    'GET',
    `${repo}/commits/${run.head_sha}/pulls?per_page=100`,
    z.array(
      z.object({
        number: z.number(),
        merged_at: z.string().nullable(),
        head: z.object({ sha: z.string() }),
      })
    )
  );
  const pull = pulls.find(pull => pull.merged_at && pull.head.sha === run.head_sha);
  if (!pull) throw new Error('Docs status source is not a merged release head');
  const docs =
    successful === true || previous?.docs === 'verified'
      ? 'verified'
      : successful === false
        ? 'failed'
        : (previous?.docs ?? 'pending');
  await writePublicationStatus(
    github,
    batch,
    {
      ...previous,
      runId: run.id,
      sourceSha: run.head_sha!,
      registryVerified: true,
      terminal: false,
      docs,
      candidates: previous?.candidates ?? [],
      inventory: previous?.inventory ?? [],
      detail: `${docs === 'verified' ? 'Live HTML, Markdown, version table and representative SDK references verified.' : 'Current protected docs rebuild/deployment or live verification failed; retry this original run for docs only.'} Guide/pin maintenance: ${maintenance}. Search indexing remains the separate Docs - Sync Algolia Search workflow; its failures require maintenance recovery.`,
    },
    appId,
    pull.number
  );
}

if (import.meta.main) {
  const mode = z
    .enum(['context', 'prepare', 'capture', 'commit', 'live', 'finish', 'deploy'])
    .parse(Bun.argv[2]);
  const inputPath = process.env.SDK_DOCS_INPUT ?? '/tmp/sdk-docs-input.json';
  if (mode === 'prepare' || mode === 'capture' || mode === 'live') {
    const input = docsInputSchema.parse(await Bun.file(inputPath).json());
    if (mode === 'prepare') await prepareDocs(process.cwd(), input);
    else if (mode === 'capture')
      await writeFile(
        '/tmp/sdk-docs-patch.json',
        JSON.stringify(await captureDocsPatch(process.cwd(), input))
      );
    else {
      for (let attempt = 0; ; attempt++) {
        try {
          await verifyLiveReleaseDocs(input.batch);
          break;
        } catch (error) {
          if (attempt === 19) throw error;
          await Bun.sleep(30_000);
        }
      }
    }
  } else if (mode === 'deploy') {
    const hook = process.env.VERCEL_DOCS_NEXT_DEPLOY_HOOK;
    if (!hook)
      throw new Error('Configure the protected-next Vercel docs deploy hook before docs recovery');
    const url = new URL(hook);
    if (
      url.origin !== 'https://api.vercel.com' ||
      !url.pathname.startsWith('/v1/integrations/deploy/')
    )
      throw new Error('Invalid native Vercel deploy hook');
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok)
      throw new Error(`Current protected docs deployment request failed (${response.status})`);
    console.log('Requested a native Vercel build of the configured protected next branch.');
  } else {
    const github = new GitHubReleaseClient(z.string().min(1).parse(process.env.SDK_RELEASE_TOKEN));
    if (mode === 'context') {
      const actor = z.string().min(1).parse(process.env.GITHUB_ACTOR);
      const app = z.string().min(1).parse(process.env.SDK_RELEASE_APP_SLUG);
      if (actor !== `${app}[bot]`) await github.requireActiveMember(actor);
      const runId = z
        .string()
        .regex(/^[1-9][0-9]*$/)
        .parse(process.env.SDK_DOCS_RUN_ID);
      const input = await selectDocsInput(github, runId);
      await writeFile(inputPath, JSON.stringify(input));
      await writeFile(
        z.string().parse(process.env.GITHUB_OUTPUT),
        `source-sha=${input.sourceSha}\n`,
        { flag: 'a' }
      );
    } else if (mode === 'commit')
      await commitDocsPatch(github, await Bun.file('/tmp/sdk-docs-patch.json').json());
    else
      await finishDocs(
        github,
        z.string().parse(process.env.SDK_DOCS_RUN_ID),
        z.coerce.number().int().positive().parse(process.env.SDK_RELEASE_APP_ID),
        process.env.SDK_DOCS_LIVE_RESULT === 'maintenance'
          ? undefined
          : process.env.SDK_DOCS_LIVE_RESULT === 'success',
        process.env.SDK_DOCS_MAINTENANCE_RESULT ?? 'pending'
      );
  }
}
