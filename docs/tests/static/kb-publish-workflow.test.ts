import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';

const workflowSchema = z.object({
  jobs: z.record(z.string(), z.object({
    defaults: z.object({ run: z.object({ shell: z.string().optional() }) }).optional(),
    steps: z.array(z.object({ name: z.string(), run: z.string().optional(), shell: z.string().optional() })),
  })),
});
const workflows = {
  publish: workflowSchema.parse(Bun.YAML.parse(readFileSync(
    resolve(process.cwd(), '..', '.github/workflows/docs-kb-publish.yml'), 'utf8',
  ))),
  refresh: workflowSchema.parse(Bun.YAML.parse(readFileSync(
    resolve(process.cwd(), '..', '.github/workflows/docs-update-kb.yml'), 'utf8',
  ))),
};

function runStep(
  name: string, root: string, env: Record<string, string> = {}, job: 'publish' | 'refresh' = 'publish',
) {
  const definition = workflows[job].jobs[job]!;
  const step = definition.steps.find(step => step.name === name);
  const script = step?.run;
  if (!script) throw new Error(`Missing workflow step: ${name}`);
  // Match the Actions runner: implicit bash omits pipefail; explicit bash enables it.
  const shell = step?.shell ?? definition.defaults?.run.shell;
  const shellFlags = shell === 'bash' ? ['--noprofile', '--norc', '-e', '-o', 'pipefail'] : ['-e'];
  return spawnSync('bash', [...shellFlags, '-c', script], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${join(root, 'bin')}:${process.env.PATH}`,
      FIXTURE_ROOT: root,
      RUNNER_TEMP: root,
      GH_REPO: 'ComposioHQ/composio',
      PUBLISH_BRANCH: job === 'publish' ? 'docs/kb-front-desk-2' : 'docs/auto-update-kb',
      GUIDE_SLUG: 'sdk-example',
      ...env,
    },
  });
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'kb-publication-'));
  mkdirSync(join(root, 'bin'));
  writeFileSync(join(root, 'calls'), '');
  writeFileSync(join(root, 'sleeps'), '');
  writeFileSync(join(root, 'bin/gh'), `#!/bin/bash
set -euo pipefail
echo called >> "$FIXTURE_ROOT/calls"
if [ "\${FAIL_API:-false}" = true ]; then exit 1; fi
if [[ " $* " == *" --paginate "* ]]; then
  cat "$FIXTURE_ROOT/current.jsonl"
else
  head -n 1 "$FIXTURE_ROOT/current.jsonl"
fi | jq -r "\${@: -1}"
`, { mode: 0o755 });
  writeFileSync(join(root, 'bin/sleep'), `#!/bin/bash
set -euo pipefail
echo slept >> "$FIXTURE_ROOT/sleeps"
if [ -f "$FIXTURE_ROOT/after.jsonl" ]; then
  cp "$FIXTURE_ROOT/after.jsonl" "$FIXTURE_ROOT/current.jsonl"
fi
`, { mode: 0o755 });
  writeFileSync(join(root, 'bin/bun'), `#!/bin/bash
set -euo pipefail
if [ "$2" = verify:kb ]; then
  cat "$FIXTURE_ROOT/report.json"
  exit "\${VERIFY_EXIT:-0}"
fi
`, { mode: 0o755 });
  return root;
}

const earlierPublication = {
  head: { ref: 'docs/kb-front-desk-1', repo: { full_name: 'ComposioHQ/composio' } },
  html_url: 'https://github.com/ComposioHQ/composio/pull/1',
};

describe('KB publication workflow', () => {
  test('waits for an earlier publication across pages while allowing the current draft and unrelated PRs', () => {
    const root = fixture();
    try {
      const unrelated = { head: { ref: 'docs/unrelated' }, html_url: 'unrelated' };
      const currentDraft = { head: { ref: 'docs/kb-front-desk-2', repo: { full_name: 'ComposioHQ/composio' } }, html_url: 'current' };
      writeFileSync(join(root, 'current.jsonl'),
        `${JSON.stringify([unrelated, currentDraft])}\n${JSON.stringify([earlierPublication])}\n`);
      writeFileSync(join(root, 'after.jsonl'), `${JSON.stringify([unrelated, currentDraft])}\n`);

      const result = runStep('Wait for earlier KB publications', root);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain(earlierPublication.html_url);
      expect(result.stdout).not.toContain('unrelated');
      expect(result.stdout).not.toContain('current');
      expect(readFileSync(join(root, 'calls'), 'utf8').trim().split('\n')).toHaveLength(2);
      expect(readFileSync(join(root, 'sleeps'), 'utf8').trim().split('\n')).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test.each(['publish', 'refresh'] as const)('%s ignores fork PRs that imitate publication branches', job => {
    const root = fixture();
    try {
      const forkPrs = ['docs/kb-front-desk-hold', 'docs/auto-update-kb'].map(ref => ({
        head: { ref, repo: { full_name: 'outsider/composio' } }, html_url: 'fork-pr',
      }));
      writeFileSync(join(root, 'current.jsonl'), JSON.stringify(forkPrs));
      const result = runStep('Wait for earlier KB publications', root, {}, job);
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('fork-pr');
      expect(readFileSync(join(root, 'sleeps'), 'utf8')).toBe('');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test.each([
    ['publish', 'docs/auto-update-kb'],
    ['refresh', 'docs/kb-front-desk-1'],
  ] as const)('%s waits for the other publication path to merge', (job, ref) => {
    const root = fixture();
    try {
      writeFileSync(join(root, 'current.jsonl'), JSON.stringify([{
        head: { ref, repo: { full_name: 'ComposioHQ/composio' } }, html_url: 'earlier-kb-publication',
      }]));
      writeFileSync(join(root, 'after.jsonl'), '[]');
      const result = runStep('Wait for earlier KB publications', root, {}, job);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('earlier-kb-publication');
      expect(readFileSync(join(root, 'calls'), 'utf8').trim().split('\n')).toHaveLength(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('fails with a recovery instruction when an earlier publication stays open', () => {
    const root = fixture();
    try {
      writeFileSync(join(root, 'current.jsonl'), `${JSON.stringify([earlierPublication])}\n`);

      const result = runStep('Wait for earlier KB publications', root);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Merge or close them, then rerun this workflow.');
      expect(readFileSync(join(root, 'calls'), 'utf8').trim().split('\n')).toHaveLength(60);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('stops on an API failure instead of assuming no earlier publication exists', () => {
    const root = fixture();
    try {
      const result = runStep('Wait for earlier KB publications', root, { FAIL_API: 'true' });

      expect(result.status).toBe(1);
      expect(readFileSync(join(root, 'calls'), 'utf8').trim().split('\n')).toHaveLength(1);
      expect(readFileSync(join(root, 'sleeps'), 'utf8')).toBe('');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('blocks support-facing prose even when verification reports it as a warning', () => {
    const root = fixture();
    try {
      writeFileSync(join(root, 'report.json'), JSON.stringify({
        findings: [{ severity: 'warning', kind: 'unedited-support-prose', guideSlug: 'sdk-example' }],
      }));

      const result = runStep('Regenerate KB pages', root);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Rewrite it for public readers');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('allows an approval when only another guide has support-facing prose', () => {
    const root = fixture();
    try {
      writeFileSync(join(root, 'report.json'), JSON.stringify({
        findings: [{ severity: 'warning', kind: 'unedited-support-prose', guideSlug: 'other-guide' }],
      }));
      expect(runStep('Regenerate KB pages', root).status).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('allows advisory review cohorts while retaining verification errors', () => {
    const root = fixture();
    try {
      writeFileSync(join(root, 'report.json'), JSON.stringify({
        findings: [{ severity: 'warning', kind: 'review-window-cliff' }],
      }));
      expect(runStep('Regenerate KB pages', root).status).toBe(0);

      writeFileSync(join(root, 'report.json'), JSON.stringify({
        findings: [{ severity: 'error', kind: 'unknown-tool-slug' }],
      }));
      expect(runStep('Regenerate KB pages', root, { VERIFY_EXIT: '1' }).status).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
