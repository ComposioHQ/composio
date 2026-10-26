import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';

const workflow = z.object({
  jobs: z.object({
    publish: z.object({
      steps: z.array(z.object({ name: z.string(), run: z.string().optional() })),
    }),
  }),
}).parse(Bun.YAML.parse(readFileSync(
  resolve(process.cwd(), '..', '.github/workflows/docs-kb-publish.yml'),
  'utf8',
)));

function runStep(name: string, root: string, env: Record<string, string> = {}) {
  const script = workflow.jobs.publish.steps.find(step => step.name === name)?.run;
  if (!script) throw new Error(`Missing workflow step: ${name}`);
  return spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${join(root, 'bin')}:${process.env.PATH}`,
      FIXTURE_ROOT: root,
      RUNNER_TEMP: root,
      GH_REPO: 'ComposioHQ/composio',
      PUBLISH_BRANCH: 'docs/kb-front-desk-2',
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
  head: { ref: 'docs/kb-front-desk-1' },
  html_url: 'https://github.com/ComposioHQ/composio/pull/1',
};

describe('KB publication workflow', () => {
  test('waits for an earlier publication across pages while allowing the current draft and unrelated PRs', () => {
    const root = fixture();
    try {
      const unrelated = { head: { ref: 'docs/unrelated' }, html_url: 'unrelated' };
      const currentDraft = { head: { ref: 'docs/kb-front-desk-2' }, html_url: 'current' };
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

  test('fails with a recovery instruction when an earlier publication stays open', () => {
    const root = fixture();
    try {
      writeFileSync(join(root, 'current.jsonl'), `${JSON.stringify([earlierPublication])}\n`);

      const result = runStep('Wait for earlier KB publications', root);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Merge or close them, then rerun this approval.');
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
        findings: [{ severity: 'warning', kind: 'unedited-support-prose' }],
      }));

      const result = runStep('Regenerate KB pages', root);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Rewrite it for public readers');
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
