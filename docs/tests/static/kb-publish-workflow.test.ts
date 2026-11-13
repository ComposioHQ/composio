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
};

function runStep(name: string, root: string, env: Record<string, string> = {}) {
  const definition = workflows.publish.jobs.publish!;
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
      GUIDE_SLUG: 'sdk-example',
      ...env,
    },
  });
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'kb-publication-'));
  mkdirSync(join(root, 'bin'));
  writeFileSync(join(root, 'bin/bun'), `#!/bin/bash
set -euo pipefail
if [ "$2" = verify:kb ]; then
  cat "$FIXTURE_ROOT/report.json"
  exit "\${VERIFY_EXIT:-0}"
fi
`, { mode: 0o755 });
  return root;
}

describe('KB publication workflow', () => {
  test('opens a PR for review and never merges it or waits on other KB PRs', () => {
    const steps = workflows.publish.jobs.publish!.steps;
    const raw = readFileSync(resolve(process.cwd(), '..', '.github/workflows/docs-kb-publish.yml'), 'utf8');

    expect(steps.map(step => step.name)).not.toContain('Wait for earlier KB publications');
    expect(steps.map(step => step.name)).not.toContain('Merge once checks pass');
    expect(raw).not.toContain('gh pr merge');
    expect(raw).not.toContain('docs/content/kb/');
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

  test('allows a proposal when only another guide has support-facing prose', () => {
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
