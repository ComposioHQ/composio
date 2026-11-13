#!/usr/bin/env bun
/**
 * Local end-to-end run of KB publication, docs side: `bun run test:kb-publish` from docs/.
 *
 * It replays what happens after the support portal sends `kb-guide-approved`, using the real
 * steps from .github/workflows/docs-kb-publish.yml (same scripts, same bash flags as Actions):
 *   1. two portal dispatches, each applied on its own branch off this checkout's HEAD (= two KB PRs);
 *   2. both "PRs" merged into the base in turn (proves open KB PRs don't conflict);
 *   3. the merged KB regenerated, and the new guides looked up through Ask AI's search_docs and read_doc.
 * Everything happens in a throwaway git worktree; this checkout is never modified.
 * Pass --keep to leave the worktree for previewing (it prints the path). `next dev` there needs a real
 * node_modules, not this symlink: `rm node_modules && cp -cR <docs>/node_modules node_modules` on macOS.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repo = resolve(import.meta.dir, '../../..');
const keep = process.argv.includes('--keep');
const runDir = mkdtempSync(join(tmpdir(), 'kb-e2e-'));
const work = join(runDir, 'repo');
// Branches live in the shared repo, so each run gets its own names.
const prefix = `kb-e2e/${runDir.split('-').at(-1)}`;
const base = `${prefix}/base`;
const prBranch = (draftId: number) => `${prefix}/docs/kb-front-desk-${draftId}`;
const branches = () => [base, ...dispatches.map(({ draft_id }) => prBranch(draft_id))];
const docs = join(work, 'docs');
const runnerTemp = mkdtempSync(join(tmpdir(), 'kb-e2e-runner-'));

// The guide objects exactly as core/knowledge/kb.py `_checked()` builds them for client_payload.guide.
const dispatches = [
  {
    draft_id: 9001,
    guide: {
      action: 'upsert', slug: 'sdk-e2e-webhook-retries', area: 'sdk',
      title: 'Webhook delivery retries',
      description: 'How trigger webhook deliveries are retried after a failed response.',
      body: '## When a delivery is retried\n\nA trigger webhook delivery is retried when your endpoint returns a 5xx status or times out.\n\n## Making your handler idempotent\n\nUse the event ID to ignore a delivery you already processed.',
      topics: ['workflows'], tags: ['triggers', 'webhooks'],
    },
  },
  {
    draft_id: 9002,
    guide: {
      action: 'upsert', slug: 'platform-e2e-session-limits', area: 'platform',
      title: 'Session tool call limits',
      description: 'What happens when a session reaches its tool call limit.',
      body: '## Hitting the limit\n\nA session that reaches its tool call limit returns a limit error for further calls.\n\n## Starting a new session\n\nCreate a new session for the user to continue.',
      topics: ['sessions-and-execution'], tags: ['sessions'],
    },
  },
];

type Step = { name: string; run?: string };
const workflow = Bun.YAML.parse(
  readFileSync(join(repo, '.github/workflows/docs-kb-publish.yml'), 'utf8'),
) as { jobs: { publish: { steps: Step[] } } };

function sh(command: string, args: string[], cwd: string, env: Record<string, string> = {}) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
  return { ok: result.status === 0, out: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() };
}
function must(command: string, args: string[], cwd = work, env: Record<string, string> = {}) {
  const result = sh(command, args, cwd, env);
  if (!result.ok) throw new Error(`${command} ${args.join(' ')} failed:\n${result.out}`);
  return result.out;
}
function workflowStep(name: string, env: Record<string, string>) {
  const script = workflow.jobs.publish.steps.find(step => step.name === name)?.run;
  if (!script) throw new Error(`docs-kb-publish.yml has no step "${name}"`);
  // The job's default shell is bash, which Actions runs with -e -o pipefail.
  return sh('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script], docs, {
    RUNNER_TEMP: runnerTemp, ...env,
  });
}

let failed = false;
const check = (ok: boolean, label: string, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `\n      ${detail.replaceAll('\n', '\n      ')}` : ''}`);
  if (!ok) failed = true;
};

try {
  must('git', ['-C', repo, 'worktree', 'add', '-q', '--detach', work, 'HEAD'], repo);
  symlinkSync(join(repo, 'docs/node_modules'), join(docs, 'node_modules'));
  must('git', ['switch', '-q', '-c', base]);
  const git = ['-c', 'user.name=kb-e2e', '-c', 'user.email=kb-e2e@localhost', '-c', 'commit.gpgsign=false'];

  // 1. Each dispatch becomes its own PR branch, built by the workflow's own steps.
  for (const { draft_id, guide } of dispatches) {
    const branch = prBranch(draft_id);
    must('git', ['switch', '-q', '-c', branch, base]);
    const apply = workflowStep('Apply the approved guide', { GUIDE: JSON.stringify(guide) });
    check(apply.ok, `${branch}: "Apply the approved guide"`, apply.ok ? '' : apply.out.slice(-1500));
    const regenerate = workflowStep('Regenerate KB pages', { GUIDE_SLUG: guide.slug });
    const errors = regenerate.ok ? [] : (() => {
      try {
        const report = JSON.parse(readFileSync(join(runnerTemp, 'kb-verify.json'), 'utf8')) as {
          findings: { severity: string; kind: string }[];
        };
        const counts = new Map<string, number>();
        for (const finding of report.findings.filter(item => item.severity === 'error')) {
          counts.set(finding.kind, (counts.get(finding.kind) ?? 0) + 1);
        }
        return [...counts].map(([kind, count]) => `${count} x ${kind}`);
      } catch {
        return [regenerate.out.slice(-1500)];
      }
    })();
    check(regenerate.ok, `${branch}: "Regenerate KB pages" (the PR is only opened if this passes)`,
      regenerate.ok ? '' : `verify:kb errors: ${errors.join(', ')}`);
    // Stage what create-pull-request would (add-paths: docs/kb/).
    must('git', ['add', 'docs/kb']);
    const files = must('git', ['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
    const ownPaths = [guide.slug, `${guide.area}/${guide.slug.slice(guide.area.length + 1)}/`];
    check(files.every(file => ownPaths.some(path => file.includes(path))),
      `${branch}: the PR only touches this guide's own files`, files.join('\n'));
    must('git', [...git, 'commit', '-q', '-m', `docs(kb): ${guide.title}`]);
  }

  // 2. Both PRs wait for review side by side, then merge in turn.
  must('git', ['switch', '-q', base]);
  for (const { draft_id } of dispatches) {
    const merge = sh('git', [...git, 'merge', '-q', '--no-edit', prBranch(draft_id)], work);
    check(merge.ok, `merge ${prBranch(draft_id)} after the other`, merge.ok ? '' : merge.out);
  }

  // 3. After merge, the build regenerates content/kb and Ask AI's index and finds the guides.
  must('bun', ['run', 'generate:kb'], docs);
  must('bun', ['scripts/build-agent-index.ts'], docs);
  const probe = must('bun', ['-e', `
    const { searchDocs } = await import('./agent/lib/docs-search.ts');
    const { readPageByUrl } = await import('./agent/lib/docs.ts');
    const queries = ${JSON.stringify(dispatches.map(({ guide }) => [guide.slug, guide.title]))};
    console.log(JSON.stringify(queries.map(([slug, title]) => ({
      slug,
      found: searchDocs(title, { limit: 5 }).results.some(r => r.url === '/kb/guide/' + slug),
      readable: readPageByUrl('/kb/guide/' + slug)?.title === title,
    }))));
  `], docs, { EVE_FORCE_BUNDLE: '1' });
  for (const result of JSON.parse(probe.split('\n').at(-1)!) as { slug: string; found: boolean; readable: boolean }[]) {
    check(result.found, `Ask AI search_docs finds /kb/guide/${result.slug} (deployed bundle)`);
    check(result.readable, `Ask AI read_doc opens /kb/guide/${result.slug}`);
  }
} catch (error) {
  check(false, 'run aborted', String(error));
} finally {
  if (keep) {
    console.log(`\nWorktree kept at ${work}\nPreview: cd ${docs} && bun run dev, then open /kb/guide/${dispatches[0]!.guide.slug}`);
    console.log(`Remove with: git -C ${repo} worktree remove --force ${work} && git -C ${repo} branch -D ${branches().join(' ')}`);
  } else {
    sh('git', ['-C', repo, 'worktree', 'remove', '--force', work], repo);
    sh('git', ['-C', repo, 'branch', '-D', ...branches()], repo);
  }
  rmSync(runnerTemp, { recursive: true, force: true });
}
console.log(failed ? '\nE2E FAILED' : '\nE2E PASSED');
process.exit(failed ? 1 : 0);
